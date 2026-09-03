<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';

	import { page } from '$app/stores';

	import { reportPageReady } from '$lib/stores/page-transition.svelte';
	import { setActiveLocation, storedEnsembleModel, storedUnits } from '$lib/stores/settings';

	import { skeletonOut } from '$lib/utils/skeleton-fade';
	import { syncSearchParams, unlessDefault } from '$lib/utils/url-state';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { ChartContainer, ChartToolbar } from '$lib/components/charts';

	import { CHART_COLORS, CanvasChart, type ChartSeries, isColumnUnit } from '$lib/charts';
	import * as m from '$lib/paraglide/messages';
	import {
		type DaylightBand,
		type EnsembleForecastResult,
		fetchEnsembleForecast
	} from '$lib/services/weather';

	import { useHeroActions } from '../../hero.svelte';
	import { defaultParameters, ensembleModelGroups } from '../../options';
	import ModelSelector from '../../week/[location]/ModelSelector.svelte';

	import type { PageData } from './$types';

	const CHART_GROUP = '14-day-ensemble';

	// ─── Display State (does NOT trigger data re-fetch) ─────────────────────────

	let showLegend = $state(true);

	// ─── Data Fetch State ───────────────────────────────────────────────────────

	let chartComponents: CanvasChart[] = $state([]);
	let mounted = $state(false);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let requestVersion = 0;

	let { data }: { data: PageData } = $props();

	// the page cross-fade waits for this before revealing the new page
	reportPageReady(() => fetchedData != null || loadError != null);

	useHeroActions(heroActions);

	// the URL is the source of truth: location comes from the load function,
	// which is also correct on hydrated prerendered pages. The persisted store
	// only mirrors it so the header and bare /weather/* redirects follow along.
	let location = $derived(data.location);
	$effect(() => {
		setActiveLocation(data.location);
	});

	const DEFAULT_MODEL = 'ncep_gefs_seamless';

	let params = $state({
		...defaultParameters,
		hourly: ['temperature_2m', 'precipitation', 'wind_speed_10m', 'cloud_cover', 'pressure_msl'],
		models: [DEFAULT_MODEL]
	});

	// units live in a persisted store; mirror them into params so a change
	// re-runs the fetch effect (which reads params.*_unit)
	$effect(() => {
		params.temperature_unit = $storedUnits.temperature_unit;
		params.wind_speed_unit = $storedUnits.wind_speed_unit;
		params.precipitation_unit = $storedUnits.precipitation_unit;
	});

	// ─── Cached API Response ────────────────────────────────────────────────────

	interface FetchedData {
		ensembleResult: EnsembleForecastResult;
		timestamps: number[];
		timezone: string;
		daylightBands: DaylightBand[];
	}

	let fetchedData: FetchedData | null = $state(null);

	// ─── Lifecycle ──────────────────────────────────────────────────────────────

	onMount(() => {
		// a shared link carries its model; otherwise fall back to the stored choice
		const fromUrl = get(page).url.searchParams.get('model');
		params.models = [fromUrl || get(storedEnsembleModel)];
		mounted = true;
	});

	// keep the plotted ensemble in the URL
	$effect(() => {
		const model = params.models?.[0];
		if (!mounted || !model) return;
		syncSearchParams({ model: unlessDefault(model, DEFAULT_MODEL) });
	});

	// components persist across refetches; entries are null while unmounted
	let liveCharts = $derived(chartComponents.filter((chart) => chart != null));

	// ─── Data Fetching (only when params.hourly or params.models change) ───────

	$effect(() => {
		const hourlyVars = params.hourly;
		const modelList = params.models;

		if (!mounted || !hourlyVars?.length || !modelList?.length) return;

		const loc = location;

		// versioned so a slow stale response can never overwrite a newer one
		const version = ++requestVersion;
		loading = true;
		loadError = null;

		fetchEnsembleForecast({
			latitude: loc.latitude!,
			longitude: loc.longitude!,
			hourlyVariables: hourlyVars,
			models: modelList,
			forecast_days: 14,
			temperature_unit: params.temperature_unit as 'celsius' | 'fahrenheit',
			wind_speed_unit: params.wind_speed_unit as 'kmh' | 'ms' | 'mph' | 'kn',
			precipitation_unit: params.precipitation_unit as 'mm' | 'inch',
			timezone: loc.timezone
		})
			.then((result: EnsembleForecastResult) => {
				if (version !== requestVersion) return;

				fetchedData = {
					ensembleResult: result,
					timestamps: result.timestamps,
					timezone: result.timezone,
					daylightBands: result.daylightBands
				};

				loading = false;
			})
			.catch((err: unknown) => {
				if (version !== requestVersion) return;
				loadError = err instanceof Error ? err.message : String(err);
				loading = false;
			});
	});

	// ─── Chart Building (runs when fetchedData or the variable list changes) ────

	// Ensemble members stop at the model's horizon; past it the service collapses
	// every value to 0 (all percentiles = 0). Trim the axis to the last hour that
	// actually has data so the charts cut off instead of flat-lining to zero.
	let validLength = $derived.by((): number => {
		if (!fetchedData) return 0;
		const temp = fetchedData.ensembleResult.variables['temperature_2m'];
		const n = fetchedData.timestamps.length;
		if (!temp) return n;
		let last = 0;
		for (let i = 0; i < n; i++) {
			if (!(temp.p90[i] === 0 && temp.p10[i] === 0 && temp.p50[i] === 0)) last = i + 1;
		}
		return last || n;
	});

	// Timestamps from the service are in milliseconds; CanvasChart uses seconds.
	let timestampsSec = $derived.by(() =>
		fetchedData ? fetchedData.timestamps.slice(0, validLength).map((t) => t / 1000) : []
	);

	// Surface a note when the chosen model's ensemble stops short of the request.
	let fullHours = $derived.by(() => (fetchedData ? fetchedData.timestamps.length : 0));
	let validDays = $derived(Math.max(0, Math.round(validLength / 24)));
	let isTrimmed = $derived(fetchedData != null && validLength > 0 && validLength < fullHours - 1);

	interface ChartDef {
		title?: string;
		subtitle?: string;
		unit: string;
		showCredit: boolean;
		series: ChartSeries[];
		zeroBaseLeft?: boolean;
		yMin?: number;
		yMax?: number;
	}

	// Sensible axis behaviour per variable so the y-scale stays readable (e.g.
	// pressure never anchored to zero; percentages pinned to 0-100).
	function axisForVar(v: string): { zeroBaseLeft: boolean; yMin?: number; yMax?: number } {
		if (['pressure_msl', 'surface_pressure', 'temperature_2m', 'dew_point_2m'].includes(v)) {
			return { zeroBaseLeft: false };
		}
		if (['relative_humidity_2m', 'cloud_cover', 'precipitation_probability'].includes(v)) {
			return { zeroBaseLeft: true, yMin: 0, yMax: 100 };
		}
		return { zeroBaseLeft: true };
	}

	const BAND_COLOR = 'rgba(115, 192, 222, 0.9)';

	// Human labels for the plotted ensemble variables (API names → readable title)
	const VAR_LABELS: Record<string, string> = {
		temperature_2m: 'Temperature',
		apparent_temperature: 'Feels like',
		precipitation: 'Precipitation',
		rain: 'Rain',
		snowfall: 'Snowfall',
		wind_speed_10m: 'Wind speed',
		wind_gusts_10m: 'Wind gusts',
		relative_humidity_2m: 'Relative humidity',
		cloud_cover: 'Cloud cover',
		pressure_msl: 'Pressure (MSL)',
		dew_point_2m: 'Dew point'
	};
	const varLabel = (v: string): string =>
		VAR_LABELS[v] ?? v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

	let chartDefs = $derived.by((): ChartDef[] => {
		if (!fetchedData) return [];

		const { ensembleResult } = fetchedData;
		const variables = params.hourly || [];
		const defs: ChartDef[] = [];

		for (let vi = 0; vi < variables.length; vi++) {
			const variable = variables[vi];
			const varData = ensembleResult.variables[variable];
			if (!varData) continue;

			const unit = varData.unit;
			const isColumn = isColumnUnit(unit);
			const memberCount = varData.members.length;

			// Trim to the valid horizon so the axis scale ignores the trailing
			// zeros the service pads past the model's range.
			const vP10 = varData.p10.slice(0, validLength);
			const vP25 = varData.p25.slice(0, validLength);
			const vP50 = varData.p50.slice(0, validLength);
			const vP75 = varData.p75.slice(0, validLength);
			const vP90 = varData.p90.slice(0, validLength);

			// Percentile bands (p10-p90 outer, p25-p75 inner) + median, instead of
			// every individual member
			const series: ChartSeries[] = [
				{
					name: 'p90',
					type: 'line',
					color: BAND_COLOR,
					data: vP90,
					width: 1,
					fill: true,
					fillOpacity: 0.18,
					bandTo: vP10,
					format: (v) => `${v.toFixed(1)} ${unit}`
				},
				{
					name: 'p75',
					type: 'line',
					color: BAND_COLOR,
					data: vP75,
					width: 1,
					fill: true,
					fillOpacity: 0.35,
					bandTo: vP25,
					format: (v) => `${v.toFixed(1)} ${unit}`
				},
				{
					name: 'Median',
					type: isColumn ? 'bar' : 'line',
					color: CHART_COLORS.average,
					data: vP50,
					width: 3.5,
					dashed: !isColumn,
					outline: !isColumn,
					format: (v) => `${v.toFixed(1)} ${unit}`
				},
				{
					name: 'p25',
					type: 'line',
					color: BAND_COLOR,
					data: vP25,
					width: 1,
					format: (v) => `${v.toFixed(1)} ${unit}`
				},
				{
					name: 'p10',
					type: 'line',
					color: BAND_COLOR,
					data: vP10,
					width: 1,
					format: (v) => `${v.toFixed(1)} ${unit}`
				}
			];

			const isFirst = vi === 0;
			const isLast = vi === variables.length - 1;

			const axis = axisForVar(variable);
			defs.push({
				// each chart is labelled so the variable is obvious at a glance
				title: `${varLabel(variable)}${isColumn ? '' : ' spread'}`,
				subtitle: isFirst
					? `p10 – p90 and p25 – p75 bands · median, across ${memberCount} ensemble members`
					: `p10 · p25 · median · p75 · p90 (${unit})`,
				unit,
				showCredit: isLast,
				series,
				zeroBaseLeft: axis.zeroBaseLeft,
				yMin: axis.yMin,
				yMax: axis.yMax
			});
		}

		return defs;
	});
</script>

<!-- the ensemble picker rides in the layout's location row (see weather/+layout) -->
{#snippet heroActions()}
	<div class="flex w-full items-center gap-3 sm:w-auto">
		<ModelSelector
			selectedModel={params.models?.[0] ?? DEFAULT_MODEL}
			groups={ensembleModelGroups}
			label={m.model_ensemble()}
			onModelChange={(model) => {
				params.models = [model];
				storedEnsembleModel.set(model);
			}}
		/>
	</div>
{/snippet}

<!-- ─── Chart Area ─────────────────────────────────────────────────────────── -->

{#if isTrimmed}
	<div
		class="mb-4 flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200"
	>
		<svg
			class="mt-0.5 h-4 w-4 shrink-0"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			stroke-width="2"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
			/>
		</svg>
		<span>
			{m.ensemble_trimmed({ days: validDays })}
		</span>
	</div>
{/if}

{#if loadError}
	<div
		class="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
	>
		Failed to load weather data: {loadError}
	</div>
{/if}

<!-- `relative` lets the placeholder dissolve over the finished charts (skeletonOut) -->
<div class="relative">
	{#if fetchedData}
		<!-- full-bleed graphs until lg / contained card on lg+; titles stay within
		     the page margins (padded), the graphs bleed to the edges -->
		<div class="-mx-3 border-y border-border/70 bg-card shadow-sm lg:mx-0 lg:rounded-2xl lg:border">
			{#each chartDefs as def, i (i)}
				<div class="px-0 pt-1.5 pb-1 lg:px-4 lg:pb-3 {i > 0 ? 'border-t border-border/50' : ''}">
					<div class="mb-1 px-3 lg:px-0">
						<h4 class="text-sm font-bold tracking-tight">{def.title}</h4>
						{#if def.subtitle}
							<p class="text-xs text-muted-foreground">{def.subtitle}</p>
						{/if}
					</div>
					<ChartContainer {loading} chartCount={1} chartHeight={300} minWidth={520} bleed={false}>
						<CanvasChart
							bind:this={chartComponents[i]}
							timestamps={timestampsSec}
							timezone={fetchedData.timezone}
							series={def.series}
							bands={fetchedData.daylightBands}
							unit={def.unit}
							showCredit={def.showCredit}
							zeroBaseLeft={def.zeroBaseLeft ?? true}
							yMin={def.yMin}
							yMax={def.yMax}
							{showLegend}
							height={300}
							group={CHART_GROUP}
						/>
					</ChartContainer>
				</div>
			{/each}
		</div>
	{:else}
		<!-- reserve the chart area height before data arrives (no layout shift) -->
		<div in:fade={{ duration: 200 }} out:skeletonOut>
			<ChartContainer
				loading
				chartCount={params.hourly?.length || 1}
				chartHeight={340}
				bleed={false}
			/>
		</div>
	{/if}
</div>

<!-- ─── Toolbar: Controls + Download ───────────────────────────────────────── -->

<div class="mt-6 md:mt-10">
	<ChartToolbar charts={liveCharts} fileName="14-day-forecast">
		{#snippet controls()}
			<div class="flex items-center gap-2">
				<Switch id="show_legend" name="Show legend" bind:checked={showLegend} />
				<Label for="show_legend" class="cursor-pointer text-base leading-none"
					>{m.legend_show()}</Label
				>
			</div>
		{/snippet}
	</ChartToolbar>
</div>
