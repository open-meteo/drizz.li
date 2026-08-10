import { deLocalizeUrl } from '$lib/paraglide/runtime';

import type { Reroute } from '@sveltejs/kit';

/**
 * The locale lives in the URL (`/de/weather/week/`), but the routes on disk are
 * language-neutral. Stripping the prefix here lets one route tree serve every
 * language - on the server, during prerendering and on client-side navigation.
 */
export const reroute: Reroute = (request) => deLocalizeUrl(request.url).pathname;
