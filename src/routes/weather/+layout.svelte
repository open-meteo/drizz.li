<script lang="ts">
	import { setContext } from 'svelte';

	import { page } from '$app/stores';

	import { routePath } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	import HeroActionsPlaceholder from './hero-actions-placeholder.svelte';

	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();

	// The page heading lives in the layout, not in each page: a layout survives
	// navigation, so switching between forecasts no longer tears the shared row
	// down. Page-specific controls (model pickers, range buttons) render into it
	// through this context.
	let actions = $state<Snippet | null>(null);
	setContext('weather-hero', {
		setActions: (snippet: Snippet | null) => {
			actions = snippet;
		}
	});

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
</script>

{#if subtitle}
	<div class="relative mb-1 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 md:mb-2">
		<h1 class="min-w-0 truncate text-xl leading-tight font-bold tracking-tight md:text-2xl">
			{subtitle}
		</h1>

		{#if actions}{@render actions()}{:else}<HeroActionsPlaceholder />{/if}
	</div>
{/if}

{@render children?.()}
