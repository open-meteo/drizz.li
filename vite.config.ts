import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

import { paraglideOptions } from './paraglide.config.js';

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

export default defineConfig({
	plugins: [paraglideVitePlugin(paraglideOptions), tailwindcss(), sveltekit(), viteServerConfig()],

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
