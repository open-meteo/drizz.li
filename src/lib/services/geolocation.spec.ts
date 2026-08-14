import { describe, expect, it } from 'vitest';

import { type EdgeGeo, pickNearest } from './geolocation';

import type { GeoLocation } from '$lib/stores/settings';

const city = (name: string, latitude: number, longitude: number, code: string): GeoLocation =>
	({ id: 1, name, latitude, longitude, country_code: code }) as GeoLocation;

// every "Vancouver" the geocoder knows about, roughly in its own order
const VANCOUVER_BC = city('Vancouver', 49.2497, -123.1193, 'CA');
const VANCOUVER_WA = city('Vancouver', 45.6387, -122.6615, 'US');

describe('pickNearest', () => {
	it('takes the candidate closest to the point Cloudflare gave', () => {
		const geo: EdgeGeo = { city: 'Vancouver', latitude: 45.62, longitude: -122.67 };

		expect(pickNearest([VANCOUVER_BC, VANCOUVER_WA], geo)).toBe(VANCOUVER_WA);
	});

	it('narrows to the country before comparing distances', () => {
		// the point sits closer to the Washington one, but the country is exact
		const geo: EdgeGeo = { city: 'Vancouver', country: 'CA', latitude: 46.5, longitude: -122.7 };

		expect(pickNearest([VANCOUVER_BC, VANCOUVER_WA], geo)).toBe(VANCOUVER_BC);
	});

	it('rejects a same-named city on the other side of the world', () => {
		const geo: EdgeGeo = { city: 'Vancouver', latitude: 52.52, longitude: 13.41 };

		expect(pickNearest([VANCOUVER_BC, VANCOUVER_WA], geo)).toBeNull();
	});

	it('falls back to the geocoder order when there is no point, but only inside the country', () => {
		expect(pickNearest([VANCOUVER_BC, VANCOUVER_WA], { city: 'Vancouver', country: 'US' })).toBe(
			VANCOUVER_WA
		);
		expect(pickNearest([VANCOUVER_BC, VANCOUVER_WA], { city: 'Vancouver' })).toBeNull();
	});

	it('ignores entries that are not locations', () => {
		const geo: EdgeGeo = { city: 'Vancouver', latitude: 49.3, longitude: -123.1 };

		expect(pickNearest([null, 'Vancouver', { name: 'Vancouver' }], geo)).toBeNull();
		expect(pickNearest([null, VANCOUVER_BC], geo)).toBe(VANCOUVER_BC);
	});

	it('has nothing to say about an empty result set', () => {
		expect(pickNearest([], { city: 'Nowhere', country: 'CH' })).toBeNull();
	});
});
