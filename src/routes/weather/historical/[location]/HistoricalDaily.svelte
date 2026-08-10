<script lang="ts">
	import { formatZoned, isSameDayInZone } from '$lib/utils/date';

	import * as m from '$lib/paraglide/messages';
	import {
		type ClimateNormals,
		type HistoricalDailyData,
		monthDayToOrdinal
	} from '$lib/services/weather';

	import { getColor, getTempStyle } from '../../utils/colors';
	import { getWeatherDescription, getWeatherIconName } from '../../utils/weather-codes';
	import { type WeatherUnits, getPrecipUnit, getTempUnit } from '../../week/[location]/types';

	interface Props {
		daily: HistoricalDailyData;
		dailyDates: Date[];
		timezone: string;
		units: WeatherUnits;
		normals: ClimateNormals | null;
		selectedDay: Date;
		onSelectDay: (date: Date) => void;
	}

	let { daily, dailyDates, timezone, units, normals, selectedDay, onSelectDay }: Props = $props();

	const tempUnit = $derived(getTempUnit(units));
	const precipUnit = $derived(getPrecipUnit(units));

	// Day-of-year ordinal for each day, so we can look up its climate normal.
	let ordinals = $derived(
		dailyDates.map((d) =>
			monthDayToOrdinal(
				Number(formatZoned(d, timezone, 'M')),
				Number(formatZoned(d, timezone, 'd'))
			)
		)
	);

	const finite = (v: number | undefined): v is number => v != null && Number.isFinite(v);
	const mean = (xs: number[]): number =>
		xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

	// ─── Range scaling for the min/max bars ─────────────────────────────────────
	const BAR_H = 78;
	let scale = $derived.by(() => {
		const lo = Math.min(...daily.temperature_2m_min.filter(finite));
		const hi = Math.max(...daily.temperature_2m_max.filter(finite));
		const span = hi - lo || 1;
		return { lo, hi, span };
	});
	const yOf = (v: number): number => (1 - (v - scale.lo) / scale.span) * BAR_H;

	// ─── Summary statistics ─────────────────────────────────────────────────────
	let stats = $derived.by(() => {
		const means = daily.temperature_2m_mean.filter(finite);
		const avg = mean(means);

		// warmest / coldest day
		let warm = { t: -Infinity, i: -1 };
		let cold = { t: Infinity, i: -1 };
		for (let i = 0; i < dailyDates.length; i++) {
			const mx = daily.temperature_2m_max[i];
			const mn = daily.temperature_2m_min[i];
			if (finite(mx) && mx > warm.t) warm = { t: mx, i };
			if (finite(mn) && mn < cold.t) cold = { t: mn, i };
		}

		const totalPrecip = daily.precipitation_sum.filter(finite).reduce((a, b) => a + b, 0);
		const wetDays = daily.precipitation_sum.filter((p) => finite(p) && p >= 1).length;

		// climate comparison (only when normals are available)
		let tempAnomaly: number | null = null;
		let normalPrecip: number | null = null;
		if (normals) {
			const normMeans: number[] = [];
			let np = 0;
			let npCount = 0;
			for (let i = 0; i < ordinals.length; i++) {
				const nm = normals.tmean[ordinals[i]];
				if (finite(nm)) normMeans.push(nm);
				const npv = normals.precip[ordinals[i]];
				if (finite(npv)) {
					np += npv;
					npCount++;
				}
			}
			if (normMeans.length && finite(avg)) tempAnomaly = avg - mean(normMeans);
			if (npCount) normalPrecip = np;
		}

		return { avg, warm, cold, totalPrecip, wetDays, tempAnomaly, normalPrecip };
	});

	const fmtTemp = (v: number): string => (finite(v) ? `${v.toFixed(1)}°` : '–');
	const fmtSigned = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)}°`;
	const fmtPrecip = (v: number): string => `${v.toFixed(v < 10 ? 1 : 0)} ${precipUnit}`;

	function anomalyColor(delta: number): string {
		const a = Math.min(0.9, 0.25 + Math.abs(delta) / 12);
		return delta >= 0 ? `rgba(220, 70, 60, ${a})` : `rgba(50, 110, 210, ${a})`;
	}
</script>

<!-- ─── KPI tiles ────────────────────────────────────────────────────────────── -->
<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
	<div class="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
		<p class="text-xs font-medium text-muted-foreground">{m.stat_avg_temperature()}</p>
		<p class="mt-1 text-2xl font-bold tabular-nums">
			{fmtTemp(stats.avg)}<span class="text-base font-semibold text-muted-foreground"
				>{tempUnit.replace('°', '')}</span
			>
		</p>
		{#if stats.tempAnomaly != null}
			<p
				class="mt-0.5 text-xs font-semibold"
				class:text-red-600={stats.tempAnomaly >= 0}
				class:text-blue-600={stats.tempAnomaly < 0}
				class:dark:text-red-400={stats.tempAnomaly >= 0}
				class:dark:text-blue-400={stats.tempAnomaly < 0}
			>
				{m.anomaly_vs_normal({ value: fmtSigned(stats.tempAnomaly) })}
			</p>
		{:else}
			<p class="mt-0.5 text-xs text-muted-foreground">{m.normals_loading_period()}</p>
		{/if}
	</div>

	<div class="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
		<p class="text-xs font-medium text-muted-foreground">{m.stat_total_precipitation()}</p>
		<p class="mt-1 text-2xl font-bold tabular-nums">{fmtPrecip(stats.totalPrecip)}</p>
		{#if stats.normalPrecip != null}
			<p class="mt-0.5 text-xs font-semibold text-muted-foreground">
				normal {fmtPrecip(stats.normalPrecip)} · {stats.wetDays} wet {stats.wetDays === 1
					? 'day'
					: 'days'}
			</p>
		{:else}
			<p class="mt-0.5 text-xs text-muted-foreground">{stats.wetDays} wet days</p>
		{/if}
	</div>

	<div class="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
		<p class="text-xs font-medium text-muted-foreground">{m.stat_warmest_day()}</p>
		<p class="mt-1 text-2xl font-bold tabular-nums">{fmtTemp(stats.warm.t)}</p>
		{#if stats.warm.i >= 0}
			<p class="mt-0.5 text-xs font-semibold text-muted-foreground">
				{formatZoned(dailyDates[stats.warm.i], timezone, 'EEE d LLL')}
			</p>
		{/if}
	</div>

	<div class="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
		<p class="text-xs font-medium text-muted-foreground">{m.stat_coldest_day()}</p>
		<p class="mt-1 text-2xl font-bold tabular-nums">{fmtTemp(stats.cold.t)}</p>
		{#if stats.cold.i >= 0}
			<p class="mt-0.5 text-xs font-semibold text-muted-foreground">
				{formatZoned(dailyDates[stats.cold.i], timezone, 'EEE d LLL')}
			</p>
		{/if}
	</div>
</div>

<!-- ─── Daily strip: min/max range bars + anomaly + precip ─────────────────────── -->
<section
	class="mt-4 -mx-3 overflow-hidden border-y border-border/70 bg-card shadow-sm md:mx-0 md:rounded-2xl md:border"
>
	<div class="flex items-center justify-between border-b border-border/70 bg-muted/40 px-4 py-2.5">
		<h3 class="text-base font-bold">
			{m.historical_daily_heading()}
			<span class="font-semibold text-muted-foreground">{m.historical_daily_hint()}</span>
		</h3>
		{#if normals}
			<span class="hidden text-xs text-muted-foreground sm:inline">
				{m.normal_band_legend()}
			</span>
		{/if}
	</div>

	<div class="overflow-x-auto">
		<div class="flex min-w-min">
			{#each dailyDates as date, i (date.getTime())}
				{@const selected = isSameDayInZone(date, selectedDay, timezone)}
				{@const tMax = daily.temperature_2m_max[i]}
				{@const tMin = daily.temperature_2m_min[i]}
				{@const tMean = daily.temperature_2m_mean[i]}
				{@const norm = normals ? normals.tmean[ordinals[i]] : NaN}
				{@const anomaly = finite(tMean) && finite(norm) ? tMean - norm : null}
				{@const precip = daily.precipitation_sum[i]}
				<button
					type="button"
					class="flex w-[52px] shrink-0 cursor-pointer flex-col items-center gap-1 border-r border-border/40 px-1 py-2 text-center transition-colors hover:bg-muted/60 {selected
						? 'bg-primary/10'
						: ''}"
					onclick={() => onSelectDay(date)}
					aria-pressed={selected}
				>
					<span class="text-[11px] font-semibold {selected ? 'text-primary' : 'text-foreground'}">
						{formatZoned(date, timezone, 'EEE')}
					</span>
					<span class="text-[10px] text-muted-foreground"
						>{formatZoned(date, timezone, 'd MMM')}</span
					>

					<svg class="my-0.5" width="20" height="20">
						<title>{getWeatherDescription(daily.weather_code[i])}</title>
						<use
							xlink:href="/images/weather-icons/{getWeatherIconName(
								daily.weather_code[i],
								true
							)}.svg#Layer_1"
						></use>
					</svg>

					<!-- min/max range bar -->
					<div class="relative w-3.5" style="height:{BAR_H}px">
						{#if finite(norm)}
							<!-- normal marker -->
							<div
								class="absolute -left-0.5 -right-0.5 border-t border-dashed border-muted-foreground/50"
								style="top:{yOf(norm)}px"
							></div>
						{/if}
						{#if finite(tMax) && finite(tMin)}
							<div
								class="absolute left-0 w-full rounded-full"
								style="top:{yOf(tMax)}px;height:{Math.max(
									3,
									yOf(tMin) - yOf(tMax)
								)}px;background:{getColor(tMean ?? (tMax + tMin) / 2, units.temperature_unit)}"
							></div>
						{/if}
					</div>

					<span
						class="text-[11px] font-bold tabular-nums"
						style="color:{getTempStyle(tMax, units.temperature_unit).bg}">{fmtTemp(tMax)}</span
					>
					<span class="text-[10px] font-medium text-muted-foreground tabular-nums"
						>{fmtTemp(tMin)}</span
					>

					{#if anomaly != null}
						<span
							class="mt-0.5 inline-block h-1.5 w-6 rounded-full"
							style="background:{anomalyColor(anomaly)}"
							title={m.anomaly_vs_normal({ value: fmtSigned(anomaly) })}
						></span>
					{/if}

					{#if finite(precip) && precip >= 0.1}
						<span
							class="mt-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400 tabular-nums"
						>
							{precip.toFixed(precip < 10 ? 1 : 0)}
						</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>
</section>
