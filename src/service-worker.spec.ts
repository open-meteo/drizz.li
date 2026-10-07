import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$service-worker', () => ({
	build: ['/app.js'],
	files: [],
	version: 'test'
}));

function fetchEvent(path: string) {
	return {
		request: new Request(`https://drizz.li${path}`),
		respondWith: vi.fn<(response: Promise<Response>) => void>(),
		waitUntil: vi.fn<(work: Promise<unknown>) => void>()
	};
}

describe('service worker', () => {
	const listeners = new Map<string, (event: ReturnType<typeof fetchEvent>) => void>();
	const cache = {
		match: vi.fn(),
		put: vi.fn().mockResolvedValue(undefined),
		keys: vi.fn().mockResolvedValue([]),
		delete: vi.fn()
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
		vi.stubGlobal('clients', { claim: vi.fn().mockResolvedValue(undefined) });
		await import('./service-worker');
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
		expect(cache.keys).toHaveBeenCalledOnce();
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

	it('serves a cached shell asset without a network request', async () => {
		const cached = new Response('app');
		cache.match.mockResolvedValue(cached);
		const event = fetchEvent('/app.js');

		listeners.get('fetch')!(event);

		expect(await event.respondWith.mock.calls[0][0]).toBe(cached);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('installs in development without requesting the build-only fallback', () => {
		vi.stubEnv('DEV', true);
		const event = fetchEvent('/');

		listeners.get('install')!(event);

		expect(event.waitUntil).not.toHaveBeenCalled();
		expect(caches.open).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('claims clients in development without touching production caches', async () => {
		vi.stubEnv('DEV', true);
		const event = fetchEvent('/');

		listeners.get('activate')!(event);

		await expect(event.waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
		expect(caches.open).not.toHaveBeenCalled();
	});

	it.each(['/app.js', '/images/weather.png', '/data/cities.json'])(
		'lets Vite handle %s in development',
		(path) => {
			vi.stubEnv('DEV', true);
			const event = fetchEvent(path);

			listeners.get('fetch')!(event);

			expect(event.respondWith).not.toHaveBeenCalled();
			expect(event.waitUntil).not.toHaveBeenCalled();
			expect(caches.open).not.toHaveBeenCalled();
		}
	);
});
