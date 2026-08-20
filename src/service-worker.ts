/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const worker = globalThis as unknown as ServiceWorkerGlobalScope;
const SHELL_CACHE = `drizzli-shell-${version}`;
const PAGE_CACHE = 'drizzli-pages-v1';
const RUNTIME_CACHE = 'drizzli-runtime-v1';
const WEATHER_CACHE = 'drizzli-weather-v1';
const OWNED_PREFIX = 'drizzli-shell-';

const CRITICAL_FILES = new Set([
	'/app.webmanifest',
	'/favicon.svg',
	'/icons/icon-192.png',
	'/icons/icon-512.png',
	'/icons/icon-maskable-512.png'
]);
const SHELL = [...build, ...files.filter((file) => CRITICAL_FILES.has(file))];
const SHELL_PATHS = new Set(SHELL);
const WEATHER_HOSTS = new Set([
	'api.open-meteo.com',
	'ensemble-api.open-meteo.com',
	'archive-api.open-meteo.com',
	'seasonal-api.open-meteo.com',
	'geocoding-api.open-meteo.com'
]);

async function trimCache(name: string, maximum: number): Promise<void> {
	const cache = await caches.open(name);
	const keys = await cache.keys();
	await Promise.all(
		keys.slice(0, Math.max(0, keys.length - maximum)).map((key) => cache.delete(key))
	);
}

worker.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(SHELL_CACHE).then(async (cache) => {
			await cache.addAll(SHELL);
			// The bare route is the locale/location-resolving app entry and doubles as
			// the offline navigation fallback.
			await cache.add('/');
		})
	);
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const names = await caches.keys();
			await Promise.all(
				names
					.filter((name) => name.startsWith(OWNED_PREFIX) && name !== SHELL_CACHE)
					.map((name) => caches.delete(name))
			);
			await worker.clients.claim();
		})()
	);
});

worker.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') void worker.skipWaiting();
});

worker.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	if (WEATHER_HOSTS.has(url.hostname)) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(WEATHER_CACHE);
				try {
					const response = await fetch(request);
					if (response.ok) {
						event.waitUntil(
							cache
								.put(request, response.clone())
								.then(() => trimCache(WEATHER_CACHE, 24))
								.catch(() => {})
						);
					}
					return response;
				} catch (error) {
					const cached = await cache.match(request);
					if (cached) return cached;
					throw error;
				}
			})()
		);
		return;
	}

	if (url.origin !== worker.location.origin) return;

	if (SHELL_PATHS.has(url.pathname)) {
		event.respondWith(
			caches.open(SHELL_CACHE).then((cache) => cache.match(request) as Promise<Response>)
		);
		return;
	}

	if (request.mode === 'navigate') {
		event.respondWith(
			(async () => {
				const cache = await caches.open(PAGE_CACHE);
				try {
					const response = await fetch(request);
					if (response.ok) event.waitUntil(cache.put(request, response.clone()));
					return response;
				} catch (error) {
					const cached = await cache.match(request);
					if (cached) return cached;
					const fallback = await caches.match('/');
					if (fallback) return fallback;
					throw error;
				}
			})()
		);
		return;
	}

	if (url.pathname.startsWith('/images/') || url.pathname.startsWith('/data/')) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(RUNTIME_CACHE);
				const cached = await cache.match(request);
				const refresh = fetch(request).then((response) => {
					if (response.ok) {
						event.waitUntil(
							cache
								.put(request, response.clone())
								.then(() => trimCache(RUNTIME_CACHE, 160))
								.catch(() => {})
						);
					}
					return response;
				});
				return cached ?? refresh;
			})()
		);
	}
});
