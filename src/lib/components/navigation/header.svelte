<script lang="ts">
	import { get } from 'svelte/store';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	import { type GeoLocation, type Theme, storedLocation, storedTheme } from '$lib/stores/settings';

	import { buildLocationRoute } from '$lib/utils/location';

	import LanguageSelector from '$lib/components/language-selector.svelte';
	import LocationSearch from '$lib/components/location/location-search.svelte';
	import UnitSelector from '$lib/components/unit-selector.svelte';

	import { href, routePath } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	import SettingsMenu from './settings-menu.svelte';
	import ThemeIcon from './theme-icon.svelte';

	interface Props {
		onMenuToggle?: () => void;
	}

	let { onMenuToggle }: Props = $props();

	let location = $state(get(storedLocation));

	storedLocation.subscribe((value) => {
		location = value;
	});

	// Prerendered pages bake the DEFAULT location's flag into the HTML, and
	// Svelte's hydration repairs text but not attributes — so on pages that
	// never update the store (legal pages etc.) the stale flag would stick
	// around next to the correct location name. Re-sync the src after mount.
	let flagEl = $state<HTMLImageElement>();
	$effect(() => {
		const src = `/images/country-flags/${(location.country_code || 'united_nations').toLowerCase()}.svg`;
		if (flagEl && !flagEl.src.endsWith(src)) flagEl.src = src;
	});

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
		storedLocation.set(newLocation);
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
	class="topbar flex h-14 shrink-0 items-center gap-3 border-b border-topbar-border bg-topbar px-3 md:px-4"
>
	<!-- Mobile menu toggle. On phones this side and the settings side both take
	     an equal share of the leftover width, which lands the search box dead
	     centre; on md+ they collapse and the spacer below does the work. -->
	<div class="flex flex-1 items-center md:flex-none">
		<button
			class="-ms-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
			onclick={onMenuToggle}
			aria-label={m.nav_toggle_menu()}
		>
			<svg
				class="h-5 w-5"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				stroke-width="1.75"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
			</svg>
		</button>
	</div>

	<!-- Current location display -->
	{#if location}
		<!-- min-w-0 + a ceiling so a long "Sant Pere de Ribes, Catalonia, Spain"
		     ellipses inside the pill instead of pushing the search box off centre -->
		<div
			class="hidden min-w-0 max-w-70 items-center gap-2 rounded-full border border-border/70 bg-muted/40 py-1 ps-1 pe-3 lg:flex xl:max-w-96"
		>
			<img
				bind:this={flagEl}
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
	{/if}

	<!-- Spacer (md+ only: on phones the equal side columns centre the search) -->
	<div class="hidden flex-1 md:block"></div>

	<!-- Location search: primary way to switch places, so keep it loud -->
	<div class="w-full max-w-sm md:max-w-md">
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
	<div class="flex flex-1 justify-end md:hidden">
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
</style>
