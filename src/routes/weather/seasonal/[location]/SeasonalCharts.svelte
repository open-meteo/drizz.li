<script lang="ts">
	import { ChartContainer } from '$lib/components/charts';

	import { CHART_COLORS, CanvasChart, type ChartSeries } from '$lib/charts';
	import {
		type ClimateNormals,
		type SeasonalForecastResult,
		monthDayToOrdinal
	} from '$lib/services/weather';

	import { type WeatherUnits, getPrecipUnit, getTempUnit } from '../../week/[location]/types';
	import { rollingMean, rollingSum } from './outlook';

	interface Props {
		result: SeasonalForecastResult;
		normals: ClimateNormals | null;
		units: WeatherUnits;
		loading?: boolean;
		showLegend?: boolean;
		/** Smoothing window in days, shared by both charts. */
		smoothing?: number;
		charts?: CanvasChart[];
	}

	let {
		result,
		normals,
		units,
		loading = false,
		showLegend = true,
		smoothing = 7,
		charts = $bindable([])
	}: Props = $props();

	const CHART_GROUP = 'seasonal-outlook';
	const SPREAD_COLOR = 'rgba(115, 192, 222, 0.75)';
	const BAND_COLOR = 'rgba(56, 132, 189, 0.9)';
	const NORMAL_COLOR = '#9ca3af';

	const tempUnit = $derived(getTempUnit(units));
	const precipUnit = $derived(getPrecipUnit(units));

	// CanvasChart works in epoch seconds. The axis is fed local wall time (and
	// labelled in UTC) because the seasonal series carries a single fixed offset:
	// resolving it against the IANA zone would slide every date past a DST change.
	let timestamps = $derived(result.dailyDates.map((d) => d.getTime() / 1000));

	// Climate normal for each forecast day, so it can be drawn as a reference
	// line on the same axis as the ensemble.
	let ordinals = $derived(
		result.dateKeys.map((key) =>
			monthDayToOrdinal(Number(key.slice(5, 7)), Number(key.slice(8, 10)))
		)
	);
	let normalTemp = $derived(normals ? ordinals.map((o) => normals.tmean[o]) : null);
	let normalPrecip = $derived(normals ? ordinals.map((o) => normals.precip[o]) : null);

	const fmt =
		(unit: string, digits = 1) =>
		(v: number) =>
			`${v.toFixed(digits)} ${unit}`;

	let tempSeries = $derived.by((): ChartSeries[] => {
		const v = result.variables['temperature_2m_mean'];
		if (!v) return [];
		const smooth = (xs: number[]) => rollingMean(xs, smoothing);

		const series: ChartSeries[] = [
			{
				name: 'Full spread',
				type: 'line',
				color: SPREAD_COLOR,
				data: smooth(v.max),
				width: 0,
				fill: true,
				fillOpacity: 0.16,
				bandTo: smooth(v.min),
				shortName: 'spread',
				format: fmt(tempUnit)
			},
			{
				name: 'Likely range (25-75%)',
				type: 'line',
				color: BAND_COLOR,
				data: smooth(v.p75),
				width: 0,
				fill: true,
				fillOpacity: 0.3,
				bandTo: smooth(v.p25),
				shortName: 'likely',
				format: fmt(tempUnit)
			},
			{
				name: 'Ensemble mean',
				type: 'line',
				color: CHART_COLORS.average,
				data: smooth(v.mean),
				width: 3,
				outline: true,
				format: fmt(tempUnit)
			}
		];

		if (normalTemp) {
			series.push({
				name: 'Climate normal',
				type: 'line',
				color: NORMAL_COLOR,
				data: smooth(normalTemp),
				width: 2,
				dashed: true,
				shortName: 'normal',
				format: fmt(tempUnit)
			});
		}

		return series;
	});

	let precipSeries = $derived.by((): ChartSeries[] => {
		const v = result.variables['precipitation_sum'];
		if (!v) return [];
		const total = (xs: number[]) => rollingSum(xs, smoothing);

		const series: ChartSeries[] = [
			{
				name: 'Likely range (25-75%)',
				type: 'line',
				color: BAND_COLOR,
				data: total(v.p75),
				width: 0,
				fill: true,
				fillOpacity: 0.28,
				bandTo: total(v.p25),
				shortName: 'likely',
				format: fmt(precipUnit)
			},
			{
				name: 'Ensemble mean',
				type: 'line',
				color: CHART_COLORS.average,
				data: total(v.mean),
				width: 3,
				outline: true,
				format: fmt(precipUnit)
			}
		];

		if (normalPrecip) {
			series.push({
				name: 'Climate normal',
				type: 'line',
				color: NORMAL_COLOR,
				data: total(normalPrecip),
				width: 2,
				dashed: true,
				shortName: 'normal',
				format: fmt(precipUnit)
			});
		}

		return series;
	});

	let chartDefs = $derived(
		[
			{
				title: 'Temperature outlook',
				subtitle: `${smoothing}-day smoothed daily mean · ${result.memberCount} ensemble members`,
				unit: tempUnit,
				series: tempSeries,
				zeroBaseLeft: false,
				showCredit: false
			},
			{
				title: 'Precipitation outlook',
				subtitle: `${smoothing}-day rolling total (${precipUnit})`,
				unit: precipUnit,
				series: precipSeries,
				zeroBaseLeft: true,
				showCredit: true
			}
		].filter((def) => def.series.length > 0)
	);
</script>

<!-- full-bleed graphs until lg / contained card on lg+ (matches the 14-day page) -->
<div class="-mx-3 border-y border-border/70 bg-card shadow-sm lg:mx-0 lg:rounded-2xl lg:border">
	{#each chartDefs as def, i (def.title)}
		<div class="px-0 pt-1.5 pb-1 lg:px-4 lg:pb-3 {i > 0 ? 'border-t border-border/50' : ''}">
			<div class="mb-1 px-3 lg:px-0">
				<h4 class="text-sm font-bold tracking-tight">{def.title}</h4>
				<p class="text-xs text-muted-foreground">{def.subtitle}</p>
			</div>
			<ChartContainer {loading} chartCount={1} chartHeight={300} minWidth={520} bleed={false}>
				<CanvasChart
					bind:this={charts[i]}
					{timestamps}
					timezone="UTC"
					series={def.series}
					unit={def.unit}
					zeroBaseLeft={def.zeroBaseLeft}
					showCredit={def.showCredit}
					{showLegend}
					height={300}
					group={CHART_GROUP}
				/>
			</ChartContainer>
		</div>
	{/each}
</div>
