<script lang="ts">
	import { fade } from 'svelte/transition';

	import {
		defaultVariablePrefs,
		mergeTableRowOrder,
		storedHourlyInterval,
		storedTableRowOrder,
		storedVariablePrefs
	} from '$lib/stores/settings';

	import { formatUtcOffset, formatZoned, getZonedHour, isSameDayInZone } from '$lib/utils/date';
	import { useNow } from '$lib/utils/now.svelte';

	import { groupHover, setGroupHover } from '$lib/charts';
	import * as m from '$lib/paraglide/messages';

	import { getTempStyle } from '../../utils/colors';
	import { getWeatherDescription, getWeatherIconName } from '../../utils/weather-codes';
	import {
		type FetchedDaily,
		type FetchedHourly,
		type WeatherUnits,
		getPrecipUnit,
		getTempUnit,
		getWindArrowRotation,
		getWindUnit
	} from './types';

	interface Props {
		data: FetchedHourly;
		daily: FetchedDaily;
		selectedDay: Date;
		units: WeatherUnits;
		locationName: string;
		/** Opens the variable-customization sidebar (button lives in the header). */
		onCustomize?: () => void;
	}

	let { data, daily, selectedDay, units, locationName, onCustomize }: Props = $props();

	// Must match MeteogramCharts' CHART_GROUP so hovering the time row drives the
	// meteogram crosshairs.
	const METEOGRAM_GROUP = 'week-meteogram';

	// Scrubbing the time row moves the shared meteogram cursor to the hovered
	// time (interpolated across the row so it feels continuous), and clears it on
	// leave.
	function hoverTimeRow(e: MouseEvent) {
		const el = e.currentTarget as HTMLElement;
		const rect = el.getBoundingClientRect();
		if (rect.width <= 0 || cellData.length === 0) return;
		const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		const stepMs = (is3h ? 3 : 1) * 3600 * 1000;
		const first = cellData[0].date.getTime();
		const last = cellData[cellData.length - 1].date.getTime() + stepMs;
		setGroupHover(METEOGRAM_GROUP, (first + frac * (last - first)) / 1000);
	}

	function clearTimeRowHover() {
		setGroupHover(METEOGRAM_GROUP, null);
	}

	// persisted 1h / 3h preference
	let hourlyInterval = $derived($storedHourlyInterval);

	// Row order, controlled from the Variables sidebar (stored orders are
	// normalized so rows added in app updates still appear).
	let rowOrder = $derived(mergeTableRowOrder($storedTableRowOrder));

	// Row visibility, controlled from the Variables sidebar (missing keys
	// from older stored prefs default to visible)
	let showRow = $derived(
		(key: string): boolean =>
			$storedVariablePrefs.table?.[key] ?? defaultVariablePrefs.table[key] ?? true
	);

	// Ticks every minute, so the NOW line/label and the highlighted current-hour
	// column keep up with the clock instead of freezing at page load.
	const clock = useNow();
	let today = $derived(clock.current);
	const tempUnit = $derived(getTempUnit(units));
	const windUnit = $derived(getWindUnit(units));
	const precipUnit = $derived(getPrecipUnit(units));
	let sunTimes = $derived(getSunTimes());

	const PRECIP_MAX_MM = 10;
	const PRECIP_MAX_INCH = 0.4;

	let precipAbsMax = $derived(units.precipitation_unit === 'mm' ? PRECIP_MAX_MM : PRECIP_MAX_INCH);

	function getSelectedDayDailyIndex(): number {
		return findDailyIndex(selectedDay);
	}

	function getSunTimes(): { sunrise: Date; sunset: Date } | null {
		const di = getSelectedDayDailyIndex();
		if (di < 0) return null;
		const rise = daily.daily.sunrise[di];
		const set = daily.daily.sunset[di];
		if (!rise || !set) return null;
		return {
			sunrise: new Date(rise * 1000),
			sunset: new Date(set * 1000)
		};
	}

	function timeToFraction(date: Date): number {
		const tz = data.timezone;
		const hour = getZonedHour(date, tz);
		const minutes = parseInt(formatZoned(date, tz, 'mm'), 10);
		const totalMinutes = hour * 60 + minutes;

		const firstHour = getZonedHour(cellData[0].date, tz);
		const firstMin = firstHour * 60;

		const step = is3h ? 3 : 1;
		const lastHour = getZonedHour(cellData[cellData.length - 1].date, tz);
		const lastMin = lastHour * 60 + step * 60;

		const range = lastMin - firstMin;
		if (range <= 0) return 0;
		return Math.max(0, Math.min(1, (totalMinutes - firstMin) / range));
	}

	function formatTime(date: Date): string {
		return formatZoned(date, data.timezone, 'HH:mm');
	}

	let timezoneLabel = $derived(formatUtcOffset(data.utc_offset_seconds));

	function findDailyIndex(date: Date): number {
		return daily.dailyDates.findIndex((dd) => isSameDayInZone(dd, date, data.timezone));
	}

	function isDaytime(hourDate: Date): boolean {
		const di = findDailyIndex(hourDate);
		if (di < 0) return true;
		const sunrise = daily.daily.sunrise[di];
		const sunset = daily.daily.sunset[di];
		if (!sunrise || !sunset) return true;
		const ts = Math.floor(hourDate.getTime() / 1000);
		return ts >= sunrise && ts < sunset;
	}

	function getDayIndices(dates: Date[], day: Date): number[] {
		const tz = data.timezone;
		return dates.reduce<number[]>((acc, d, i) => {
			if (isSameDayInZone(d, day, tz) && (hourlyInterval === 1 || getZonedHour(d, tz) % 3 === 0)) {
				acc.push(i);
			}
			return acc;
		}, []);
	}

	function getPrecipBarHeight(val: number): number {
		if (!val || val <= 0) return 0;
		return Math.min(100, (val / precipAbsMax) * 100);
	}

	// Precipitation is an amount per hour, so a 3h cell is the sum of its three
	// 1h values (finite ones only; an all-NaN block past the horizon stays empty).
	function getCellPrecip(idx: number): number | null {
		const arr = data.hourly.precipitation;
		if (!is3h) return arr[idx];
		let sum = 0;
		let any = false;
		for (let i = idx; i < idx + 3 && i < arr.length; i++) {
			if (finite(arr[i])) {
				sum += arr[i];
				any = true;
			}
		}
		return any ? sum : null;
	}

	function getPrecipProbBg(prob: number): string {
		if (!prob || prob <= 0) return 'transparent';
		return `rgba(30, 100, 220, ${(Math.round(prob / 10) / 100) * 10 * 0.45})`;
	}

	function getCloudOpacity(cover: number): number {
		return Math.min(0.55, (cover ?? 0) / 150);
	}

	function getHumidityBg(hum: number): string {
		return `rgba(0, 180, 200, ${hum ** 3.5 / 10 ** 7.8})`;
	}

	// ─── Maps-project colour ramps (open-meteo/maps) ────────────────────────────
	// Same breakpoint colours the weather maps use, applied as cell backgrounds.
	function hexRgb(hex: string): [number, number, number] {
		const h = hex.replace('#', '');
		const n =
			h.length === 3
				? h
						.split('')
						.map((c) => c + c)
						.join('')
				: h;
		return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
	}
	function mixRgb(
		a: [number, number, number],
		b: [number, number, number],
		f: number
	): [number, number, number] {
		return [
			Math.round(a[0] + (b[0] - a[0]) * f),
			Math.round(a[1] + (b[1] - a[1]) * f),
			Math.round(a[2] + (b[2] - a[2]) * f)
		];
	}

	// Pressure: 940 hPa blue → 1010 white → 1060 red.
	const PRESSURE_LOW = hexRgb('#4444ff');
	const PRESSURE_MID = hexRgb('#ffffff');
	const PRESSURE_HIGH = hexRgb('#ff4444');
	function getPressureBg(hpa: number | null): string {
		if (hpa == null || isNaN(hpa)) return 'transparent';
		const v = Math.max(940, Math.min(1060, hpa));
		const c =
			v <= 1010
				? mixRgb(PRESSURE_LOW, PRESSURE_MID, (v - 940) / 70)
				: mixRgb(PRESSURE_MID, PRESSURE_HIGH, (v - 1010) / 50);
		return `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.5)`;
	}

	// UV index: 0 → 12 across the maps' teal→green→yellow→orange→pink ramp. The
	// opacity tracks the value so low/night hours stay faint instead of tinting
	// the whole row.
	const UV_STOPS = [
		'#009392',
		'#39b185',
		'#9ccb86',
		'#e9e29c',
		'#eeb479',
		'#e88471',
		'#cf597e'
	].map(hexRgb);
	function getUvBg(uv: number | null): string {
		if (uv == null || isNaN(uv) || uv <= 0) return 'transparent';
		const v = Math.min(12, uv);
		const p = (v / 12) * (UV_STOPS.length - 1);
		const i = Math.min(UV_STOPS.length - 2, Math.floor(p));
		const c = mixRgb(UV_STOPS[i], UV_STOPS[i + 1], p - i);
		const alpha = 0.18 + (v / 12) * 0.5;
		return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha.toFixed(3)})`;
	}

	function formatPrecipTooltip(precip: number | null, prob: number | null): string {
		const parts: string[] = [];
		if (prob != null && prob > 0) parts.push(`Probability: ${prob}%`);
		if (precip != null && precip > 0) parts.push(`Amount: ${precip.toFixed(1)} ${precipUnit}`);
		return parts.join('\n');
	}

	/** A value the model actually produced (NaN pads everything past its horizon). */
	const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

	function formatTemp(temp: number | null): string {
		return finite(temp) ? `${temp.toFixed(0)}°` : '–';
	}

	function formatValue(val: number | null): string {
		return finite(val) ? val.toFixed(0) : '–';
	}

	let dayIdx = $derived(getDayIndices(data.hourlyDates, selectedDay));
	let is3h = $derived(hourlyInterval === 3);
	let daytimeFlags = $derived(dayIdx.map((idx) => isDaytime(data.hourlyDates[idx])));

	let cellData = $derived(
		dayIdx.map((idx, i) => {
			const date = data.hourlyDates[idx];
			const tz = data.timezone;
			const isNow =
				formatZoned(date, tz, 'yyyy-MM-dd HH') === formatZoned(today, tz, 'yyyy-MM-dd HH');

			// a column past the model's horizon: nothing to show in any row
			const hasData = [
				data.hourly.temperature_2m,
				data.hourly.weather_code,
				data.hourly.windspeed_10m,
				data.hourly.relative_humidity_2m,
				data.hourly.cloud_cover,
				data.hourly.precipitation
			].some((arr) => arr != null && Number.isFinite(arr[idx]));

			return {
				idx,
				date,
				isNow,
				isDaytime: daytimeFlags[i],
				hasData
			};
		})
	);

	// A model that doesn't carry a variable returns an empty or all-NaN array.
	// Those rows are dimmed rather than shown as a wall of dashes.
	let rowHasData = $derived.by((): Record<string, boolean> => {
		const has = (arr: number[] | undefined) =>
			arr != null && cellData.some((c) => finite(arr[c.idx]));
		return {
			icons: has(data.hourly.weather_code),
			temperature: has(data.hourly.temperature_2m),
			feels: has(data.hourly.apparent_temperature),
			dew_point: has(data.hourly.dew_point_2m),
			wind: has(data.hourly.windspeed_10m),
			gusts: has(data.hourly.wind_gusts_10m),
			humidity: has(data.hourly.relative_humidity_2m),
			clouds: has(data.hourly.cloud_cover),
			pressure: has(data.hourly.pressure_msl),
			uv: has(data.hourly.uv_index),
			visibility: has(data.hourly.visibility),
			precipitation: has(data.hourly.precipitation),
			snowfall: has(data.hourly.snowfall)
		};
	});

	let sunrisePercent = $derived(
		sunTimes && cellData.length > 0 ? timeToFraction(sunTimes.sunrise) * 100 : null
	);
	let sunsetPercent = $derived(
		sunTimes && cellData.length > 0 ? timeToFraction(sunTimes.sunset) * 100 : null
	);

	// ─── "Now" indicator ─────────────────────────────────────────────────────
	// Full-height vertical line across the table, positioned at the current
	// time within the selected day (only when the selected day is today).
	let isTodaySelected = $derived(
		cellData.length > 0 && isSameDayInZone(today, selectedDay, data.timezone)
	);
	let nowPercent = $derived(isTodaySelected ? timeToFraction(today) * 100 : null);

	// Width of the row-header column, measured so the now-line can be
	// positioned relative to the data columns only.
	let headerColWidth = $state(0);
	let tableWidth = $state(0);
	// Measured so the centred NOW badge can be clamped fully inside the row:
	// centred on a time near midnight it would poke past the last column and
	// hand the scroller a sliver of phantom overflow.
	let nowBadgeWidth = $state(0);
	let nowLeftPx = $derived(
		nowPercent != null && tableWidth > 0
			? headerColWidth + (nowPercent / 100) * (tableWidth - headerColWidth)
			: null
	);

	const NOW_LINE_W = 2;

	// The line is painted as a background on the one cell it crosses (see the
	// .now-cell rule) rather than as an overlay on top of the table, so it sits
	// above each cell's colour tint but below its value and icon.
	let nowCell = $derived.by((): { idx: number; offset: number } | null => {
		if (nowLeftPx == null || cellData.length === 0) return null;
		const colWidth = (tableWidth - headerColWidth) / cellData.length;
		if (colWidth <= NOW_LINE_W) return null;
		const col = Math.floor((nowLeftPx - headerColWidth) / colWidth);
		if (col < 0 || col >= cellData.length) return null;
		// keep the full line width inside the cell, which clips its overflow
		const offset = nowLeftPx - headerColWidth - col * colWidth - NOW_LINE_W / 2;
		return {
			idx: cellData[col].idx,
			offset: Math.max(0, Math.min(colWidth - NOW_LINE_W, offset))
		};
	});

	// ─── Auto-scroll the (overflowing) table on day / interval change ────────────
	// • Day change → today lands on the current-hour cell, other days on 06:00.
	// • Interval change (3h ↔ 1h) → keep whatever cell is currently on the left.
	let tableScrollEl = $state<HTMLDivElement>();
	let autoScrolledDay = -1;
	let lastInterval = 0;
	let viewLeftHour = 6; // zoned hour at the left edge (plain, non-reactive)

	function colWidthPx(): number {
		return (tableWidth - headerColWidth) / cellData.length;
	}

	function scrollToIdx(idx: number) {
		const el = tableScrollEl;
		if (!el) return;
		if (el.scrollWidth <= el.clientWidth + 4) {
			el.scrollLeft = 0;
			return;
		}
		el.scrollLeft = idx <= 0 ? 0 : Math.max(0, idx * colWidthPx());
	}

	// track the left-most visible cell's hour so an interval switch can restore it
	function onTableScroll() {
		const el = tableScrollEl;
		if (!el || cellData.length === 0 || tableWidth === 0) return;
		const idx = Math.min(
			cellData.length - 1,
			Math.max(0, Math.round(el.scrollLeft / colWidthPx()))
		);
		viewLeftHour = getZonedHour(cellData[idx].date, data.timezone);
	}

	$effect(() => {
		const day = selectedDay.getTime();
		const interval = is3h ? 3 : 1;
		const el = tableScrollEl;
		if (!el || cellData.length === 0 || tableWidth === 0 || headerColWidth === 0) return;
		const dayChanged = autoScrolledDay !== day;
		const intervalChanged = lastInterval !== interval;
		if (!dayChanged && !intervalChanged) return;
		autoScrolledDay = day;
		lastInterval = interval;

		let targetIdx: number;
		if (dayChanged) {
			// today → the cell whose block contains "now"; otherwise → 06:00
			const nowMs = today.getTime();
			const stepMs = interval * 3600 * 1000;
			const nowIdx = cellData.findIndex(
				(c) => nowMs >= c.date.getTime() && nowMs < c.date.getTime() + stepMs
			);
			targetIdx =
				nowIdx >= 0 ? nowIdx : cellData.findIndex((c) => getZonedHour(c.date, data.timezone) >= 6);
			viewLeftHour = targetIdx >= 0 ? getZonedHour(cellData[targetIdx].date, data.timezone) : 6;
		} else {
			// interval change only: keep the same cell on the left
			targetIdx = cellData.findIndex((c) => getZonedHour(c.date, data.timezone) >= viewLeftHour);
		}
		requestAnimationFrame(() => scrollToIdx(targetIdx));
	});

	// ─── Chart-hover mirror ─────────────────────────────────────────────────────
	// When the shared meteogram is hovered, highlight the matching table column
	// (only if the hovered time falls on the day the table is currently showing).
	let chartHoverTime = $derived(groupHover(METEOGRAM_GROUP)); // epoch seconds, or null
	let hoveredCol = $derived.by((): number => {
		if (chartHoverTime == null || cellData.length === 0) return -1;
		const stepMs = (is3h ? 3 : 1) * 3600 * 1000;
		const tMs = chartHoverTime * 1000;
		for (let i = 0; i < cellData.length; i++) {
			const start = cellData[i].date.getTime();
			if (tMs >= start && tMs < start + stepMs) return i;
		}
		return -1;
	});
</script>

{#snippet weatherIcon(name: string, size: number = 16, description: string = '')}
	<svg class="inline-block fill-foreground" width={size} height={size}>
		{#if description}<title>{description}</title>{/if}
		<use xlink:href="/images/weather-icons/{name}.svg#Layer_1"></use>
	</svg>
{/snippet}

{#snippet rowHeader(iconName?: string, unit?: string, label?: string)}
	<th class="hdr" scope="row">
		<div class="flex flex-col items-center gap-0.5 leading-tight">
			{#if iconName}
				{@render weatherIcon(iconName, 18)}
			{/if}
			{#if label}
				<span class="text-[11px] font-semibold">{label}</span>
			{/if}
			{#if unit}
				<span class="text-[10px] font-medium text-muted-foreground">{unit}</span>
			{/if}
		</div>
	</th>
{/snippet}

{#if cellData.length > 0}
	{@const hourly = data.hourly}
	{@const iconPx = is3h ? 38 : 33}
	<!-- Full-bleed to the viewport edges on mobile (main has p-3 = 0.75rem);
	     a contained rounded card on md+ -->
	<section
		transition:fade={{ duration: 200 }}
		class="-mx-3 overflow-hidden border-y border-border/70 bg-card shadow-sm md:mx-0 md:rounded-2xl md:border"
	>
		<!-- Card toolbar -->
		<div
			class="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/40 px-4 py-2.5"
		>
			<h3 class="text-base font-bold">
				{formatZoned(selectedDay, data.timezone, 'EEEE')}
				<span class="font-semibold text-muted-foreground">– {m.hourly_heading()}</span>
				<span
					class="ms-2 rounded-full bg-muted px-2 py-0.5 align-middle text-[10px] font-semibold text-muted-foreground"
				>
					{timezoneLabel}
				</span>
			</h3>
			<div class="flex items-center gap-2">
				{#if onCustomize}
					<button
						class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
						onclick={onCustomize}
						aria-label={m.table_customize()}
					>
						<!-- sliders icon -->
						<svg
							class="h-4 w-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							stroke-width="1.75"
						>
							<path
								stroke-linecap="round"
								d="M4 6h9m5 0h2M4 12h2m5 0h9M4 18h9m5 0h2M13 4.5v3M6 10.5v3M18 16.5v3"
							/>
						</svg>
						<span class="hidden sm:inline">{m.hourly_variables()}</span>
					</button>
				{/if}
				<div
					class="inline-flex items-center rounded-lg bg-muted p-0.5 text-[13px] font-semibold"
					role="group"
					aria-label={m.table_interval_aria()}
				>
					{#each [3, 1] as interval (interval)}
						<button
							class="cursor-pointer rounded-md px-3 py-1 transition-colors {hourlyInterval ===
							interval
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'}"
							aria-pressed={hourlyInterval === interval}
							onclick={() => storedHourlyInterval.set(interval as 1 | 3)}
						>
							{interval}h
						</button>
					{/each}
				</div>
			</div>
		</div>

		<!-- Below the min-width the table scrolls sideways instead of squeezing;
		     1h needs far more room than 3h (24 vs 8 columns) -->
		<div class="overflow-x-auto" bind:this={tableScrollEl} onscroll={onTableScroll}>
			<div
				class="relative {is3h
					? 'min-w-[400px] md:min-w-[560px]'
					: 'min-w-[780px] md:min-w-[1100px]'}"
				style="--now-x:{nowCell?.offset ?? 0}px"
				bind:clientWidth={tableWidth}
			>
				<table class="w-full table-fixed border-collapse whitespace-nowrap">
					<caption class="sr-only">Hourly weather details for {locationName}</caption>
					<colgroup>
						<col class="w-16 md:w-20" />
						{#each cellData as _ (_.idx)}
							<col />
						{/each}
					</colgroup>
					<tbody>
						<!-- Time + Daylight bar (merged) -->
						<tr class="row">
							<th class="hdr" scope="row" bind:clientWidth={headerColWidth}>
								<span class="text-[10px] font-semibold text-muted-foreground">{m.var_time()}</span>
							</th>
							<td
								colspan={cellData.length}
								class="relative h-12 cursor-default overflow-visible p-0"
								onmousemove={hoverTimeRow}
								onmouseleave={clearTimeRowHover}
							>
								<!-- Daylight background -->
								{#if sunTimes && sunrisePercent != null && sunsetPercent != null}
									<div
										class="absolute inset-y-0 left-0 bg-indigo-950/10 dark:bg-indigo-950/40"
										style="width:{sunrisePercent}%"
									></div>
									<div
										class="absolute inset-y-0 bg-amber-400/15 dark:bg-amber-300/10"
										style="left:{sunrisePercent}%;width:{sunsetPercent - sunrisePercent}%"
									></div>
									<div
										class="absolute inset-y-0 right-0 bg-indigo-950/10 dark:bg-indigo-950/40"
										style="width:{100 - sunsetPercent}%"
									></div>
									<!-- Sunrise marker + label -->
									<div
										class="absolute inset-y-0 w-px bg-amber-500/70"
										style="left:{sunrisePercent}%"
									>
										<span
											class="absolute bottom-0.5 left-1 text-[10px] leading-none font-semibold whitespace-nowrap text-amber-700 dark:text-amber-300"
										>
											<svg
												class="inline-block fill-foreground"
												width="12px"
												height="12px"
												aria-hidden="true"
											>
												<use
													class="stroke-2"
													xlink:href="/images/weather-icons/wi-sunrise.svg#Layer_1"
												></use>
											</svg>
											<span class="align-middle">{formatTime(sunTimes.sunrise)}</span>
										</span>
									</div>
									<!-- Sunset marker + label -->
									<div
										class="absolute inset-y-0 w-px bg-indigo-400/70"
										style="left:{sunsetPercent}%"
									>
										<span
											class="absolute right-1 bottom-0.5 inline-flex items-center gap-1 text-[10px] leading-none font-semibold whitespace-nowrap text-indigo-600 dark:text-indigo-300"
										>
											<svg
												class="inline-block fill-foreground"
												width="12px"
												height="12px"
												aria-hidden="true"
											>
												<use
													class="stroke-2"
													xlink:href="/images/weather-icons/wi-sunset.svg#Layer_1"
												></use>
											</svg>
											<span class="align-middle">{formatTime(sunTimes.sunset)}</span>
										</span>
									</div>
								{/if}
								<!-- Current-time line across the time row. Placed before the hour
								     labels so it paints under them, like it does in the rows below. -->
								{#if nowPercent != null}
									<div
										class="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-red-500/75"
										style="left:clamp(1px, {nowPercent}%, calc(100% - 1px))"
									></div>
								{/if}
								<!-- "Now" label, aligned with the sunrise/sunset labels along the
								     bottom; its centre is clamped so the pill never leaves the row -->
								{#if isTodaySelected && nowPercent != null}
									<span
										bind:clientWidth={nowBadgeWidth}
										class="absolute bottom-0.5 z-15 -translate-x-1/2 rounded-full bg-red-500 px-1.5 py-px text-[9px] font-bold tracking-wide whitespace-nowrap text-white uppercase shadow-sm"
										style="left:clamp({nowBadgeWidth /
											2}px, {nowPercent}%, calc(100% - {nowBadgeWidth / 2}px))"
									>
										{m.table_now()}
									</span>
								{/if}
								<!-- Hour labels -->
								{#each cellData as cell, i (cell.idx)}
									{@const leftPct = (i / cellData.length) * 100}
									{@const widthPct = 100 / cellData.length}
									<span
										class:col-empty={!cell.hasData}
										class:now-label={cell.idx === nowCell?.idx}
										class="absolute top-0 flex items-start pl-1 font-bold {is3h
											? 'pt-2 text-sm'
											: 'pt-2.5'}
									{cell.isNow ? 'text-red-600 dark:text-red-400' : ''}"
										style="left:{leftPct}%;width:{widthPct}%"
									>
										{#if is3h}
											<span class="inline-flex items-baseline gap-0.5">
												<span>{formatZoned(cell.date, data.timezone, 'HH')}</span>
												<sup
													class="align-baseline translate-y-px text-[10px] leading-none font-semibold {cell.isNow
														? 'text-red-500 dark:text-red-400'
														: 'text-muted-foreground'}">00</sup
												>
											</span>
										{:else}
											<span class="inline-flex items-baseline gap-1">
												<span class="text-[11px] font-semibold"
													>{formatZoned(cell.date, data.timezone, 'HH')}</span
												>
												<sup
													class="inline-block -translate-x-0.5 translate-y-[0.16rem] align-baseline text-[9px] leading-none font-semibold {cell.isNow
														? 'text-red-500 dark:text-red-400'
														: 'text-muted-foreground'}">00</sup
												>
											</span>
										{/if}
									</span>
								{/each}
							</td>
						</tr>

						<!-- Weather Icons -->
						{#each rowOrder as rowKey (rowKey)}
							{#if rowKey === 'icons' && showRow('icons')}
								<tr class="row" class:row-empty={rowHasData[rowKey] === false}>
									{@render rowHeader('wi-day-cloudy')}
									{#each cellData as cell, i (cell.idx)}
										{@const wCode = hourly.weather_code[cell.idx]}
										<td
											class:col-empty={!cell.hasData}
											class:now-cell={cell.idx === nowCell?.idx}
											class="cell h-12 leading-0"
											class:cell-empty={!finite(wCode)}
											class:icon-day={cell.isDaytime}
											class:icon-night={!cell.isDaytime}
											class:icon-dawn={!cell.isDaytime && cellData[i + 1]?.isDaytime}
											class:icon-dusk={cell.isDaytime &&
												cellData[i + 1] &&
												!cellData[i + 1].isDaytime}
										>
											{#if finite(wCode)}
												{@render weatherIcon(
													getWeatherIconName(wCode, cell.isDaytime),
													iconPx,
													getWeatherDescription(wCode)
												)}
											{/if}
										</td>
									{/each}
								</tr>
								<!-- Temperature -->
							{:else if rowKey === 'temperature' && showRow('temperature')}
								<tr class="row" class:row-empty={rowHasData[rowKey] === false}>
									{@render rowHeader('wi-thermometer', tempUnit, m.var_temperature_short())}
									{#each cellData as cell (cell.idx)}
										{@const temp = hourly.temperature_2m[cell.idx]}
										{@const style = getTempStyle(temp, String(units.temperature_unit))}
										<td
											class:col-empty={!cell.hasData}
											class:now-cell={cell.idx === nowCell?.idx}
											class="cell h-12 font-bold {is3h ? 'text-lg' : 'text-[15px]'}"
											style={finite(temp)
												? `background-color:${style.bg};color:${style.fg};--now-halo:${style.bg}`
												: ''}
										>
											{formatTemp(temp)}
										</td>
									{/each}
								</tr>
								<!-- Feels Like (short row) -->
							{:else if rowKey === 'feels' && showRow('feels')}
								<tr class="row" class:row-empty={rowHasData[rowKey] === false}>
									{@render rowHeader(undefined, tempUnit, m.var_apparent_short())}
									{#each cellData as cell (cell.idx)}
										{@const temp = hourly.apparent_temperature[cell.idx]}
										<td
											class:col-empty={!cell.hasData}
											class:now-cell={cell.idx === nowCell?.idx}
											class="cell h-12 text-muted-foreground {is3h ? 'text-[13px]' : 'text-[11px]'}"
										>
											{formatTemp(temp)}
										</td>
									{/each}
								</tr>
								<!-- Dew Point (short row; off by default) -->
							{:else if rowKey === 'dew_point' && showRow('dew_point')}
								<tr class="row" class:row-empty={rowHasData[rowKey] === false}>
									{@render rowHeader('wi-raindrop', tempUnit, m.var_dew_point_short())}
									{#each cellData as cell (cell.idx)}
										{@const temp = hourly.dew_point_2m?.[cell.idx]}
										<td
											class:col-empty={!cell.hasData}
											class:now-cell={cell.idx === nowCell?.idx}
											class="cell h-12 text-muted-foreground {is3h ? 'text-[13px]' : 'text-[11px]'}"
										>
											{formatTemp(temp)}
										</td>
									{/each}
								</tr>
								<!-- Wind -->
							{:else if rowKey === 'wind' && showRow('wind')}
								<tr class="row" class:row-empty={rowHasData[rowKey] === false}>
									{@render rowHeader('wi-strong-wind', windUnit, m.var_wind_short())}
									{#each cellData as cell (cell.idx)}
										{@const wind = hourly.windspeed_10m[cell.idx]}
										{@const windDir = hourly.winddirection_10m[cell.idx]}
										<td
											class:col-empty={!cell.hasData}
											class:now-cell={cell.idx === nowCell?.idx}
											class="relative cell h-12 align-middle leading-none"
										>
											{#if windDir != null && !isNaN(windDir)}
												<span
													class="absolute top-0 left-1/2 inline-block origin-center leading-0"
													style="transform: translateX(-50%) {getWindArrowRotation(windDir)}"
												>
													{@render weatherIcon('wi-direction-down', 40)}
												</span>
											{/if}
											<span class="mt-5 block font-semibold {is3h ? 'text-[13px]' : 'text-[11px]'}">
												{formatValue(wind)}
											</span>
										</td>
									{/each}
								</tr>
								<!-- Wind Gusts (off by default) -->
							{:else if rowKey === 'gusts' && showRow('gusts')}
								<tr class="row" class:row-empty={rowHasData[rowKey] === false}>
									{@render rowHeader('wi-strong-wind', windUnit, m.var_gusts_short())}
									{#each cellData as cell (cell.idx)}
										{@const v = hourly.wind_gusts_10m?.[cell.idx]}
										<td
											class:col-empty={!cell.hasData}
											class:now-cell={cell.idx === nowCell?.idx}
											class="cell h-12 font-semibold text-foreground/80 {is3h
												? 'text-sm'
												: 'text-xs'}"
										>
											{formatValue(v)}
										</td>
									{/each}
								</tr>
								<!-- Humidity (short row) -->
							{:else if rowKey === 'humidity' && showRow('humidity')}
								<tr class="row" class:row-empty={rowHasData[rowKey] === false}>
									{@render rowHeader('wi-humidity', '%', m.var_humidity())}
									{#each cellData as cell (cell.idx)}
										{@const hum = hourly.relative_humidity_2m[cell.idx]}
										<td
											class:col-empty={!cell.hasData}
											class:now-cell={cell.idx === nowCell?.idx}
											class="cell h-12"
											style={finite(hum) ? `background:${getHumidityBg(hum)}` : ''}
										>
											{formatValue(hum)}
										</td>
									{/each}
								</tr>
								<!-- Cloud Cover -->
							{:else if rowKey === 'clouds' && showRow('clouds')}
								<tr class="row" class:row-empty={rowHasData[rowKey] === false}>
									{@render rowHeader('wi-cloud', '%', m.var_cloud_short())}
									{#each cellData as cell (cell.idx)}
										{@const cloud = hourly.cloud_cover[cell.idx]}
										<td
											class:col-empty={!cell.hasData}
											class:now-cell={cell.idx === nowCell?.idx}
											class="cell h-12"
											style={finite(cloud)
												? `background:rgba(140,160,180,${getCloudOpacity(cloud)})`
												: ''}
										>
											{formatValue(cloud)}
										</td>
									{/each}
								</tr>
								<!-- Pressure (off by default) -->
							{:else if rowKey === 'pressure' && showRow('pressure')}
								<tr class="row" class:row-empty={rowHasData[rowKey] === false}>
									{@render rowHeader('wi-barometer', 'hPa', m.var_pressure_short())}
									{#each cellData as cell (cell.idx)}
										{@const v = hourly.pressure_msl?.[cell.idx]}
										<td
											class:col-empty={!cell.hasData}
											class:now-cell={cell.idx === nowCell?.idx}
											class="cell h-12 {is3h ? 'text-sm' : 'text-xs'}"
											style="background:{getPressureBg(v ?? null)}"
										>
											{v != null && !isNaN(v) ? v.toFixed(0) : '-'}
										</td>
									{/each}
								</tr>
								<!-- UV Index (off by default) -->
							{:else if rowKey === 'uv' && showRow('uv')}
								<tr class="row" class:row-empty={rowHasData[rowKey] === false}>
									{@render rowHeader('wi-day-sunny', 'UV', m.var_uv_short())}
									{#each cellData as cell (cell.idx)}
										{@const v = hourly.uv_index?.[cell.idx]}
										<td
											class:col-empty={!cell.hasData}
											class:now-cell={cell.idx === nowCell?.idx}
											class="cell h-12 font-semibold {is3h ? 'text-sm' : 'text-xs'}"
											style="background:{getUvBg(v ?? null)}"
										>
											{v != null && !isNaN(v) ? v.toFixed(0) : '-'}
										</td>
									{/each}
								</tr>
								<!-- Visibility (off by default) -->
							{:else if rowKey === 'visibility' && showRow('visibility')}
								<tr class="row" class:row-empty={rowHasData[rowKey] === false}>
									{@render rowHeader('wi-fog', 'km', m.var_visibility_short())}
									{#each cellData as cell (cell.idx)}
										{@const v = hourly.visibility?.[cell.idx]}
										<td
											class:col-empty={!cell.hasData}
											class:now-cell={cell.idx === nowCell?.idx}
											class="cell h-12 {is3h ? 'text-sm' : 'text-xs'}"
										>
											{v != null && !isNaN(v) ? (v / 1000).toFixed(0) : '-'}
										</td>
									{/each}
								</tr>
								<!-- Precipitation -->
							{:else if rowKey === 'precipitation' && showRow('precipitation')}
								<tr class="row" class:row-empty={rowHasData[rowKey] === false}>
									{@render rowHeader('wi-raindrop', precipUnit, m.var_precipitation_short())}
									{#each cellData as cell (cell.idx)}
										{@const precip = getCellPrecip(cell.idx)}
										{@const prob = hourly.precipitation_probability[cell.idx]}
										<td
											class:col-empty={!cell.hasData}
											class:now-cell={cell.idx === nowCell?.idx}
											class="cell precip-cell h-12"
											style="background:{getPrecipProbBg(prob ?? 0)}"
											title={formatPrecipTooltip(precip, prob)}
										>
											{#if precip != null && precip > 0}
												<div class="precip-bar" style="height:{getPrecipBarHeight(precip)}%"></div>
												<span class="precip-label {is3h ? 'text-[13px]' : 'text-[10px]'}">
													{precip.toFixed(1)}
												</span>
											{/if}
										</td>
									{/each}
								</tr>
								<!-- Snowfall (off by default) -->
							{:else if rowKey === 'snowfall' && showRow('snowfall')}
								<tr class="row" class:row-empty={rowHasData[rowKey] === false}>
									{@render rowHeader('wi-snow', 'cm', m.var_snowfall_short())}
									{#each cellData as cell (cell.idx)}
										{@const v = hourly.snowfall?.[cell.idx]}
										<td
											class:col-empty={!cell.hasData}
											class:now-cell={cell.idx === nowCell?.idx}
											class="cell h-12 {is3h ? 'text-sm' : 'text-xs'}"
										>
											{v != null && !isNaN(v) && v > 0 ? v.toFixed(1) : '-'}
										</td>
									{/each}
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>

				<!-- Hovered-column highlight, mirroring the meteogram crosshair.
				     max-width caps the box at the wrapper's true (fractional) right
				     edge: the widths here derive from rounded clientWidth bindings, so
				     on the last column left+width can land a fraction of a pixel past
				     the edge - enough scrollable overflow for a phantom scrollbar. -->
				{#if hoveredCol >= 0 && tableWidth > 0}
					{@const colWidth = (tableWidth - headerColWidth) / cellData.length}
					{@const colLeft = headerColWidth + hoveredCol * colWidth}
					<div
						class="pointer-events-none absolute inset-y-0 z-10 border-x border-primary/40 bg-primary/10"
						style="left:{colLeft}px;width:{colWidth}px;max-width:calc(100% - {colLeft}px)"
					></div>
				{/if}

				<!-- "Now" column highlight. The current-time line itself is painted per
				     cell (.now-cell) so it stays under the values and icons. Same
				     max-width cap as the hover highlight above. -->
				{#if nowLeftPx != null}
					{@const colWidth = (tableWidth - headerColWidth) / cellData.length}
					{@const nowIdx = cellData.findIndex((c) => c.isNow)}
					{#if nowIdx >= 0}
						{@const colLeft = headerColWidth + nowIdx * colWidth}
						<div
							class="pointer-events-none absolute inset-y-0 z-10 border-x border-red-500/30 bg-red-500/5"
							style="left:{colLeft}px;width:{colWidth}px;max-width:calc(100% - {colLeft}px)"
						></div>
					{/if}
				{/if}
			</div>
		</div>
	</section>
{/if}

<style>
	/* ── Uniform grid ───────────────────────────────────────────── */
	.row + .row {
		border-top: 1px solid color-mix(in oklab, var(--color-border) 70%, transparent);
	}

	.cell {
		padding: 2px;
		text-align: center;
		font-size: 13px;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		overflow: hidden;
	}

	.cell + .cell {
		border-left: 1px solid color-mix(in oklab, var(--color-border) 35%, transparent);
	}

	/* ── Row header ─────────────────────────────────────────────── */
	.hdr {
		/* sticky + opaque background: stays readable while the table is
		   scrolled sideways (z above the "now" overlay, which is z-10) */
		position: sticky;
		left: 0;
		z-index: 20;
		padding: 4px 2px;
		text-align: center;
		font-weight: 600;
		font-size: 11px;
		background: color-mix(in oklab, var(--color-muted) 45%, var(--color-card));
		border-right: 1px solid var(--color-border);
		white-space: nowrap;
		overflow: hidden;
	}

	/* A row the selected model carries no data for: legible, clearly inactive,
	   and not competing with the rows that do have values. */
	.row-empty {
		opacity: 0.4;
	}

	/* An individual cell past the point where the model stopped: drop the
	   day/night tinting so the gap reads as "no data" rather than clear sky. */
	.cell-empty {
		background: none !important;
	}

	/* ── Current-time line ──────────────────────────────────────────
	   Values sit on top of the line, so they get a soft halo in the colour of
	   whatever is behind them: the card by default, or the cell's own colour on
	   rows that paint one (set inline as --now-halo). Just enough to keep the
	   line from cutting through a glyph. */
	.now-cell,
	.now-label {
		--now-halo: var(--color-card);
		text-shadow:
			0 0 2px var(--now-halo),
			0 0 4px var(--now-halo);
	}

	/* Same idea for the weather and wind-arrow icons, which text-shadow can't
	   reach. */
	.now-cell svg {
		filter: drop-shadow(0 0 2px var(--now-halo)) drop-shadow(0 0 3px var(--now-halo));
	}

	/* The line itself: a background layer on the single cell it crosses (--now-x
	   is its offset within that cell). A background paints above the cell's own
	   colour tint but below its text and icons, which an overlay element on top
	   of the table can't do. !important because several rows set their tint with
	   the `background` shorthand inline, which would otherwise reset this image. */
	.now-cell {
		--now-line-color: color-mix(in oklab, var(--color-red-500) 75%, transparent);
		--now-line: linear-gradient(
			to right,
			transparent var(--now-x),
			var(--now-line-color) var(--now-x),
			var(--now-line-color) calc(var(--now-x) + 2px),
			transparent calc(var(--now-x) + 2px)
		);
		background-image: var(--now-line) !important;
		background-repeat: no-repeat !important;
	}

	/* The row separator is painted over cell backgrounds, so it would chop the
	   line into per-row segments. On these cells it is switched off (a cell
	   border wins the collapse against the row's, same width and style) and
	   redrawn as a background layer below the line instead. */
	.row + .row .now-cell {
		border-top: 1px solid transparent;
		background-image:
			var(--now-line),
			linear-gradient(
				to bottom,
				color-mix(in oklab, var(--color-border) 70%, transparent) 1px,
				transparent 1px
			) !important;
		background-repeat: no-repeat, no-repeat !important;
	}

	/* A whole column the model never reached - dimmed end to end, hour label
	   included, so the point where the forecast runs out is obvious. */
	.col-empty {
		opacity: 0.35;
	}

	/* ── Precipitation ──────────────────────────────────────────── */
	.precip-cell {
		position: relative;
		padding: 0;
	}

	.precip-bar {
		position: absolute;
		bottom: 0;
		left: 15%;
		right: 15%;
		min-height: 3px;
		border-radius: 2px 2px 0 0;
		background: linear-gradient(to top, rgba(30, 120, 220, 0.5), rgba(30, 120, 220, 0.9));
		pointer-events: none;
	}

	.precip-label {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		font-weight: 700;
		color: rgba(20, 60, 160, 0.9);
		pointer-events: none;
	}

	:global(.dark) .precip-label {
		color: rgba(140, 190, 255, 0.95);
	}

	/* ── Responsive ─────────────────────────────────────────────── */
	/* Phones: the table is the tallest thing on the page, so every cell is taken
	   down to roughly 0.7 of its desktop size - padding, type and the icons that
	   actually set the row height. Desktop keeps its original metrics. */
	@media (max-width: 768px) {
		.hdr {
			padding: 2px 1px;
			font-size: 9px;
		}
		.cell {
			padding: 1px;
			font-size: 10px;
		}
		/* The row-header icon was setting the height of every row it sat in - the
		   stacked icon + label + unit needed ~52px while the value cells only
		   needed 34. The label already names the row, so on phones the icon goes
		   and the cells decide the height. */
		.hdr :global(svg) {
			display: none;
		}
		.cell :global(svg) {
			width: 22px;
			height: 22px;
		}
		.cell {
			height: 34px;
		}
		/* except precipitation, whose cell is a bar chart and needs the room */
		.precip-cell {
			height: 46px;
		}
		.hdr :global(span) {
			font-size: 9px;
			line-height: 1.15;
		}
		.precip-bar {
			min-height: 2px;
		}
	}
</style>
