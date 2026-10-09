import { paraglideVitePlugin } from '@inlang/paraglide-js';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

import type { IncomingMessage, ServerResponse } from 'http';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';

const addHeaders = (res: ServerResponse) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET');
	res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
	res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
};

// `/api/geo` is answered by the Worker in production (worker/index.ts), off
// data only Cloudflare has. Locally there is no Cloudflare, so a first visit
// would always take the "no geolocation" path and the redirect it feeds would
// never be exercised. This stands in for it: set DEV_GEO to another
// "city,country,lat,lon,timezone" to move, or to `off` for the path a plain
// static host takes.
const DEV_GEO = process.env.DEV_GEO ?? 'Zurich,CH,47.3744,8.5410,Europe/Zurich';

const devGeoBody = (): string | null => {
	if (!DEV_GEO || DEV_GEO === 'off') return null;
	const [city, country, latitude, longitude, timezone] = DEV_GEO.split(',');
	return JSON.stringify({
		city,
		country,
		timezone,
		latitude: Number(latitude),
		longitude: Number(longitude)
	});
};

const handleDevGeo = (req: IncomingMessage, res: ServerResponse): boolean => {
	if (req.url?.split('?')[0] !== '/api/geo') return false;

	const body = devGeoBody();
	res.setHeader('cache-control', 'no-store');
	if (!body) {
		// same "nothing to go on" answer the Worker gives
		res.statusCode = 204;
		res.end();
		return true;
	}
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.end(body);
	return true;
};

const viteServerConfig = (): Plugin => ({
	name: 'add-headers',
	configureServer: (server: ViteDevServer) => {
		server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
			addHeaders(res);
			if (!handleDevGeo(req, res)) next();
		});
	},
	configurePreviewServer: (server: PreviewServer) => {
		const buildDir = resolve(server.config.root, 'build');
		const fallback = resolve(buildDir, '404.html');
		server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
			addHeaders(res);
			if (handleDevGeo(req, res)) return;
			// SvelteKit preview does not serve adapter-static's SPA fallback.
			// Serve the shell for unprerendered page requests in any route or locale.
			// Leave assets, APIs and data requests to the regular preview handlers.
			const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
			let decodedPathname: string;
			try {
				decodedPathname = decodeURI(pathname);
			} catch {
				return next();
			}
			if (
				!['GET', 'HEAD'].includes(req.method ?? '') ||
				!req.headers.accept?.includes('text/html') ||
				/^\/(api|_app)(\/|$)/.test(decodedPathname) ||
				decodedPathname.endsWith('/__data.json') ||
				!existsSync(fallback)
			)
				return next();
			const file = resolve(buildDir, `.${decodedPathname}`);
			if (
				[file, resolve(file, 'index.html'), `${file}.html`].some((candidate) =>
					statSync(candidate, { throwIfNoEntry: false })?.isFile()
				)
			)
				return next();
			// Keep trailing-slash behavior consistent with the prerendered pages.
			if (!pathname.endsWith('/')) {
				const url = new URL(req.url!, 'http://localhost');
				res.writeHead(307, { location: `${pathname}/${url.search}` });
				res.end();
				return;
			}
			const html = readFileSync(fallback);
			res.writeHead(200, {
				'content-type': 'text/html; charset=utf-8',
				'cache-control': 'no-store',
				'content-length': html.byteLength
			});
			res.end(req.method === 'HEAD' ? undefined : html);
		});
	}
});

// The version name MUST be deterministic: it is baked into both the
// prerendered HTML and the client bundle, and Vite evaluates this config more
// than once per build. A `Date.now()` fallback produces two different values,
// the `__sveltekit_*` globals stop matching, and hydration crashes on every
// page (breaking client-side routing in production).
const buildVersion = () => {
	// commit sha provided by Cloudflare CI (Workers Builds / Pages)
	const sha = process.env.WORKERS_CI_COMMIT_SHA ?? process.env.CF_PAGES_COMMIT_SHA;
	if (sha) return sha;
	try {
		return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
	} catch {
		return 'dev';
	}
};

// Every locale carries its own path prefix, English included, so a URL always
// says which language it is in. `trailingSlash: 'always'` (see routes/+layout.ts)
// means the patterns have to match both `/de/weather/week/` and `/de`.
const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;

const urlPatterns = [
	{
		pattern: '/:path(.*)?',
		localized: LOCALES.map((locale) => [locale, `/${locale}/:path(.*)?`] as [string, string])
	}
];

export default defineConfig({
	plugins: [
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			// the URL is authoritative; the cookie only carries a choice forward to
			// the next bare visit, and the browser's languages seed a first visit
			strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
			urlPatterns
		}),
		tailwindcss(),
		sveltekit({
			// Consult https://svelte.dev/docs/kit/integrations
			// for more information about preprocessors
			preprocess: vitePreprocess(),
			// fallback: the SPA shell served for routes that were not prerendered
			// (unlisted cities, GPS coordinate routes); the universal load then
			// resolves the location client-side. Most static hosts serve 404.html
			// for unknown paths automatically.
			adapter: adapter({ fallback: '404.html' }),
			// Poll _app/version.json so a deploy while the SPA is open surfaces the
			// update-notification toast (see update-notification.svelte). NOTE for the
			// upcoming service worker / offline PRs: version.json must stay
			// network-only (never cache-first), or a new deploy is never detected.
			version: {
				name: buildVersion(),
				pollInterval: 2 * 60 * 1000 // 2 mins
			},
			// Pregenerate city pages to improve SEO during static build
			prerender: {
				// dynamic per-location routes (14-day, compare, unlisted cities) are
				// served by the SPA fallback instead of being prerendered
				handleUnseenRoutes: 'ignore',
				// a transient geocoding failure for one city should skip that page
				// (the fallback still serves it), not abort the whole build
				handleHttpError: ({ path, message }) => {
					console.warn(`prerender skipped ${path}: ${message}`);
				},
				entries: ((): Array<'*' | `/${string}`> => {
					// Locale lives in the path (see `urlPatterns` above), so a localized URL
					// is not a route SvelteKit can discover on its own - each one has to be
					// listed. City pages are prerendered for the base locale only; the other
					// languages reach them through the SPA fallback, which keeps the build
					// from ballooning to cities × locales.
					const locales = ['en', 'de', 'es', 'fr', 'it'];
					const shared = [
						'/weather/week',
						'/weather/compare',
						'/weather/14-day',
						'/weather/seasonal',
						'/weather/historical',
						'/weather/maps',
						'/about',
						'/legal/imprint',
						'/legal/privacy'
					];
					const localized = locales.flatMap((locale) =>
						shared.map((p): `/${string}` => `/${locale}${p}`)
					);

					// Every per-location route, not just the week page: an unprerendered
					// path is served by the SPA fallback, which the host answers with a
					// 404 status. The page still works, but it costs a bogus 404 on every
					// hard reload (and tells crawlers the page does not exist).
					const cityRoutes = [
						'/weather/week',
						'/weather/compare',
						'/weather/14-day',
						'/weather/seasonal',
						'/weather/historical'
					];

					try {
						const citiesPath = resolve('src/routes/weather/locations/city-names100.json');
						const raw = readFileSync(citiesPath, 'utf-8');
						const cities = JSON.parse(raw);
						if (Array.isArray(cities)) {
							const cityEntries = cities.flatMap((c) =>
								cityRoutes.map((route): `/${string}` => `/en${route}/${c}`)
							);
							// Keep the default wildcard to include other routes
							return ['*', ...localized, ...cityEntries];
						}
					} catch {
						// If anything goes wrong, fall back to default behavior
					}
					return ['*', ...localized];
				})()
			}
		}),
		viteServerConfig()
	],

	test: {
		expect: { requireAssertions: true },

		projects: [
			{
				extends: './vite.config.ts',

				test: {
					name: 'client',

					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},

					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',

				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
