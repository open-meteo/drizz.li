import { resolveLocationFromRoute } from '$lib/utils/location';

import type { PageLoad } from './$types';

export const load: PageLoad = async (event) => {
	const location = await resolveLocationFromRoute({
		urlLocation: event.params.location,
		routePrefix: '/weather/seasonal/',
		event
	});

	return { location };
};
