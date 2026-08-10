import { error, redirect } from '@sveltejs/kit';

import { deLocalizeHref, localizeHref } from '$lib/paraglide/runtime';

import type { GeoLocation } from '$lib/stores/settings';

export const geoLocationNameToRoute = (name: string) => {
	const lowerCase = name.toLowerCase().replaceAll(' ', '-');
	return lowerCase.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

// coordinate routes look like "52.52N13.41E" (negative values for S/W); GPS
// selections navigate here directly, no geocoding id involved
const COORD_ROUTE = /^(-?\d+(?:\.\d+)?)N(-?\d+(?:\.\d+)?)E$/i;

/** Only the fields the route is built from, so callers holding a partial record
 * (the nearby-cities list, for one) don't have to fake a whole GeoLocation. */
export type RoutableLocation = Pick<
	GeoLocation,
	'id' | 'name' | 'latitude' | 'longitude' | 'feature_code' | 'population'
>;

export function buildLocationRoute(location: RoutableLocation): string {
	// coordinate-only locations (GPS) have no real geocoding id
	if (location.feature_code === 'COORD' || !location.id) {
		return `${location.latitude.toFixed(4)}N${location.longitude.toFixed(4)}E`;
	}
	const locationRoute = geoLocationNameToRoute(location.name);
	if (location.population && location.population > 543000) {
		return locationRoute;
	}
	return locationRoute + '_' + location.id;
}

export const coordinateLocation = (latitude: number, longitude: number): GeoLocation => ({
	id: 0,
	name: `${latitude.toFixed(2)}°N ${longitude.toFixed(2)}°E`,
	latitude,
	longitude,
	elevation: 0,
	feature_code: 'COORD',
	country_code: undefined,
	admin1_id: undefined,
	admin3_id: undefined,
	admin4_id: undefined,
	timezone: 'UTC',
	population: undefined,
	postcodes: undefined,
	country_id: undefined,
	country: undefined,
	admin1: undefined,
	admin3: undefined,
	admin4: undefined
});

// the geocoding API response is untrusted input: it can be an error object or
// (with a crafted URL) something else entirely, so the shape is checked before
// anything downstream dereferences it
const isGeoLocation = (value: unknown): value is GeoLocation => {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.name === 'string' &&
		typeof candidate.id === 'number' &&
		Number.isFinite(candidate.latitude) &&
		Number.isFinite(candidate.longitude)
	);
};

interface ResolveLocationOptions {
	urlLocation: string;
	routePrefix: string;
	event: {
		fetch: typeof fetch;
		url: URL;
	};
}

/**
 * Geocoding results for a route segment, kept for the life of the process.
 *
 * A city's coordinates do not change, and the same segment is resolved over and
 * over: once per per-location route during the prerender (five builds of the
 * same lookup for every city), and again on every client-side hop from a city's
 * week page to its comparison or archive.
 */
const resolvedLocations = new Map<string, GeoLocation>();

export async function resolveLocationFromRoute({
	urlLocation,
	routePrefix,
	event
}: ResolveLocationOptions): Promise<GeoLocation> {
	const coordMatch = urlLocation.match(COORD_ROUTE);
	if (coordMatch) {
		return coordinateLocation(parseFloat(coordMatch[1]), parseFloat(coordMatch[2]));
	}

	// The canonical-path check below still has to run per call (the same city is
	// reached under different route prefixes), so only the lookup is cached.
	const cached = resolvedLocations.get(urlLocation);
	if (cached) return finishResolve(cached, routePrefix, event);

	let urlLocationName: string;
	let urlLocationId: string | undefined;

	if (urlLocation.includes('_')) {
		const split = urlLocation.split('_');
		urlLocationName = split[0];
		urlLocationId = split[1];
	} else if (/^\d+$/.test(urlLocation)) {
		urlLocationName = '';
		urlLocationId = urlLocation;
	} else {
		urlLocationName = urlLocation.includes('-') ? urlLocation.replace(/-/g, ' ') : urlLocation;
		urlLocationId = undefined;
	}

	let location: GeoLocation;

	// route params are attacker-controlled: ids must be numeric and names are
	// URL-encoded so nothing can be injected into the API query string
	if (urlLocationId && /^\d+$/.test(urlLocationId)) {
		const res = await event.fetch(
			`https://geocoding-api.open-meteo.com/v1/get?id=${encodeURIComponent(urlLocationId)}`
		);
		if (!res.ok) error(404, 'Location not found');
		const candidate = await res.json();
		if (!isGeoLocation(candidate)) error(404, 'Location not found');
		location = candidate;
	} else {
		const res = await event.fetch(
			`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(urlLocationName)}&count=1&language=en&format=json`
		);
		if (!res.ok) error(404, 'Location not found');
		const geocodingResponse = await res.json();
		const candidate = geocodingResponse?.results?.[0];
		if (!isGeoLocation(candidate)) error(404, 'Location not found');
		location = candidate;
	}

	resolvedLocations.set(urlLocation, location);
	return finishResolve(location, routePrefix, event);
}

function finishResolve(
	location: GeoLocation,
	routePrefix: string,
	event: ResolveLocationOptions['event']
): GeoLocation {
	// trailingSlash is 'always' (see routes/+layout.ts), so the router serves
	// every path with a trailing slash. Match that here or the equality check
	// never holds and the redirect loops forever. The comparison also has to
	// ignore the locale prefix the URL carries, while the redirect keeps it -
	// otherwise every localized URL would bounce back to English.
	const canonicalPath = `${routePrefix}${buildLocationRoute(location)}/`;
	if (deLocalizeHref(event.url.pathname) !== canonicalPath) {
		throw redirect(303, localizeHref(canonicalPath));
	}

	return location;
}
