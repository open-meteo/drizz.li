<script lang="ts">
	import { get } from 'svelte/store';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	import {
		type GeoLocation,
		locationKnown,
		setActiveLocation,
		storedLocation
	} from '$lib/stores/settings';

	import { buildLocationRoute } from '$lib/utils/location';

	import LocationSearch from '$lib/components/location/location-search.svelte';

	import { href, routePath } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	import LogoMark from './logo-mark.svelte';

	// The URL's location wins where there is one: it is what the page is about,
	// and it is already correct in prerendered HTML. Everywhere else the store
	// answers - but only once the browser knows whose location it holds. Until
	// then the pill is a placeholder rather than the default city, which is the
	// one thing prerendered HTML could never get right: a German flag greeting
	// every first-time visitor, wherever they are.
	let location: GeoLocation | null = $derived(
		$page.data.location ?? ($locationKnown ? $storedLocation : null)
	);
	let homeLocationRoute = $derived(buildLocationRoute(location ?? $storedLocation));

	// Built as a string rather than inline markup: the pieces are optional.
	let locationRegion = $derived([location?.admin1, location?.country].filter(Boolean).join(', '));
	// A 0 m coastal town is a real reading; only a missing value is dropped.
	let locationDetail = $derived(
		[locationRegion, location?.elevation != null ? `${Math.round(location.elevation)}m` : null]
			.filter(Boolean)
			.join(' · ')
	);

	function navigateToLocation(newLocation: GeoLocation) {
		setActiveLocation(newLocation);
		const locationRoute = buildLocationRoute(newLocation);
		const currentPath = routePath(get(page).url.pathname);

		if (currentPath.startsWith('/weather/compare')) {
			goto(href('/weather/compare/[location]', { location: locationRoute }));
		} else if (currentPath.startsWith('/weather/14-day')) {
			goto(href('/weather/14-day/[location]', { location: locationRoute }));
		} else if (currentPath.startsWith('/weather/historical')) {
			goto(href('/weather/historical/[location]', { location: locationRoute }));
		} else if (currentPath.startsWith('/weather/seasonal')) {
			goto(href('/weather/seasonal/[location]', { location: locationRoute }));
		} else {
			goto(href('/weather/week/[location]', { location: locationRoute }));
		}
	}
</script>

<header
	class="topbar flex h-14 shrink-0 items-center gap-2 border-b border-topbar-border bg-topbar px-3 md:px-4"
>
	<a
		href={href('/weather/week/[location]', { location: homeLocationRoute })}
		class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-muted active:bg-muted md:hidden"
		aria-label={m.nav_home()}
		title={m.nav_home()}
	>
		<div
			class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
		>
			<LogoMark />
		</div>
	</a>

	<!-- One control carries both the current-place context and the action to
	     change it. This leaves more room on phones and removes the duplicate
	     location/search pills on desktop. -->
	<div class="mx-auto min-w-0 flex-1 md:max-w-2xl">
		<LocationSearch
			label={m.search_placeholder()}
			{location}
			{locationDetail}
			on:location={(event) => {
				navigateToLocation(event.detail);
			}}
		/>
	</div>
</header>

<style>
	.topbar {
		z-index: 40;
	}

	@media (max-width: 767px) {
		.topbar {
			height: calc(3.5rem + env(safe-area-inset-top, 0px));
			padding-top: env(safe-area-inset-top, 0px);
		}
	}
</style>
