<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	import { getColor } from '../../utils/colors';
	import { type WeatherUnits, getPrecipUnit, getTempUnit } from '../../week/[location]/types';

	import type { ClimateNormals } from '$lib/services/weather';
	import type { MonthOutlook } from './outlook';

	interface Props {
		months: MonthOutlook[];
		units: WeatherUnits;
		normals: ClimateNormals | null;
	}

	let { months, units, normals }: Props = $props();

	const tempUnit = $derived(getTempUnit(units));
	const precipUnit = $derived(getPrecipUnit(units));

	const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
	const fmtTemp = (v: number): string => (finite(v) ? `${v.toFixed(1)}°` : '–');
	const fmtSigned = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)}°`;
	const fmtPrecip = (v: number): string => `${v.toFixed(v < 10 ? 1 : 0)}`;

	// Members agreeing on the sign of the anomaly is the honest confidence signal
	// for a seasonal outlook: a big anomaly that only half the members share means
	// nothing. Below this the card says so instead of implying a trend.
	const AGREEMENT_FLOOR = 0.6;

	function anomalyLabel(delta: number): string {
		const a = Math.abs(delta);
		if (a < 0.3) return 'near normal';
		const word = a < 1 ? 'slightly' : a < 2.5 ? '' : 'well';
		return `${word} ${delta > 0 ? 'above' : 'below'} normal`.replace(/\s+/g, ' ').trim();
	}
</script>

<div class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
	{#each months as month (month.key)}
		{@const agree = Math.max(month.warmerShare, 1 - month.warmerShare)}
		{@const confident = agree >= AGREEMENT_FLOOR}
		<article class="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
			<div class="flex items-baseline justify-between gap-2">
				<h3 class="text-base font-bold tracking-tight">{month.label}</h3>
				<span class="text-xs text-muted-foreground">
					{month.days}
					{month.days === 1 ? 'day' : 'days'}{month.partial ? ' (partial)' : ''}
				</span>
			</div>

			<!-- headline: mean temperature and its departure from the 1991-2020 normal -->
			<div class="mt-2.5 flex items-end gap-3">
				<div>
					<p class="text-xs font-medium text-muted-foreground">{m.stat_mean_temperature()}</p>
					<p class="text-2xl leading-tight font-bold tabular-nums">
						{fmtTemp(month.tMean)}<span class="text-base font-semibold text-muted-foreground"
							>{tempUnit.replace('°', '')}</span
						>
					</p>
				</div>
				<div class="ml-auto text-right">
					{#if finite(month.anomaly)}
						<p
							class="text-lg leading-tight font-bold tabular-nums"
							class:text-red-600={month.anomaly >= 0}
							class:text-blue-600={month.anomaly < 0}
							class:dark:text-red-400={month.anomaly >= 0}
							class:dark:text-blue-400={month.anomaly < 0}
						>
							{fmtSigned(month.anomaly)}
						</p>
						<p class="text-[11px] text-muted-foreground">{anomalyLabel(month.anomaly)}</p>
					{:else if normals}
						<p class="text-[11px] text-muted-foreground">{m.seasonal_no_normal()}</p>
					{:else}
						<p class="text-[11px] text-muted-foreground">{m.normals_loading()}</p>
					{/if}
				</div>
			</div>

			<!-- day / night means, coloured on the same temperature scale as the strip -->
			<div class="mt-2.5 flex items-center gap-2 text-xs">
				<span class="inline-flex items-center gap-1.5">
					<span
						class="inline-block h-2.5 w-2.5 rounded-full"
						style="background:{getColor(month.tMax, units.temperature_unit)}"
					></span>
					<span class="font-semibold tabular-nums">{fmtTemp(month.tMax)}</span>
					<span class="text-muted-foreground">{m.label_day()}</span>
				</span>
				<span class="inline-flex items-center gap-1.5">
					<span
						class="inline-block h-2.5 w-2.5 rounded-full"
						style="background:{getColor(month.tMin, units.temperature_unit)}"
					></span>
					<span class="font-semibold tabular-nums">{fmtTemp(month.tMin)}</span>
					<span class="text-muted-foreground">{m.label_night()}</span>
				</span>
			</div>

			<!-- precipitation against its own normal, as a share bar -->
			<div class="mt-3 border-t border-border/60 pt-2.5">
				<div class="flex items-baseline justify-between gap-2 text-xs">
					<span class="font-medium text-muted-foreground">{m.var_precipitation()}</span>
					<span class="font-semibold tabular-nums">
						{fmtPrecip(month.precip)}
						{precipUnit}
						{#if finite(month.precipNormal)}
							<span class="font-medium text-muted-foreground">
								/ normal {fmtPrecip(month.precipNormal)}
							</span>
						{/if}
					</span>
				</div>
				{#if finite(month.precipShare)}
					{@const pct = Math.min(200, month.precipShare * 100)}
					<div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
						<div
							class="h-full rounded-full"
							style="width:{pct / 2}%;background:{month.precipShare >= 1
								? 'var(--color-sky-500, #0ea5e9)'
								: 'var(--color-amber-500, #f59e0b)'}"
						></div>
					</div>
					<p class="mt-1 text-[11px] text-muted-foreground">
						{Math.round(month.precipShare * 100)}% of normal · {month.wetDays} wet days
					</p>
				{/if}
			</div>

			<!-- ensemble agreement: the actual confidence in the anomaly above -->
			<div class="mt-2.5 flex items-center gap-2">
				<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
					<div
						class="h-full rounded-full"
						class:bg-primary={confident}
						class:bg-muted-foreground={!confident}
						style="width:{Math.round(agree * 100)}%"
					></div>
				</div>
				<span class="text-[11px] whitespace-nowrap text-muted-foreground">
					{#if confident}
						{Math.round(agree * 100)}% of members {month.warmerShare >= 0.5 ? 'warmer' : 'colder'}
					{:else}
						members split - low confidence
					{/if}
				</span>
			</div>
		</article>
	{/each}
</div>
