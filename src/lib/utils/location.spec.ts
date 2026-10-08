import { beforeEach, describe, expect, it, vi } from 'vitest';

import popularCities from '../../routes/weather/locations/city-names100.json';
import { buildLocationRoute, coordinateLocation, legacyLocationId } from './location';

let resolveLocation: typeof import('./location').resolveLocationFromRoute;

beforeEach(async () => {
	vi.resetModules();
	resolveLocation = (await import('./location')).resolveLocationFromRoute;
});

const london = {
	id: 2643743,
	name: 'London',
	latitude: 51.50853,
	longitude: -0.12574,
	country_code: 'GB',
	population: 8961989
};
const argentina = {
	id: 3846616,
	name: 'Londres',
	latitude: -27.71257,
	longitude: -67.13551,
	country_code: 'AR',
	population: 2627
};

// Realistic ambiguity: name search can select Argentina; an ID lookup must not.
function geocoder() {
	return vi.fn(async (input: RequestInfo | URL) => {
		const url = new URL(String(input));
		const city = url.searchParams.get('id') === String(argentina.id) ? argentina : london;
		const result =
			city === london && url.searchParams.get('language') === 'es'
				? { ...city, name: 'Londres' }
				: city;
		return Response.json(url.pathname.endsWith('/get') ? result : { results: [argentina] });
	});
}

async function navigate(href: string, fetch: typeof globalThis.fetch) {
	let url = new URL(href, 'https://drizz.li');
	for (let redirects = 0; redirects < 3; redirects++) {
		const [, , , view, segment] = url.pathname.split('/');
		try {
			const location = await resolveLocation({
				urlLocation: decodeURIComponent(segment),
				routePrefix: `/weather/${view}/`,
				event: { url, fetch }
			});
			return { url, location };
		} catch (error) {
			if (
				typeof error !== 'object' ||
				error === null ||
				!('status' in error) ||
				error.status !== 303 ||
				!('location' in error)
			)
				throw error;
			url = new URL(String(error.location), url);
		}
	}
	throw new Error('Redirect loop');
}

describe('location identity across languages', () => {
	it.each(['week', 'compare', '14-day', 'seasonal', 'historical'])(
		'keeps London through English → Spanish → English on %s',
		async (view) => {
			const fetch = geocoder();
			const english = await navigate(`/en/weather/${view}/london/?model=test#forecast`, fetch);
			const spanish = await navigate(english.url.href.replace('/en/', '/es/'), fetch);
			const back = await navigate(spanish.url.href.replace('/es/', '/en/'), fetch);
			for (const { location, url } of [english, spanish, back]) {
				expect(location).toMatchObject({
					id: london.id,
					country_code: 'GB',
					latitude: london.latitude,
					longitude: london.longitude
				});
				expect(url.search).toBe('?model=test');
				expect(url.hash).toBe('#forecast');
			}
			expect(spanish.url.pathname).toBe(`/es/weather/${view}/londres_2643743/`);
			expect(back.url.pathname).toBe(`/en/weather/${view}/london_2643743/`);
			expect(fetch.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
				'/v1/get',
				'/v1/get'
			]);
		}
	);

	it('resolves a shared localized URL with an empty cache and keeps Argentina distinct', async () => {
		const fetch = geocoder();
		const uk = await navigate('/en/weather/week/londres_2643743/', fetch);
		const ar = await navigate('/es/weather/week/londres_3846616/', fetch);
		expect(uk.location).toMatchObject(london);
		expect(ar.location).toMatchObject(argentina);
	});

	it('migrates an unknown legacy name once, then uses its ID', async () => {
		const fetch = geocoder();
		const result = await navigate('/en/weather/week/londres/', fetch);
		expect(result.location).toMatchObject(argentina);
		expect(result.url.pathname).toBe('/en/weather/week/londres_3846616/');
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('accepts encoded names without a redirect loop', async () => {
		const city = { id: 12345, name: 'Weißenburg', latitude: 49, longitude: 11 };
		const fetch = vi.fn().mockResolvedValue(Response.json(city));
		const result = await navigate('/de/weather/week/wei%C3%9Fenburg_12345/', fetch);
		expect(result.location).toEqual(city);
		expect(fetch).toHaveBeenCalledWith(expect.stringContaining('language=de'));
	});

	it.each([Response.json({ error: true }, { status: 404 }), Response.json(argentina)])(
		'does not search for a replacement after an invalid ID response',
		async (response) => {
			const fetch = vi.fn().mockResolvedValue(response);
			await expect(navigate('/en/weather/week/london_2643743/', fetch)).rejects.toMatchObject({
				status: 404
			});
			expect(fetch).toHaveBeenCalledTimes(1);
		}
	);

	it('rejects malformed IDs without a name search', async () => {
		const fetch = geocoder();
		await expect(navigate('/en/weather/week/london_invalid/', fetch)).rejects.toMatchObject({
			status: 404
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it('preserves network failures and allows the next request to recover', async () => {
		const failure = new TypeError('fetch failed');
		const fetch = vi
			.fn()
			.mockRejectedValueOnce(failure)
			.mockResolvedValueOnce(Response.json(london));
		await expect(navigate('/en/weather/week/london_2643743/', fetch)).rejects.toBe(failure);
		const recovered = await navigate('/en/weather/week/london_2643743/', fetch);
		expect(recovered.location).toMatchObject(london);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it.each([429, 503])('preserves upstream HTTP status %s', async (status) => {
		const fetch = vi.fn().mockResolvedValue(Response.json({}, { status }));
		await expect(navigate('/en/weather/week/london_2643743/', fetch)).rejects.toMatchObject({
			status
		});
	});

	it('keeps IDs for large search results and coordinate routes for GPS', () => {
		expect(buildLocationRoute(coordinateLocation(51, 0))).toBe('51.0000N0.0000E');
		expect(
			buildLocationRoute({ ...coordinateLocation(51, 0), ...london, feature_code: 'PPLC' })
		).toBe('london_2643743');
	});

	it('pins every prerendered city alias to an ID', () => {
		for (const slug of popularCities) expect(legacyLocationId(slug)).toBeGreaterThan(0);
		expect(legacyLocationId('london')).toBe(london.id);
		expect(legacyLocationId('toString')).toBeUndefined();
	});
});
