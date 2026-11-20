import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env', () => ({ version: 'test' }));
vi.mock('$app/manifest', () => ({
	immutable: [{ path: 'app.js' }, { path: '_app/immutable/assets/app.css' }],
	assets: [{ path: 'app.webmanifest' }, { path: '/favicon.svg' }, { path: 'other.txt' }]
}));

function fetchEvent(path: string) {
	return {
		request: new Request(new URL(path, 'https://drizz.li')),
		respondWith: vi.fn<(response: Promise<Response>) => void>(),
		waitUntil: vi.fn<(work: Promise<unknown>) => void>()
	};
}

describe('service worker', () => {
	const listeners = new Map<string, (event: ReturnType<typeof fetchEvent>) => void>();
	const cache = {
		addAll: vi.fn().mockResolvedValue(undefined),
		add: vi.fn().mockResolvedValue(undefined),
		match: vi.fn(),
		put: vi.fn().mockResolvedValue(undefined),
		keys: vi.fn().mockResolvedValue([])
	};

	beforeEach(async () => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.stubEnv('DEV', false);
		cache.match.mockResolvedValue(undefined);
		vi.stubGlobal('location', { origin: 'https://drizz.li' });
		vi.stubGlobal(
			'addEventListener',
			(type: string, listener: (event: ReturnType<typeof fetchEvent>) => void) => {
				listeners.set(type, listener);
			}
		);
		vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) });
		vi.stubGlobal('fetch', vi.fn());
		vi.stubGlobal('skipWaiting', vi.fn().mockResolvedValue(undefined));
		await import('./index.js');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it('keeps a background refresh alive after returning a cached response', async () => {
		const cached = new Response('cached');
		const fresh = new Response('fresh');
		cache.match.mockResolvedValue(cached);
		let finishFetch!: (response: Response) => void;
		vi.mocked(fetch).mockReturnValue(new Promise((resolve) => (finishFetch = resolve)));
		const event = fetchEvent('/images/weather.png');

		listeners.get('fetch')!(event);

		expect(event.waitUntil).toHaveBeenCalledOnce();
		expect(await event.respondWith.mock.calls[0][0]).toBe(cached);
		let finished = false;
		const work = event.waitUntil.mock.calls[0][0].then(() => (finished = true));
		await Promise.resolve();
		expect(finished).toBe(false);
		finishFetch(fresh);
		await work;
		expect(cache.put).toHaveBeenCalledWith(event.request, expect.any(Response));
	});

	it('handles an offline background refresh while serving cached data', async () => {
		const cached = new Response('cached');
		cache.match.mockResolvedValue(cached);
		vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
		const event = fetchEvent('/data/cities.json');

		listeners.get('fetch')!(event);

		expect(await event.respondWith.mock.calls[0][0]).toBe(cached);
		await expect(event.waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
	});

	it('still rejects an offline request when there is no cached response', async () => {
		const error = new TypeError('offline');
		vi.mocked(fetch).mockRejectedValue(error);
		const event = fetchEvent('/data/cities.json');

		listeners.get('fetch')!(event);

		await expect(event.respondWith.mock.calls[0][0]).rejects.toBe(error);
		await expect(event.waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
	});

	it('fetches a shell asset when its query string does not match the cached URL', async () => {
		const fresh = new Response('app');
		vi.mocked(fetch).mockResolvedValue(fresh);
		const event = fetchEvent('/app.js?v=1');

		listeners.get('fetch')!(event);

		expect(await event.respondWith.mock.calls[0][0]).toBe(fresh);
		expect(fetch).toHaveBeenCalledWith(event.request);
	});

	it('evicts the oldest page when caching a navigation exceeds the page limit', async () => {
		const oldest = 'https://drizz.li/weather/week/?view=0';
		const pages = new Map(
			Array.from({ length: 100 }, (_, index) => [
				`https://drizz.li/weather/week/?view=${index}`,
				new Response('saved page')
			])
		);
		const pageCache = {
			put: async (request: Request, response: Response) => {
				pages.set(request.url, response);
			},
			keys: async () => Array.from(pages.keys(), (url) => new Request(url)),
			delete: async (request: Request) => pages.delete(request.url)
		};
		vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(pageCache) });
		const response = new Response('new page');
		vi.mocked(fetch).mockResolvedValue(response);
		const event = fetchEvent('/weather/week/?view=100');
		Object.defineProperty(event.request, 'mode', { value: 'navigate' });

		listeners.get('fetch')!(event);
		expect(await event.respondWith.mock.calls[0][0]).toBe(response);
		await event.waitUntil.mock.calls[0][0];

		expect(pages.size).toBe(100);
		expect(pages.has(oldest)).toBe(false);
		expect(await pages.get(event.request.url)!.text()).toBe('new page');
	});

	it('reuses fixed historical ranges for 30 days without fetching', async () => {
		const cached = new Response('history', {
			headers: { 'x-drizzli-cached-at': String(Date.now() - 29 * 86400000) }
		});
		cache.match.mockResolvedValue(cached);
		const event = fetchEvent(
			'https://archive-api.open-meteo.com/v1/archive?start_date=2020-01-01&end_date=2020-01-31'
		);
		listeners.get('fetch')!(event);
		expect(await event.respondWith.mock.calls[0][0]).toBe(cached);
		expect(fetch).not.toHaveBeenCalled();
		expect(caches.open).toHaveBeenCalledWith('drizzli-history-v1');
	});

	it.each([undefined, String(Date.now() - 30 * 86400000)])(
		'refreshes historical entries with an expired or missing timestamp (%s)',
		async (timestamp) => {
			cache.match.mockResolvedValue(
				new Response('old', {
					headers: timestamp ? { 'x-drizzli-cached-at': timestamp } : {}
				})
			);
			const fresh = new Response('fresh history');
			vi.mocked(fetch).mockResolvedValue(fresh);
			const event = fetchEvent(
				'https://archive-api.open-meteo.com/v1/archive?start_date=2020-01-01&end_date=2020-01-31'
			);
			listeners.get('fetch')!(event);
			expect(await event.respondWith.mock.calls[0][0]).toBe(fresh);
			await Promise.all(event.waitUntil.mock.calls.map(([work]) => work));
			const stored = cache.put.mock.calls[0][1] as Response;
			expect(Number(stored.headers.get('x-drizzli-cached-at'))).toBeGreaterThan(0);
			expect(await stored.text()).toBe('fresh history');
		}
	);

	it('serves expired historical data when offline', async () => {
		const cached = new Response('saved history');
		cache.match.mockResolvedValue(cached);
		vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
		const event = fetchEvent(
			'https://archive-api.open-meteo.com/v1/archive?start_date=2020-01-01&end_date=2020-01-31'
		);
		listeners.get('fetch')!(event);
		expect(await event.respondWith.mock.calls[0][0]).toBe(cached);
		expect(fetch).toHaveBeenCalledOnce();
	});

	it.each([
		'https://api.open-meteo.com/v1/forecast?start_date=2020-01-01&end_date=2020-01-31',
		'https://archive-api.open-meteo.com/v1/archive?start_date=2020-01-01',
		'https://archive-api.open-meteo.com/v1/archive?start_date=2020-02-30&end_date=2020-03-01',
		'https://archive-api.open-meteo.com/v1/archive?start_date=2020-02-01&end_date=2020-01-01',
		`https://archive-api.open-meteo.com/v1/archive?start_date=2020-01-01&end_date=${new Date().toISOString().slice(0, 10)}`
	])('keeps nonhistorical or invalid ranges network-first: %s', async (url) => {
		cache.match.mockResolvedValue(new Response('cached'));
		const fresh = new Response('fresh');
		vi.mocked(fetch).mockResolvedValue(fresh);
		const event = fetchEvent(url);
		listeners.get('fetch')!(event);
		expect(await event.respondWith.mock.calls[0][0]).toBe(fresh);
		expect(caches.open).toHaveBeenCalledWith('drizzli-weather-v1');
		await Promise.all(event.waitUntil.mock.calls.map(([work]) => work));
	});

	it('installs in development without requesting the build-only fallback', () => {
		vi.stubEnv('DEV', true);
		const event = fetchEvent('/');

		listeners.get('install')!(event);

		expect(caches.open).not.toHaveBeenCalled();
	});

	it('lets Vite handle requests in development', () => {
		vi.stubEnv('DEV', true);
		const event = fetchEvent('/app.js');

		listeners.get('fetch')!(event);

		expect(event.respondWith).not.toHaveBeenCalled();
	});
});
