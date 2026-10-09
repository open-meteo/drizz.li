import { paraglideMiddleware } from '#lib/paraglide/server.js';

import type { Handle } from '@sveltejs/kit/hooks';

/**
 * Runs for every prerendered page, so the HTML written to disk is already in the
 * right language and carries a matching `<html lang>` - the client never has to
 * repaint the page into its locale.
 */
export const handle: Handle = ({ event, resolve }) =>
	// The middleware also hands back a de-localized clone of the request, but
	// `reroute` (hooks.ts) has already mapped the URL onto the neutral route
	// tree, and nothing here reads `event.request` (read-only in SvelteKit 3).
	paraglideMiddleware(event.request, ({ locale }) =>
		resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		})
	);
