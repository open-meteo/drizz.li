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

	import LogoMark from './logo-mark.svelte';
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
	let homeLocationRoute = $derived(buildLocationRoute(location ?? $storedLocation));

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
		} else if (currentPath.startsWith('/weather/marine')) {
			goto(href('/weather/marine/[location]', { location: locationRoute }));
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

	<!-- Current location display. Both branches carry the same pill metrics, so
	     the real thing lands exactly where the placeholder sat. -->
	{#if location}
		<!-- min-w-0 + a ceiling so a long "Sant Pere de Ribes, Catalonia, Spain"
		     ellipses inside the pill instead of pushing the search box off centre.
		     The ceiling rises on a wide screen: the row's spacer still has hundreds
		     of pixels to give there, so a name that fits should not be cut. -->
		<div
			class="hidden min-w-0 max-w-70 items-center gap-2 rounded-full border border-border/70 bg-muted/40 py-1 ps-1 pe-3 lg:flex xl:max-w-96 2xl:max-w-136"
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
			class="hidden min-w-0 max-w-70 items-center gap-2 rounded-full border border-border/70 bg-muted/40 py-1 ps-1 pe-3 lg:flex xl:max-w-96 2xl:max-w-136"
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
		<!-- Drizzli is open source; the repo link is part of the identity, like
		     the fork button on the Open-Meteo maps. -->
		<a
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			href="https://github.com/open-meteo/drizz.li"
			target="_blank"
			rel="noopener noreferrer"
			title={m.oss_github()}
			aria-label={m.oss_github()}
		>
			<!-- GitHub mark -->
			<svg class="h-4.5 w-4.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
				<path
					d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
				/>
			</svg>
		</a>

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
