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

const viteServerConfig = (): Plugin => ({
	name: 'add-headers',
	configureServer: (server: ViteDevServer) => {
		server.middlewares.use((_req: IncomingMessage, res: ServerResponse, next: () => void) => {
			addHeaders(res);
			next();
		});
	},
	configurePreviewServer: (server: PreviewServer) => {
		server.middlewares.use((_req: IncomingMessage, res: ServerResponse, next: () => void) => {
			addHeaders(res);
			next();
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
