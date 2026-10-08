import { error, redirect } from '@sveltejs/kit';

import {
	deLocalizeHref,
	extractLocaleFromUrl,
	getLocale,
	localizeHref
} from '$lib/paraglide/runtime';

import locationAliases from './location-aliases.json';

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
	return locationRoute + '_' + location.id;
}

// Pin existing popular-city URLs to GeoNames IDs. These aliases are migration
// entry points; generated routes always retain the ID, regardless of population.
export function legacyLocationId(slug: string): number | undefined {
	return Object.hasOwn(locationAliases, slug)
		? locationAliases[slug as keyof typeof locationAliases]
		: undefined;
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
 * Geocoding results by locale and ID, kept for the life of the process.
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
	// Read the destination URL on both server and client. getLocaleForUrl skips
	// the URL strategy during SSR and would fall back to English.
	const language = extractLocaleFromUrl(event.url) ?? getLocale();

	let urlLocationName: string;
	let urlLocationId: string | undefined;

	if (urlLocation.includes('_')) {
		const splitAt = urlLocation.lastIndexOf('_');
		urlLocationName = urlLocation.slice(0, splitAt);
		urlLocationId = urlLocation.slice(splitAt + 1);
		if (!/^\d+$/.test(urlLocationId)) error(404, 'Location not found');
	} else if (/^\d+$/.test(urlLocation)) {
		urlLocationName = '';
		urlLocationId = urlLocation;
	} else {
		urlLocationName = urlLocation.includes('-') ? urlLocation.replace(/-/g, ' ') : urlLocation;
		urlLocationId = legacyLocationId(urlLocation)?.toString();
	}

	if (urlLocationId) {
		const cached = resolvedLocations.get(`${language}:${Number(urlLocationId)}`);
		if (cached) return finishResolve(cached, routePrefix, event);
	}

	let location: GeoLocation;

	// route params are attacker-controlled: ids must be numeric and names are
	// URL-encoded so nothing can be injected into the API query string
	if (urlLocationId && /^\d+$/.test(urlLocationId)) {
		const response = await event.fetch(
			`https://geocoding-api.open-meteo.com/v1/get?id=${encodeURIComponent(urlLocationId)}&language=${encodeURIComponent(language)}`
		);
		if (!response.ok) error(response.status, `Geocoding request failed (${response.status})`);
		const candidate: unknown = await response.json();
		if (!isGeoLocation(candidate) || candidate.id !== Number(urlLocationId)) {
			error(404, 'Location not found');
		}
		location = candidate;
	} else {
		const response = await event.fetch(
			`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(urlLocationName)}&count=1&language=${encodeURIComponent(language)}&format=json`
		);
		if (!response.ok) error(response.status, `Geocoding request failed (${response.status})`);
		const geocodingResponse: unknown = await response.json();
		const results = (geocodingResponse as { results?: unknown[] } | null)?.results;
		const candidate = Array.isArray(results) ? results[0] : undefined;
		if (!isGeoLocation(candidate)) error(404, 'Location not found');
		location = candidate;
	}

	resolvedLocations.set(`${language}:${location.id}`, location);
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
	// URL.pathname is percent-encoded, including characters in localized names.
	const canonicalPath = new URL(
		`${routePrefix}${encodeURIComponent(buildLocationRoute(location))}/`,
		event.url
	).pathname;
	if (deLocalizeHref(event.url.pathname) !== canonicalPath) {
		throw redirect(
			303,
			localizeHref(canonicalPath, { locale: extractLocaleFromUrl(event.url) ?? getLocale() }) +
				event.url.search +
				event.url.hash
		);
	}

	return location;
}
