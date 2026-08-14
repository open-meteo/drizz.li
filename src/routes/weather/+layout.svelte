<script lang="ts">
	import { setContext } from 'svelte';

	import { page } from '$app/stores';

	import { type GeoLocation, locationKnown, storedLocation } from '$lib/stores/settings';

	import { skeletonOut } from '$lib/utils/skeleton-fade';

	import { routePath } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();

	// The location heading lives in the layout, not in each page: a layout
	// survives navigation, so switching between forecasts no longer tears the
	// heading down and rebuilds it once the next page's data has loaded.
	// Page-specific controls (model pickers, range buttons) render into the same
	// row through this context.
	let actions = $state<Snippet | null>(null);
	setContext('weather-hero', {
		setActions: (snippet: Snippet | null) => {
			actions = snippet;
		}
	});

	// Page data wins; the persisted store covers any weather page that doesn't
	// carry a location of its own. Before the browser has settled on one at all
	// (a first visit, or a location route still resolving) there is nothing
	// truthful to show, and the row renders a placeholder instead of the default
	// city the prerendered HTML was built with.
	let location: GeoLocation | null = $derived(
		$page.data.location ?? ($locationKnown ? $storedLocation : null)
	);

	const SUBTITLES: [string, () => string][] = [
		['/weather/week', m.page_week_subtitle],
		['/weather/compare', m.page_compare_subtitle],
		['/weather/14-day', m.page_14day_subtitle],
		['/weather/seasonal', m.page_seasonal_subtitle],
		['/weather/historical', m.page_historical_subtitle]
	];
	let subtitle = $derived(
		SUBTITLES.find(([prefix]) => routePath($page.url.pathname).startsWith(prefix))?.[1]?.() ?? null
	);

	// Joined here rather than in the markup: Svelte trims the whitespace around a
	// line break, so a separator written as "{admin1},\n{country}" renders as
	// "Canton of Schwyz,Switzerland". Elevation joins the same line; from lg up
	// the whole line is hidden, because the topbar pill carries the region and
	// elevation there.
	let region = $derived(
		[
			location?.admin1,
			location?.country,
			location?.elevation != null ? `${Math.round(location.elevation)}m` : null
		]
			.filter(Boolean)
			.join(', ')
	);
</script>

{#if subtitle}
	<div class="relative mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 md:mb-5">
		{#if !location}
			<!-- Same metrics as the heading below, and `relative` on the row lets it
			     dissolve over the real one rather than holding its own slot
			     (skeletonOut). -->
			<div class="flex min-w-0 items-center gap-3" out:skeletonOut aria-hidden="true">
				<div
					class="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted ring-2 ring-border"
				></div>
				<div class="min-w-0 space-y-2">
					<div class="h-6 w-64 animate-pulse rounded bg-muted md:h-7 md:w-80"></div>
					<div class="h-3.5 w-40 animate-pulse rounded bg-muted lg:hidden"></div>
				</div>
			</div>
		{:else}
			<div class="flex min-w-0 items-center gap-3">
				<img
					class="h-10 w-10 shrink-0 rounded-full shadow-sm ring-2 ring-border"
					src="/images/country-flags/{(
						location.country_code || 'united_nations'
					).toLowerCase()}.svg"
					alt={location.country ?? ''}
				/>
				<div class="min-w-0">
					<h1 class="truncate text-2xl leading-tight font-bold tracking-tight md:text-3xl">
						{location.name}
						<span class="font-medium text-muted-foreground">· {subtitle}</span>
					</h1>
					{#if region}
						<p class="truncate text-sm text-muted-foreground lg:hidden">{region}</p>
					{/if}
				</div>
			</div>
		{/if}

		{#if actions}{@render actions()}{/if}
	</div>
{/if}

{@render children?.()}
