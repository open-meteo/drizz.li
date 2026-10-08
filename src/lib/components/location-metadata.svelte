<script lang="ts">
	import { buildLocationRoute } from '$lib/utils/location';

	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';

	import type { GeoLocation } from '$lib/stores/settings';

	let {
		location,
		view
	}: {
		location: GeoLocation;
		view: 'week' | 'compare' | '14-day' | 'seasonal' | 'historical';
	} = $props();

	let locationName = $derived([location.name, location.country_code].filter(Boolean).join(', '));
	let viewTitle = $derived(
		{
			week: m.page_week_subtitle,
			compare: m.page_compare_subtitle,
			'14-day': m.page_14day_subtitle,
			seasonal: m.page_seasonal_subtitle,
			historical: m.page_historical_subtitle
		}[view]()
	);
	let description = $derived(
		{
			week: m.seo_week_description,
			compare: m.seo_compare_description,
			'14-day': m.seo_14day_description,
			seasonal: m.seo_seasonal_description,
			historical: m.seo_historical_description
		}[view]({ location: locationName })
	);
	// Build from the resolved location so aliases, query options, and fragments
	// all point at the same location page, with its language and trailing slash.
	let canonical = $derived(
		new URL(
			localizeHref(`/weather/${view}/${encodeURIComponent(buildLocationRoute(location))}/`),
			'https://drizz.li'
		).href
	);
</script>

<svelte:head>
	<title>{m.seo_location_title({ view: viewTitle, location: locationName })}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
</svelte:head>
