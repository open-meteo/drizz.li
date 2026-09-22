import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

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

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),
	kit: {
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
			entries: (() => {
				// Locale lives in the path (see the paraglide config in vite.config.ts),
				// so a localized URL is not a route SvelteKit can discover on its own -
				// each one has to be listed. City pages are prerendered for the base
				// locale only; the other languages reach them through the SPA fallback,
				// which keeps the build from ballooning to cities × locales.
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
				const localized = locales.flatMap((locale) => shared.map((p) => `/${locale}${p}`));

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
					const citiesPath = path.resolve('src/routes/weather/locations/city-names100.json');
					const raw = fs.readFileSync(citiesPath, 'utf-8');
					const cities = JSON.parse(raw);
					if (Array.isArray(cities)) {
						const cityEntries = cities.flatMap((c) =>
							cityRoutes.map((route) => `/en${route}/${c}`)
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
	}
};

export default config;
