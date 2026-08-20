<script lang="ts">
	import { get } from 'svelte/store';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	import {
		type GeoLocation,
		type Theme,
		locationKnown,
		setActiveLocation,
		storedLocation,
		storedTheme
	} from '$lib/stores/settings';

	import { buildLocationRoute } from '$lib/utils/location';

	import LanguageSelector from '$lib/components/language-selector.svelte';
	import LocationSearch from '$lib/components/location/location-search.svelte';
	import UnitSelector from '$lib/components/unit-selector.svelte';

	import { href, routePath } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	import SettingsMenu from './settings-menu.svelte';
	import ThemeIcon from './theme-icon.svelte';

	// The URL's location wins where there is one: it is what the page is about,
	// and it is already correct in prerendered HTML. Everywhere else the store
	// answers - but only once the browser knows whose location it holds. Until
	// then the pill is a placeholder rather than the default city, which is the
	// one thing prerendered HTML could never get right: a German flag greeting
	// every first-time visitor, wherever they are.
	let location: GeoLocation | null = $derived(
		$page.data.location ?? ($locationKnown ? $storedLocation : null)
	);

	// Built as a string rather than inline markup: the pieces are optional, and
	// separators spelled out in the template lose their spacing to Svelte's
	// whitespace trimming ("Canton of Schwyz,Switzerland").
	let locationRegion = $derived([location?.admin1, location?.country].filter(Boolean).join(', '));
	// elevation rides along in the pill's muted part ("· Canton of Schwyz,
	// Switzerland · 465m"); a 0 m coastal town is a real reading, only a
	// missing value is dropped
	let locationDetail = $derived(
		[locationRegion, location?.elevation != null ? `${Math.round(location.elevation)}m` : null]
			.filter(Boolean)
			.join(' · ')
	);
	// the pill ellipses, so the full name still has to be readable somewhere
	let locationLine = $derived([location?.name, locationDetail].filter(Boolean).join(' · '));

	const themeCycle: Theme[] = ['system', 'light', 'dark'];
	const themeTitles: Record<Theme, () => string> = {
		system: m.theme_follow_system,
		light: m.theme_light_title,
		dark: m.theme_dark_title
	};

	function cycleTheme() {
		storedTheme.update(
			(current) => themeCycle[(themeCycle.indexOf(current) + 1) % themeCycle.length]
		);
	}

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
	class="topbar flex h-14 shrink-0 items-center gap-2 border-b border-topbar-border bg-topbar px-3 md:gap-3 md:px-4"
>
	<!-- A balanced spacer keeps the tappable location title centred on phones;
	     primary navigation now lives in the persistent bottom bar. -->
	<div class="w-11 shrink-0 md:hidden" aria-hidden="true"></div>

	<!-- Current location display. Both branches carry the same pill metrics, so
	     the real thing lands exactly where the placeholder sat. -->
	{#if location}
		<!-- min-w-0 + a ceiling so a long "Sant Pere de Ribes, Catalonia, Spain"
		     ellipses inside the pill instead of pushing the search box off centre -->
		<div
			class="hidden min-w-0 max-w-70 items-center gap-2 rounded-full border border-border/70 bg-muted/40 py-1 ps-1 pe-3 lg:flex xl:max-w-96"
		>
			<img
				class="h-6 w-6 shrink-0 rounded-full ring-1 ring-border"
				src="/images/country-flags/{(location.country_code || 'united_nations').toLowerCase()}.svg"
				alt={location.country}
			/>
			<!-- full location (desktop); the page hero carries it on smaller screens -->
			<span class="min-w-0 truncate text-sm font-semibold text-foreground" title={locationLine}>
				{location.name}
				{#if locationDetail}
					<span class="font-normal text-muted-foreground">· {locationDetail}</span>
				{/if}
			</span>
		</div>
	{:else}
		<div
			class="hidden min-w-0 max-w-70 items-center gap-2 rounded-full border border-border/70 bg-muted/40 py-1 ps-1 pe-3 lg:flex xl:max-w-96"
			aria-hidden="true"
		>
			<div class="h-6 w-6 shrink-0 animate-pulse rounded-full bg-muted"></div>
			<div class="h-3.5 w-44 animate-pulse rounded bg-muted"></div>
		</div>
	{/if}

	<!-- Spacer (md+ only: on phones the equal side columns centre the search) -->
	<div class="hidden flex-1 md:block"></div>

	<!-- Location search: primary way to switch places, so keep it loud -->
	<div class="min-w-0 flex-1 md:w-full md:max-w-md md:flex-none">
		<LocationSearch
			label={m.search_placeholder()}
			mobileLabel={location?.name ?? m.search_placeholder()}
			on:location={(event) => {
				navigateToLocation(event.detail);
			}}
		/>
	</div>

	<!-- Phones only have room for one control, so units, theme and language
	     collapse into a single settings menu below md. This side mirrors
	     the menu-button column so the search lands dead centre. -->
	<div class="flex w-11 shrink-0 justify-end md:hidden">
		<SettingsMenu />
	</div>

	<!-- md+: the same settings as individual controls. -->
	<div class="hidden items-center gap-3 md:flex">
		<!-- Language: the locale lives in the URL, so this is a set of links -->
		<LanguageSelector />

		<!-- Measurement units -->
		<UnitSelector />

		<!-- Theme toggle: system → light → dark -->
		<button
			class="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			onclick={cycleTheme}
			title={themeTitles[$storedTheme]()}
			aria-label={themeTitles[$storedTheme]()}
		>
			<ThemeIcon theme={$storedTheme} />
		</button>
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
