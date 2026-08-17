<script lang="ts">
	import { fade } from 'svelte/transition';

	import {
		type ChartPanel,
		type ChartRangePref,
		storedChartLayout,
		storedChartRange
	} from '$lib/stores/settings';

	import { formatZoned, getRelativeDayLabel, isSameDayInZone } from '$lib/utils/date';

	import { ChartContainer, downloadChartsPng } from '$lib/components/charts';

	import { CanvasChart, groupRange } from '$lib/charts';
	import * as m from '$lib/paraglide/messages';

	import { getWeatherIconName } from '../../utils/weather-codes';
	import ChartCustomizer from './ChartCustomizer.svelte';
	import { type FetchedHourly, type WeatherUnits } from './types';
	import { VARIABLE_BY_KEY, buildPanelDef } from './variables';

	interface Props {
		data: FetchedHourly;
		selectedDay: Date;
		units: WeatherUnits;
		loading: boolean;
		/** Canvas height in px; the page shrinks it on phones. */
		chartHeight?: number;
		onResetZoom?: () => void;
	}

	let { data, selectedDay, units, loading, chartHeight = 300, onResetZoom }: Props = $props();

	const CHART_GROUP = 'week-meteogram';
	const SECONDS_PER_DAY = 24 * 3600;

	let customizerOpen = $state(false);
	let downloadingPng = $state(false);

	async function downloadPng(): Promise<void> {
		if (liveCharts.length === 0 || downloadingPng) return;
		downloadingPng = true;
		try {
			// pair each chart with its panel title so the export is labelled
			const items = renderPanels.map((p, i) => ({ chart: chartComponents[i], title: p.title }));
			await downloadChartsPng(items, 'week-forecast');
		} finally {
			setTimeout(() => (downloadingPng = false), 500);
		}
	}

	// Charts persist across data refetches; entries are null while unmounted.
	let chartComponents: (CanvasChart | null)[] = $state([]);
	let liveCharts = $derived(chartComponents.filter((chart): chart is CanvasChart => chart != null));

	// Only render panels that hold at least one known variable.
	let panels = $derived(
		$storedChartLayout.filter((p) => p.variables.some((k) => VARIABLE_BY_KEY.has(k)))
	);

	// When an extended range runs past the model's horizon the service pads with
	// zeros; trim the axis to the last hour that actually has data so the charts
	// cut off instead of flat-lining to zero.
	let validLength = $derived.by((): number => {
		const temp = data.hourly.temperature_2m ?? [];
		const n = data.timestamps.length;
		if (temp.length === 0) return n;
		let last = 0;
		for (let i = 0; i < n; i++) {
			if (temp[i] != null && !isNaN(temp[i]) && temp[i] !== 0) last = i + 1;
		}
		return last || n;
	});

	// Timestamps from the service are in milliseconds; CanvasChart uses seconds.
	let timestampsSec = $derived(data.timestamps.slice(0, validLength).map((t) => t / 1000));

	function dayStartSec(day: Date): number | null {
		if (!data) return null;
		const tz = data.timezone;
		const targetDayStr = formatZoned(day, tz, 'yyyy-MM-dd');
		const firstHourIdx = data.hourlyDates.findIndex(
			(d) => formatZoned(d, tz, 'yyyy-MM-dd') === targetDayStr
		);
		return firstHourIdx === -1 ? null : data.timestamps[firstHourIdx] / 1000;
	}

	function setRangeDays(from: Date, days: number): void {
		const start = dayStartSec(from);
		if (start == null || liveCharts.length === 0) return;
		// Charts share the group, so setting the range on one syncs all of them
		liveCharts[0].setRange(start, start + days * SECONDS_PER_DAY);
	}

	/** Drop any zoom and show the whole forecast. */
	function showFullRange(): void {
		liveCharts[0]?.resetRange();
		onResetZoom?.();
	}

	/** Back to the range the meteograms are configured to open on. */
	function resetZoom(): void {
		applyDefaultRange();
		onResetZoom?.();
	}

	// ─── Default range ──────────────────────────────────────────────────────────

	/** Days the preference resolves to, or null for the full range. */
	function rangeDaysFor(pref: ChartRangePref): number | null {
		if (pref === 'today') return 1;
		if (pref === '3d') return 3;
		if (pref === '5d') return 5;
		if (pref === 'all') return null;
		// auto: a week of hourly data is unreadable on a phone-width plot
		const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
		return phone ? 3 : null;
	}

	function applyDefaultRange(): void {
		const days = rangeDaysFor($storedChartRange);
		if (days == null) liveCharts[0]?.resetRange();
		else setRangeDays(new Date(), days);
	}

	// Applied once the charts exist, and again whenever the preference changes -
	// but never after that, so it can't fight a zoom the user just set by hand.
	let appliedPref: ChartRangePref | null = null;
	$effect(() => {
		const pref = $storedChartRange;
		if (liveCharts.length === 0 || timestampsSec.length === 0 || appliedPref === pref) return;
		appliedPref = pref;
		applyDefaultRange();
	});

	const now = new Date();
	// "Selected day" is redundant while today is the selected day, so hide it then
	let rangePresets = $derived.by(() => {
		const isToday = isSameDayInZone(now, selectedDay, data.timezone);
		return [
			{ label: m.range_today(), apply: () => setRangeDays(new Date(), 1) },
			...(isToday
				? []
				: [{ label: m.range_selected_day(), apply: () => setRangeDays(selectedDay, 1) }]),
			{ label: m.range_3_days(), apply: () => setRangeDays(new Date(), 3) },
			{ label: m.range_5_days(), apply: () => setRangeDays(new Date(), 5) },
			{ label: m.range_all(), apply: () => showFullRange() }
		];
	});

	// Soft band drawn on every chart marking the currently selected day
	let selectedDayHighlight = $derived.by(() => {
		const start = dayStartSec(selectedDay);
		return start == null ? undefined : { start, end: start + SECONDS_PER_DAY };
	});

	// ─── Pictograms (weather icons across the top) ──────────────────────────────

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

	// Wind-direction arrows for panels showing wind (deg = direction from North).
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

	// The range the default preference resolves to right now (null = full
	// range), mirroring CanvasChart.applyRange's clamping so it matches what
	// setRangeDays actually stored in the group.
	let defaultRange = $derived.by((): { start: number; end: number } | null => {
		const days = rangeDaysFor($storedChartRange);
		if (days == null || timestampsSec.length === 0) return null;
		const start = dayStartSec(new Date());
		if (start == null) return null;
		const tMin = timestampsSec[0];
		const tMax = timestampsSec[timestampsSec.length - 1];
		const span = Math.min(days * SECONDS_PER_DAY, tMax - tMin);
		if (span >= tMax - tMin) return null;
		const s = Math.max(tMin, Math.min(start, tMax - span));
		return { start: s, end: s + span };
	});

	// True while the shared group shows anything OTHER than the configured
	// default range - so "Reset zoom" only appears when pressing it would
	// change something, and follows the preference when it is edited.
	let zoomActive = $derived.by((): boolean => {
		const range = groupRange(CHART_GROUP);
		const def = defaultRange;
		if (range == null || def == null) return range != null || def != null;
		return Math.abs(range.start - def.start) > 1 || Math.abs(range.end - def.end) > 1;
	});

	// ─── Panel definitions ──────────────────────────────────────────────────────

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

	// Uniform sizing across every panel: reserve the right-axis gutter and the
	// tallest icon-row count so all meteograms share one plot rectangle.
	let anyRightAxis = $derived(renderPanels.some((p) => p.def.unitRight != null));
	let maxTopRows = $derived(
		Math.max(
			0,
			...renderPanels.map((p) => (p.def.hasPictograms ? 1 : 0) + (p.def.hasWindArrows ? 1 : 0))
		)
	);
</script>

<section class="mt-8" transition:fade={{ duration: 200 }}>
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h3 class="text-lg font-bold">
			{m.meteograms_heading()}
			<span class="font-semibold text-muted-foreground">
				– {formatZoned(selectedDay, data.timezone, 'EEEE')}{getRelativeDayLabel(
					selectedDay,
					data.timezone
				) !== formatZoned(selectedDay, data.timezone, 'EEEE')
					? ` (${getRelativeDayLabel(selectedDay, data.timezone)})`
					: ''}
			</span>
		</h3>
		<div class="flex flex-wrap items-center gap-3">
			<span class="hidden text-xs text-muted-foreground md:inline">
				{m.meteograms_zoom_hint()}
				<kbd class="rounded border border-border bg-muted px-1 py-0.5 font-sans text-[10px]"
					>Ctrl</kbd
				>
				{m.meteograms_zoom_hint_end()}
			</span>
			<div
				class="inline-flex items-center rounded-lg bg-muted p-0.5 text-xs font-semibold"
				role="group"
				aria-label={m.range_group_aria()}
			>
				{#each rangePresets as preset (preset.label)}
					<button
						type="button"
						class="cursor-pointer rounded-md px-2.5 py-1 whitespace-nowrap text-muted-foreground transition-colors hover:bg-background hover:text-foreground hover:shadow-sm"
						onclick={preset.apply}
					>
						{preset.label}
					</button>
				{/each}
			</div>
			<!-- On phones the customise/PNG pair always starts its own row instead of
			     wrapping unpredictably next to the range presets. -->
			<div class="basis-full md:hidden"></div>
			<button
				type="button"
				class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
				onclick={() => (customizerOpen = true)}
			>
				<svg
					class="h-3.5 w-3.5"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					stroke-width="2"
				>
					<path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4M6 16v4" />
				</svg>
				{m.meteograms_customize()}
			</button>
			<button
				type="button"
				class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
				disabled={liveCharts.length === 0 || downloadingPng}
				onclick={downloadPng}
				title={m.chart_download()}
			>
				{#if downloadingPng}
					<svg
						class="h-3.5 w-3.5 animate-spin"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="2"
					>
						<path d="M21 12a9 9 0 1 1-6.219-8.56" />
					</svg>
				{:else}
					<svg
						class="h-3.5 w-3.5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="7 10 12 15 17 10" />
						<line x1="12" y1="15" x2="12" y2="3" />
					</svg>
				{/if}
				PNG
			</button>
			<!-- Kept last so toggling it wraps onto a new line instead of shifting
			     the other controls (no layout shift on mobile). -->
			{#if zoomActive}
				<button
					type="button"
					class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
					onclick={resetZoom}
				>
					<svg
						class="h-3.5 w-3.5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v6h6M20 20v-6h-6" />
						<path stroke-linecap="round" d="M20 10a8 8 0 0 0-14-4M4 14a8 8 0 0 0 14 4" />
					</svg>
					{m.reset_zoom()}
				</button>
			{/if}
		</div>
	</div>

	{#if renderPanels.length === 0}
		<div
			class="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground"
		>
			{m.meteograms_none_before()}
			<button
				class="cursor-pointer font-semibold text-primary underline-offset-2 hover:underline"
				onclick={() => (customizerOpen = true)}>{m.meteograms_none_action()}</button
			>.
		</div>
	{:else}
		<!-- one full-bleed card until lg / contained card on lg+, graphs stacked
		     tightly so they read as one fluent meteogram -->
		<div class="-mx-3 border-y border-border/70 bg-card shadow-sm lg:mx-0 lg:rounded-2xl lg:border">
			{#each renderPanels as panel, i (panel.id)}
				<div
					class="px-0 pt-0.5 pb-0 lg:px-4 lg:pt-2 lg:pb-1 {i > 0
						? 'border-t border-border/50'
						: 'lg:pt-4'} {i === renderPanels.length - 1 ? 'pb-1 lg:pb-4' : ''}"
				>
					<!-- same title treatment as the compare / 14-day pages -->
					<div class="mb-1 flex items-center justify-between px-3 lg:px-0">
						<h4 class="truncate text-sm font-bold tracking-tight">
							<span class="hidden lg:inline">{panel.title}</span>
							<span class="lg:hidden">{panel.titleShort}</span>
						</h4>
					</div>
					<ChartContainer {loading} chartCount={1} {chartHeight} minWidth={520} bleed={false}>
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
							height={chartHeight}
							group={CHART_GROUP}
						/>
					</ChartContainer>
				</div>
			{/each}
		</div>
	{/if}
</section>

<ChartCustomizer open={customizerOpen} onClose={() => (customizerOpen = false)} />
