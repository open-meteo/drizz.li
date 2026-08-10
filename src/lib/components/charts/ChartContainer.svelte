<!--
  ChartContainer.svelte — Consistent chart layout wrapper

  Provides a container with:
  - Consistent padding and spacing
  - Loading overlay with spinner
  - Fade transitions
  - Responsive min-height calculation
  - Slot for chart content

  Usage:
    <ChartContainer loading={!chartsReady} chartCount={3}>
      {#each charts as chart}
        <CanvasChart {...chart} />
      {/each}
    </ChartContainer>
-->
<script lang="ts">
	import { fade } from 'svelte/transition';

	import * as m from '$lib/paraglide/messages';

	import type { Snippet } from 'svelte';

	// ─── Props ──────────────────────────────────────────────────────────────────

	interface Props {
		/** Whether the charts are still loading */
		loading?: boolean;
		/** Number of charts being rendered (used for min-height calculation) */
		chartCount?: number;
		/** Height per individual chart in pixels (default: 300) */
		chartHeight?: number;
		/** Extra vertical padding in pixels added to the total min-height (default: 2) */
		extraPadding?: number;
		/** Minimum chart width in pixels; narrower viewports scroll sideways (default: 560) */
		minWidth?: number;
		/** Bleed the chart into the page gutters (edge-to-edge). Off when nested in a card. */
		bleed?: boolean;
		/** Optional CSS class for the outer wrapper */
		class?: string;
		/** Slot content (charts go here) */
		children?: Snippet;
	}

	let {
		loading = true,
		chartCount = 1,
		chartHeight = 300,
		extraPadding = 2,
		minWidth = 560,
		bleed = true,
		class: className = '',
		children
	}: Props = $props();

	// ─── Computed ───────────────────────────────────────────────────────────────

	let minHeight = $derived(chartHeight * chartCount + extraPadding);
</script>

<div class="chart-bleed" class:no-bleed={!bleed}>
	<div
		class="chart-container relative {className}"
		style:min-height="{minHeight}px"
		style="--chart-min-width: {minWidth}px"
	>
		<!-- Chart content area -->
		<div class="chart-content" in:fade={{ duration: 300 }} out:fade={{ duration: 300 }}>
			{#if children}
				{@render children()}
			{/if}
		</div>

		<!-- Loading overlay -->
		<div
			class="loading-overlay absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-background transition-opacity duration-300"
			class:pointer-events-none={!loading}
			class:opacity-0={!loading}
			class:opacity-100={loading}
		>
			<div class="flex flex-col items-center gap-3">
				<svg
					class="lucide lucide-loader-circle animate-spin text-muted-foreground"
					xmlns="http://www.w3.org/2000/svg"
					width="40"
					height="40"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 12a9 9 0 1 1-6.219-8.56" />
				</svg>
				<span class="sr-only">{m.charts_loading()}</span>
			</div>
		</div>
	</div>
</div>

<style>
	.chart-bleed {
		/* Bleed exactly into the page padding on mobile (main has p-3 =
		   0.75rem) for edge-to-edge charts, and a bit past the content
		   column on md+ (main has 2rem padding) for extra readability. */
		margin-left: -0.75rem;
		margin-right: -0.75rem;
		/* overflow-y is pinned (never `visible`): a bare `overflow-x: auto`
		   makes the browser compute overflow-y as `auto` too, which turns the
		   chart into a 1-2px vertical micro-scroller that swallows page scroll. */
		overflow-x: auto;
		overflow-y: hidden;
	}

	.chart-bleed.no-bleed {
		margin-left: 0;
		margin-right: 0;
		/* content fits the column, so no horizontal scroller is needed */
		overflow-x: hidden;
	}

	.chart-container {
		min-width: var(--chart-min-width);
	}

	/* Below lg: fit the chart to the viewport instead of forcing a min-width
	   sideways scroll (which fights touch inspection). Pinch to zoom for detail. */
	@media (max-width: 1023px) {
		.chart-container {
			min-width: 0;
		}
		.chart-bleed {
			overflow-x: hidden;
		}
	}

	@media (min-width: 1024px) {
		.chart-bleed {
			margin-left: -1.5rem;
			margin-right: -1.5rem;
		}
		.chart-bleed.no-bleed {
			margin-left: 0;
			margin-right: 0;
		}
	}

	.chart-content {
		width: 100%;
	}

	/* Smooth transition for the loading overlay */
	.loading-overlay {
		will-change: opacity;
	}
</style>
