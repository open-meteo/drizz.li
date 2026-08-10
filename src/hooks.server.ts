import { paraglideMiddleware } from '$lib/paraglide/server';

import type { Handle } from '@sveltejs/kit';

/**
 * Runs for every prerendered page, so the HTML written to disk is already in the
 * right language and carries a matching `<html lang>` - the client never has to
 * repaint the page into its locale.
 */
export const handle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});
