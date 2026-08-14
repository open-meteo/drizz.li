import { get } from 'svelte/store';

import {
	type GeoLocation,
	defaultLocation,
	hasStoredLocation,
	locationKnown,
	setActiveLocation,
	storedLocation
} from '$lib/stores/settings';

import { coordinateLocation } from '$lib/utils/location';

import { getLocale } from '$lib/paraglide/runtime';

/** What `/api/geo` answers with (see worker/index.ts). */
export interface EdgeGeo {
	city?: string;
	country?: string;
	region?: string;
	timezone?: string;
	latitude?: number;
	longitude?: number;
}

const GEO_ENDPOINT = '/api/geo';

/** The first redirect waits on this, so it gets a short leash. */
const GEO_TIMEOUT_MS = 2500;

/**
 * How far a geocoding hit may sit from the point Cloudflare gave before it is
 * treated as a different place with the same name - "Springfield" resolving to
 * the wrong continent is the failure mode this guards against. Generous,
 * because the point is an IP estimate, not a fix.
 */
const MAX_MATCH_KM = 250;

/** Cloudflare's estimate for this visitor, or null when it has none. */
export async function fetchEdgeGeo(): Promise<EdgeGeo | null> {
	try {
		const response = await fetch(GEO_ENDPOINT, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(GEO_TIMEOUT_MS)
		});
		// 204 is "Cloudflare could not place this request"; any other non-OK
		// status means the site is not being served by the Worker at all (a plain
		// static host, `vite preview`), which is a supported way to run it rather
		// than an error worth reporting.
		if (response.status === 204 || !response.ok) return null;

		const geo = (await response.json()) as EdgeGeo;
		return geo?.city || Number.isFinite(geo?.latitude) ? geo : null;
	} catch {
		// offline, blocked, or slower than the leash above
		return null;
	}
}

const EARTH_RADIUS_KM = 6371;

function distanceKm(
	a: { latitude: number; longitude: number },
	b: { latitude: number; longitude: number }
): number {
	const toRad = Math.PI / 180;
	const dLat = (b.latitude - a.latitude) * toRad;
	const dLon = (b.longitude - a.longitude) * toRad;
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(a.latitude * toRad) * Math.cos(b.latitude * toRad) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Turns a name into the right place.
 *
 * Cloudflare gives a city name and a point; the geocoder answers a name with
 * every city that carries it, ordered by population. Those two disagree often
 * enough to matter - there are more than twenty places called "Vancouver" - so
 * the country narrows the field and the point picks the winner.
 *
 * Exported for the tests; `detectLocation` is the entry point.
 */
export function pickNearest(results: unknown[], geo: EdgeGeo): GeoLocation | null {
	const candidates = results.filter(
		(result): result is GeoLocation =>
			typeof result === 'object' &&
			result !== null &&
			typeof (result as GeoLocation).name === 'string' &&
			Number.isFinite((result as GeoLocation).latitude) &&
			Number.isFinite((result as GeoLocation).longitude)
	);
	if (candidates.length === 0) return null;

	const point =
		geo.latitude != null && geo.longitude != null
			? { latitude: geo.latitude, longitude: geo.longitude }
			: null;
	const nearestTo = (from: { latitude: number; longitude: number }, list: GeoLocation[]) =>
		list.reduce((best, candidate) =>
			distanceKm(from, candidate) < distanceKm(from, best) ? candidate : best
		);

	// A country match is the stronger signal of the two: it is exact, where the
	// point is an estimate that a VPN or a mobile network can put a few hundred
	// kilometres out. With the name and the country agreeing, the point only has
	// to break ties between them.
	const inCountry = geo.country
		? candidates.filter((candidate) => candidate.country_code === geo.country)
		: [];
	if (inCountry.length > 0) {
		return point ? nearestTo(point, inCountry) : inCountry[0];
	}

	// Nothing but the point confirms the name now, so it has to be close - and
	// with no point either, a name on its own is not enough to move a visitor.
	if (!point) return null;
	const nearest = nearestTo(point, candidates);
	return distanceKm(point, nearest) <= MAX_MATCH_KM ? nearest : null;
}

async function geocodeCity(geo: EdgeGeo): Promise<GeoLocation | null> {
	if (!geo.city) return null;

	const query = new URLSearchParams({
		name: geo.city,
		count: '10',
		language: getLocale(),
		format: 'json'
	});

	try {
		const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${query}`, {
			signal: AbortSignal.timeout(GEO_TIMEOUT_MS)
		});
		if (!response.ok) return null;

		const body = await response.json();
		return pickNearest(Array.isArray(body?.results) ? body.results : [], geo);
	} catch {
		return null;
	}
}

/**
 * The visitor's location according to Cloudflare, as a full location record.
 *
 * Null when there is nothing to go on. Nothing here is precise - it is an IP
 * estimate, roughly city-level, and no substitute for the GPS option in the
 * search box.
 */
export async function detectLocation(): Promise<GeoLocation | null> {
	const geo = await fetchEdgeGeo();
	if (!geo) return null;

	const city = await geocodeCity(geo);
	if (city) return city;

	// Either Cloudflare had no name, or nothing in the geocoder sits near the
	// point it gave. The coordinates alone still produce the right forecast,
	// just under a "47.37°N 8.54°E" heading instead of a city one.
	if (geo.latitude != null && geo.longitude != null) {
		return { ...coordinateLocation(geo.latitude, geo.longitude), timezone: geo.timezone ?? 'UTC' };
	}
	return null;
}

/** One detection per page load, however many redirect stubs ask for it. */
let detection: Promise<GeoLocation | null> | undefined;

/**
 * The location to open when the URL does not name one - what `/weather/week/`
 * and its siblings redirect to.
 *
 * A visitor who has been here before gets the place they last looked at. A
 * first-time visitor gets the one Cloudflare derives from their request, and
 * only falls back to the default city when that comes up empty.
 */
export async function initialLocation(): Promise<GeoLocation> {
	if (hasStoredLocation()) {
		locationKnown.set(true);
		return get(storedLocation);
	}

	detection ??= detectLocation();
	const location = (await detection) ?? defaultLocation;
	// Set here rather than left to the page being redirected to: the topbar
	// would otherwise show the default city for the length of that navigation.
	setActiveLocation(location);
	return location;
}
