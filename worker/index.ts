/**
 * drizz.li ships as a static bundle; this Worker exists for a single endpoint.
 *
 * Cloudflare knows roughly where a request came from, but that knowledge only
 * ever exists on the *request* - as `request.cf`, or as the `CF-IP*` headers the
 * "Add visitor location headers" managed transform adds. A prerendered HTML file
 * can never see it. `/api/geo` hands it back to the page, which is what lets a
 * first-time visitor land on their own city instead of the one baked into the
 * build (see src/lib/services/geolocation.ts).
 *
 * `assets.run_worker_first` in wrangler.jsonc limits this script to `/api/*`:
 * every other request is answered straight from the asset store without
 * invoking the Worker at all, exactly as it was before this file existed.
 */

interface Env {
	ASSETS: { fetch(request: Request): Promise<Response> };
}

/** The geolocation fields Cloudflare attaches to an incoming request. */
interface CfGeo {
	city?: string;
	country?: string;
	region?: string;
	timezone?: string;
	/** strings on `request.cf`, unlike everything else here */
	latitude?: string;
	longitude?: string;
}

/** The answer `/api/geo` gives (mirrored in src/lib/services/geolocation.ts). */
interface EdgeGeo {
	city?: string;
	country?: string;
	region?: string;
	timezone?: string;
	latitude?: number;
	longitude?: number;
}

// Cloudflare's placeholders for "no country": unknown, and the Tor network -
// whose exit node says nothing about where the visitor actually is.
const UNKNOWN_COUNTRIES = new Set(['XX', 'T1']);

// The response is derived from the visitor's IP, so it must not be stored by
// the browser, and never by a shared cache - one visitor's city served to the
// next is exactly the bug this endpoint would be blamed for.
const NO_STORE = { 'cache-control': 'no-store' };

const numeric = (value: string | undefined): number | undefined => {
	if (value == null || value === '') return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
};

function readGeo(request: Request): EdgeGeo {
	const cf = (request as Request & { cf?: CfGeo }).cf ?? {};
	// `request.cf` is populated on its own; the headers only exist once the
	// managed transform is enabled, so they are the fallback rather than the
	// source. Both are dropped by Cloudflare for requests it cannot place.
	const header = (name: string) => request.headers.get(name) ?? undefined;
	const country = cf.country ?? header('cf-ipcountry');

	return {
		city: cf.city ?? header('cf-ipcity'),
		country: country && !UNKNOWN_COUNTRIES.has(country) ? country : undefined,
		region: cf.region ?? header('cf-region'),
		timezone: cf.timezone ?? header('cf-iptimezone'),
		latitude: numeric(cf.latitude ?? header('cf-iplatitude')),
		longitude: numeric(cf.longitude ?? header('cf-iplongitude'))
	};
}

export default {
	fetch(request: Request, env: Env): Response | Promise<Response> {
		const { pathname } = new URL(request.url);

		if (pathname === '/api/geo') {
			if (request.method !== 'GET' && request.method !== 'HEAD') {
				return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
			}

			const geo = readGeo(request);
			// Nothing usable (a datacentre IP, a VPN Cloudflare cannot place): say
			// so with an empty body rather than an object full of nulls.
			if (!geo.city && geo.latitude == null) {
				return new Response(null, { status: 204, headers: NO_STORE });
			}

			return new Response(JSON.stringify(geo), {
				headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE }
			});
		}

		// Only `/api/*` is routed here, so this is a request for an endpoint that
		// does not exist - let the asset router answer it the way it answers any
		// other unknown path (the 404 page).
		return env.ASSETS.fetch(request);
	}
};
