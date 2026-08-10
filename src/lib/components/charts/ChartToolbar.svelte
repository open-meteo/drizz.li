<!--
  ChartToolbar.svelte — Chart action bar with download and display controls

  Provides a toolbar row with:
  - Download full meteogram as PNG button
  - Slot for additional custom controls (e.g. legend toggle)

  When multiple charts are provided, they are stitched into a single
  combined image on download.

  Usage:
    <ChartToolbar
      charts={chartComponents}
      fileName="model-comparison"
    >
      {#snippet controls()}
        <Switch bind:checked={showLegend} />
      {/snippet}
    </ChartToolbar>
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	import {
		type ChartDownloadOptions,
		type ChartExportItem,
		type ExportableChart,
		downloadChartsPng
	} from './downloadChartsPng';

	import type { Snippet } from 'svelte';

	// ─── Props ──────────────────────────────────────────────────────────────────

	interface Props {
		/** Chart components available for download (undefined entries are skipped) */
		charts?: Array<ChartExportItem | ExportableChart | undefined | null>;
		/** Base file name for downloaded images (without extension) */
		fileName?: string;
		/** Optional title and shared legend drawn into the combined PNG. */
		exportOptions?: ChartDownloadOptions;
		/** Optional CSS class for the outer container */
		class?: string;
		/** Slot for additional controls (switches, checkboxes, etc.) */
		controls?: Snippet;
	}

	let {
		charts = [],
		fileName = 'drizzli-chart',
		exportOptions,
		class: className = '',
		controls
	}: Props = $props();

	// ─── State ──────────────────────────────────────────────────────────────────

	let downloading = $state(false);

	// ─── Computed ───────────────────────────────────────────────────────────────

	let hasCharts = $derived(
		charts.some((item) => item != null && ('chart' in item ? item.chart != null : true))
	);

	// ─── Download ───────────────────────────────────────────────────────────────

	async function handleDownload(): Promise<void> {
		if (!hasCharts || downloading) return;
		downloading = true;
		try {
			await downloadChartsPng(charts, fileName, exportOptions);
		} finally {
			setTimeout(() => {
				downloading = false;
			}, 500);
		}
	}
</script>

<div
	class="chart-toolbar flex flex-col items-center gap-4 md:flex-row md:justify-between {className}"
>
	<!-- Left side: Custom controls slot -->
	<div class="flex flex-wrap items-center gap-4 md:gap-6">
		{#if controls}
			{@render controls()}
		{/if}
	</div>

	<!-- Right side: Download button -->
	<div class="flex flex-wrap items-center gap-2">
		<button
			type="button"
			class="toolbar-btn"
			disabled={!hasCharts || downloading}
			onclick={handleDownload}
			title={m.chart_download()}
		>
			{#if downloading}
				<svg
					class="h-4 w-4 animate-spin"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path d="M21 12a9 9 0 1 1-6.219-8.56" />
				</svg>
			{:else}
				<svg
					class="h-4 w-4"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="7 10 12 15 17 10" />
					<line x1="12" y1="15" x2="12" y2="3" />
				</svg>
			{/if}
			<span>PNG</span>
		</button>
	</div>
</div>

<style>
	.toolbar-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.8125rem;
		font-weight: 500;
		line-height: 1.25rem;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--muted) / 0.5);
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius, 0.375rem);
		cursor: pointer;
		transition:
			color 150ms ease,
			background-color 150ms ease,
			border-color 150ms ease;
		white-space: nowrap;
		user-select: none;
	}

	.toolbar-btn:hover:not(:disabled) {
		color: hsl(var(--foreground));
		background: hsl(var(--muted));
		border-color: hsl(var(--foreground) / 0.2);
	}

	.toolbar-btn:active:not(:disabled) {
		background: hsl(var(--muted) / 0.8);
		transform: translateY(0.5px);
	}

	.toolbar-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.toolbar-btn:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 2px;
	}
</style>
