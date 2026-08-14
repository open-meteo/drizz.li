import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
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
		server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
			addHeaders(res);
			if (!handleDevGeo(req, res)) next();
		});
	}
});

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
		sveltekit(),
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
