<script lang="ts">
	import { fade } from 'svelte/transition';

	import { type ChartPanel, storedChartLayout } from '$lib/stores/settings';

	import { formatZoned } from '$lib/utils/date';

	import { ChartContainer, downloadChartsPng } from '$lib/components/charts';

	import { CanvasChart, groupRange } from '$lib/charts';
	import * as m from '$lib/paraglide/messages';

	import { getWeatherIconName } from '../../utils/weather-codes';
	import { type FetchedHourly, type WeatherUnits } from '../../week/[location]/types';
	import { VARIABLE_BY_KEY, buildPanelDef } from '../../week/[location]/variables';

	interface Props {
		data: FetchedHourly;
		units: WeatherUnits;
		loading: boolean;
		selectedDay: Date;
	}

	let { data, units, loading, selectedDay }: Props = $props();

	const CHART_GROUP = 'historical-meteogram';
	const SECONDS_PER_DAY = 24 * 3600;
	const CHART_HEIGHT = 300;

	let downloadingPng = $state(false);
	let chartComponents: (CanvasChart | null)[] = $state([]);
	let liveCharts = $derived(chartComponents.filter((c): c is CanvasChart => c != null));

	// Same customizable layout as the week-page meteograms, so the two pages match.
	let panels = $derived(
		$storedChartLayout.filter((p) => p.variables.some((k) => VARIABLE_BY_KEY.has(k)))
	);

	let timestampsSec = $derived(data.timestamps.map((t) => t / 1000));

	function dayStartSec(day: Date): number | null {
		const targetDayStr = formatZoned(day, data.timezone, 'yyyy-MM-dd');
		const idx = data.hourlyDates.findIndex(
			(d) => formatZoned(d, data.timezone, 'yyyy-MM-dd') === targetDayStr
		);
		return idx === -1 ? null : data.timestamps[idx] / 1000;
	}

	// Soft band marking the day currently open in the hourly table below.
	let selectedDayHighlight = $derived.by(() => {
		const start = dayStartSec(selectedDay);
		return start == null ? undefined : { start, end: start + SECONDS_PER_DAY };
	});

	function isDaytime(tSec: number): boolean {
		return data.daylightBands.some((b) => tSec >= b.start && tSec < b.end);
	}

	let pictograms = $derived.by((): { t: number; icon: string }[] => {
		const codes = data.hourly.weather_code ?? [];
		const out: { t: number; icon: string }[] = [];
		for (let i = 0; i < timestampsSec.length; i++) {
			const code = codes[i];
			if (code == null || !isFinite(code)) continue;
			const t = timestampsSec[i];
			out.push({ t, icon: getWeatherIconName(code, isDaytime(t)) });
		}
		return out;
	});

	let windArrowMarks = $derived.by((): { t: number; deg: number }[] => {
		const dirs = data.hourly.winddirection_10m ?? [];
		const out: { t: number; deg: number }[] = [];
		for (let i = 0; i < timestampsSec.length; i++) {
			const d = dirs[i];
			if (d == null || !isFinite(d)) continue;
			out.push({ t: timestampsSec[i], deg: d });
		}
		return out;
	});

	let zoomActive = $derived(groupRange(CHART_GROUP) != null);
	function resetZoom(): void {
		liveCharts[0]?.resetRange();
	}

	interface RenderPanel extends ChartPanel {
		def: ReturnType<typeof buildPanelDef>;
		title: string;
		titleShort: string;
	}

	let renderPanels = $derived.by((): RenderPanel[] =>
		panels.map((p) => {
			const def = buildPanelDef(p.variables, data.hourly, units);
			const title = def.series.map((s) => s.name).join(' · ');
			const titleShort = def.series.map((s) => s.shortName ?? s.name).join(' · ');
			return { ...p, def, title, titleShort };
		})
	);

	let anyRightAxis = $derived(renderPanels.some((p) => p.def.unitRight != null));
	let maxTopRows = $derived(
		Math.max(
			0,
			...renderPanels.map((p) => (p.def.hasPictograms ? 1 : 0) + (p.def.hasWindArrows ? 1 : 0))
		)
	);

	async function downloadPng(): Promise<void> {
		if (liveCharts.length === 0 || downloadingPng) return;
		downloadingPng = true;
		try {
			const items = renderPanels.map((p, i) => ({ chart: chartComponents[i], title: p.title }));
			await downloadChartsPng(items, 'historical-weather');
		} finally {
			setTimeout(() => (downloadingPng = false), 500);
		}
	}
</script>

<section class="mt-8" transition:fade={{ duration: 200 }}>
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h3 class="text-lg font-bold">
			{m.meteograms_heading()}
			<span class="font-semibold text-muted-foreground">{m.historical_full_range()}</span>
		</h3>
		<div class="flex flex-wrap items-center gap-3">
			<span class="hidden text-xs text-muted-foreground md:inline">
				{m.meteograms_zoom_hint()}
				<kbd class="rounded border border-border bg-muted px-1 py-0.5 font-sans text-[10px]"
					>Ctrl</kbd
				>
				{m.meteograms_zoom_hint_end()}
			</span>
			<button
				type="button"
				class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
				disabled={liveCharts.length === 0 || downloadingPng}
				onclick={downloadPng}
				title={m.chart_download()}
			>
				{#if downloadingPng}Rendering…{:else}PNG{/if}
			</button>
			<!-- Kept last so toggling it wraps onto a new line instead of shifting
			     the other controls (no layout shift on mobile). -->
			{#if zoomActive}
				<button
					type="button"
					class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
					onclick={resetZoom}
				>
					{m.reset_zoom()}
				</button>
			{/if}
		</div>
	</div>

	{#if renderPanels.length === 0}
		<div
			class="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground"
		>
			{m.meteograms_none_historical()}
		</div>
	{:else}
		<div class="-mx-3 border-y border-border/70 bg-card shadow-sm lg:mx-0 lg:rounded-2xl lg:border">
			{#each renderPanels as panel, i (panel.id)}
				<div
					class="px-0 pt-0.5 pb-0 lg:px-4 lg:pt-2 lg:pb-1 {i > 0
						? 'border-t border-border/50'
						: 'lg:pt-4'} {i === renderPanels.length - 1 ? 'pb-1 lg:pb-4' : ''}"
				>
					<div class="mb-0 flex items-center justify-between px-3 lg:mb-0.5 lg:px-0">
						<h4 class="truncate text-xs font-bold tracking-wide text-muted-foreground uppercase">
							<span class="hidden lg:inline">{panel.title}</span>
							<span class="lg:hidden">{panel.titleShort}</span>
						</h4>
					</div>
					<ChartContainer
						{loading}
						chartCount={1}
						chartHeight={CHART_HEIGHT}
						minWidth={520}
						bleed={false}
					>
						<CanvasChart
							bind:this={chartComponents[i]}
							timestamps={timestampsSec}
							timezone={data.timezone}
							series={panel.def.series}
							bands={data.daylightBands}
							pictograms={panel.def.hasPictograms ? pictograms : []}
							windArrows={panel.def.hasWindArrows ? windArrowMarks : []}
							reserveRightAxis={anyRightAxis}
							reserveTopRows={maxTopRows}
							highlight={selectedDayHighlight}
							unit={panel.def.unit}
							unitRight={panel.def.unitRight}
							yMin={panel.def.yMin}
							yPadTop={panel.def.yPadTop}
							yPadBottom={panel.def.yPadBottom}
							zeroBaseLeft={panel.def.zeroBaseLeft}
							yMinRight={panel.def.yMinRight}
							yMaxRight={panel.def.yMaxRight}
							showCredit={i === renderPanels.length - 1}
							showLegend
							height={CHART_HEIGHT}
							group={CHART_GROUP}
						/>
					</ChartContainer>
				</div>
			{/each}
		</div>
	{/if}
</section>
