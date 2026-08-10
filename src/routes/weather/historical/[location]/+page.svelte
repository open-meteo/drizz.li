<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';

	import { reportPageReady } from '$lib/stores/page-transition.svelte';
	import {
		storedArchiveModel,
		storedChartLayout,
		storedLocation,
		storedUnits,
		storedVariablePrefs
	} from '$lib/stores/settings';

	import { skeletonOut } from '$lib/utils/skeleton-fade';

	import { ChartContainer } from '$lib/components/charts';

	import * as m from '$lib/paraglide/messages';
	import {
		type ClimateNormals,
		type HistoricalForecastResult,
		fetchClimateNormals,
		fetchHistoricalWeather
	} from '$lib/services/weather';

	import { useHeroActions } from '../../hero.svelte';
	import { archiveModelGroups, defaultParameters } from '../../options';
	import HourlyTable from '../../week/[location]/HourlyTable.svelte';
	import ModelSelector from '../../week/[location]/ModelSelector.svelte';
	import { neededHourlyApiVars } from '../../week/[location]/variables';
	import DateRangeControls from './DateRangeControls.svelte';
	import HistoricalDaily from './HistoricalDaily.svelte';
	import HistoricalMeteograms from './HistoricalMeteograms.svelte';

	import type { FetchedDaily, FetchedHourly } from '../../week/[location]/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The page cross-fade waits for this before revealing the new page, and so
	// does the loading overlay.
	reportPageReady(() => result != null || loadError != null);

	useHeroActions(heroActions);

	let location = $derived(data.location);
	$effect(() => {
		storedLocation.set(data.location);
	});

	let params = $state({ ...defaultParameters });
	$effect(() => {
		params.temperature_unit = $storedUnits.temperature_unit;
		params.wind_speed_unit = $storedUnits.wind_speed_unit;
		params.precipitation_unit = $storedUnits.precipitation_unit;
	});

	// Request only what the table rows + meteogram layout actually show.
	let hourlyVars = $derived(
		neededHourlyApiVars(
			$storedVariablePrefs.table,
			$storedChartLayout.flatMap((p) => p.variables)
		)
	);

	// ─── Date range ───────────────────────────────────────────────────────────
	const iso = (d: Date): string => d.toISOString().slice(0, 10);
	const addDays = (d: Date, n: number): Date => {
		const c = new Date(d);
		c.setUTCDate(c.getUTCDate() + n);
		return c;
	};

	const MIN_DATE = '1940-01-01'; // ERA5 archive start
	// The reanalysis archive lags real time by a few days.
	let maxDate = $state(iso(addDays(new Date(), -5)));
	let startDate = $state(iso(addDays(new Date(), -34)));
	let endDate = $state(iso(addDays(new Date(), -5)));

	onMount(() => {
		const today = new Date();
		maxDate = iso(addDays(today, -5));
		endDate = maxDate;
		startDate = iso(addDays(today, -34));
		mounted = true;
	});

	let archiveModel = $state('best_match');
	onMount(() => {
		archiveModel = get(storedArchiveModel);
	});

	function onRangeChange(s: string, e: string) {
		startDate = s;
		endDate = e;
	}

	// ─── Fetch state ────────────────────────────────────────────────────────────
	let mounted = $state(false);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let requestVersion = 0;

	let result = $state<HistoricalForecastResult | null>(null);
	let normals = $state<ClimateNormals | null>(null);

	const selectedDay = new SvelteDate();

	// Historical data: refetch on location / range / units / requested-vars change.
	$effect(() => {
		const loc = location;
		const s = startDate;
		const e = endDate;
		const vars = hourlyVars;
		const model = archiveModel;
		void model;
		if (!mounted || !loc || !s || !e) return;

		const version = ++requestVersion;
		loading = true;
		loadError = null;

		fetchHistoricalWeather({
			latitude: loc.latitude!,
			longitude: loc.longitude!,
			start_date: s,
			end_date: e,
			hourlyVariables: vars,
			temperature_unit: params.temperature_unit as 'celsius' | 'fahrenheit',
			wind_speed_unit: params.wind_speed_unit as 'kmh' | 'ms' | 'mph' | 'kn',
			precipitation_unit: params.precipitation_unit as 'mm' | 'inch',
			timezone: loc.timezone
		})
			.then((r) => {
				if (version !== requestVersion) return;
				result = r;
				// default the hourly drill-down to the last day in range
				if (r.dailyDates.length > 0) {
					selectedDay.setTime(r.dailyDates[r.dailyDates.length - 1].getTime());
				}
				loading = false;
			})
			.catch((err: unknown) => {
				if (version !== requestVersion) return;
				loadError = err instanceof Error ? err.message : String(err);
				loading = false;
			});
	});

	// Climate normals: independent of the range, so fetch once per location/units.
	let normalsKey = $derived(
		`${location?.latitude},${location?.longitude},${params.temperature_unit},${params.precipitation_unit}`
	);
	let normalsVersion = 0;
	$effect(() => {
		const key = normalsKey;
		const loc = location;
		if (!mounted || !loc) return;

		const version = ++normalsVersion;
		normals = null;
		fetchClimateNormals({
			latitude: loc.latitude!,
			longitude: loc.longitude!,
			temperature_unit: params.temperature_unit as 'celsius' | 'fahrenheit',
			precipitation_unit: params.precipitation_unit as 'mm' | 'inch'
		})
			.then((n) => {
				if (version === normalsVersion) normals = n;
			})
			.catch(() => {
				// normals are a nice-to-have; a failure just hides the comparison
				if (version === normalsVersion) normals = null;
			});
		// re-read key so the effect tracks it
		void key;
	});

	// ─── Adapters so the reused week components accept historical data ──────────
	let fetchedHourly = $derived<FetchedHourly | null>(
		result
			? {
					hourly: result.hourly,
					utc_offset_seconds: result.utcOffsetSeconds,
					timezone: result.timezone,
					timestamps: result.hourlyTimestamps,
					hourlyDates: result.hourlyDates,
					daylightBands: result.daylightBands
				}
			: null
	);

	let fetchedDaily = $derived<FetchedDaily | null>(
		result
			? {
					daily: {
						weather_code: result.daily.weather_code,
						temperature_2m_max: result.daily.temperature_2m_max,
						temperature_2m_min: result.daily.temperature_2m_min,
						sunrise: result.daily.sunrise,
						sunset: result.daily.sunset,
						sunshine_duration: result.daily.sunshine_duration,
						precipitation_sum: result.daily.precipitation_sum,
						windspeed_10m_max: result.daily.windspeed_10m_max,
						windgusts_10m_max: result.daily.windgusts_10m_max,
						winddirection_10m_dominant: result.daily.winddirection_10m_dominant
					},
					timezone: result.timezone,
					dailyDates: result.dailyDates
				}
			: null
	);

	function switchDay(date: Date) {
		// see the week page: an unformattable selected day breaks every consumer
		const time = date?.getTime();
		if (Number.isFinite(time)) selectedDay.setTime(time);
	}
</script>

<!-- the reanalysis picker rides in the layout's location row -->
{#snippet heroActions()}
	<div class="flex w-full min-w-0 items-center gap-3 sm:w-auto">
		<ModelSelector
			selectedModel={archiveModel}
			groups={archiveModelGroups}
			label={m.model_archive()}
			onModelChange={(model) => {
				archiveModel = model;
				storedArchiveModel.set(model);
			}}
		/>
	</div>
{/snippet}

<svelte:head>
	<title>Drizz.li | {m.page_historical_subtitle()}</title>
	<meta name="description" content="Past weather and climate-normal comparisons for any location" />
</svelte:head>

<DateRangeControls
	start={startDate}
	end={endDate}
	minDate={MIN_DATE}
	{maxDate}
	onChange={onRangeChange}
/>

{#if loadError}
	<div
		class="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
	>
		Failed to load historical data: {loadError}
	</div>
{/if}

<div class="relative mt-4">
	{#if result && fetchedHourly && fetchedDaily}
		<HistoricalDaily
			daily={result.daily}
			dailyDates={result.dailyDates}
			timezone={result.timezone}
			units={params}
			{normals}
			{selectedDay}
			onSelectDay={switchDay}
		/>

		<div class="mt-6">
			<HourlyTable
				data={fetchedHourly}
				daily={fetchedDaily}
				{selectedDay}
				units={params}
				locationName={location.name ?? ''}
			/>
		</div>

		<HistoricalMeteograms data={fetchedHourly} units={params} {loading} {selectedDay} />
	{:else}
		<div in:fade={{ duration: 200 }} out:skeletonOut class="grid gap-3">
			<div class="h-28 animate-pulse rounded-2xl border border-border/70 bg-card"></div>
			<ChartContainer loading chartCount={3} chartHeight={300} bleed={false} />
		</div>
	{/if}
</div>
