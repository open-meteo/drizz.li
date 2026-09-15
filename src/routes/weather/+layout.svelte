<script lang="ts">
	import { setContext } from 'svelte';

	import { page } from '$app/stores';

	import { type GeoLocation, locationKnown, storedLocation } from '$lib/stores/settings';

	import { routePath } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();
	let location: GeoLocation | null = $derived(
		$page.data.location ?? ($locationKnown ? $storedLocation : null)
	);

	let actions = $state<Snippet | null>(null);
	setContext('weather-hero', {
		setActions: (snippet: Snippet | null) => {
			actions = snippet;
		}
	});

	const TITLES: [string, () => string][] = [
		['/weather/week', m.page_week_subtitle],
		['/weather/compare', m.page_compare_subtitle],
		['/weather/14-day', m.page_14day_subtitle],
		['/weather/seasonal', m.page_seasonal_subtitle],
		['/weather/historical', m.page_historical_subtitle]
	];
	let hasModelSelector = $derived(!routePath($page.url.pathname).startsWith('/weather/compare'));
	let title = $derived(
		TITLES.find(([prefix]) => routePath($page.url.pathname).startsWith(prefix))?.[1]?.() ?? null
	);
</script>

<!-- Keep the place name in the heading and the model selection alongside it. -->
{#if title}
	<!-- Match the space below to main's top padding: 12px, or 24px on large screens. -->
	<div class="mb-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-0 md:min-h-9 lg:mb-6">
		<h1 class="text-xl leading-tight font-bold tracking-tight text-foreground md:text-3xl">
			{title}
			{#if location?.name}
				<span class="hidden font-medium text-muted-foreground md:inline"
					>{m.forecast_location({ location: location.name })}</span
				>
			{/if}
		</h1>
		{#if hasModelSelector}
			<div class="flex min-w-0 max-w-full items-baseline">
				{#if actions}
					{@render actions()}
				{:else}
					<span class="h-5 w-32 animate-pulse rounded bg-muted" aria-hidden="true"></span>
				{/if}
			</div>
		{/if}
	</div>
{/if}

{@render children?.()}
