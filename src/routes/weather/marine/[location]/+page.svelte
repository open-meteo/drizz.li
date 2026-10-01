<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';

	import { page } from '$app/stores';

	import { reportPageReady } from '$lib/stores/page-transition.svelte';
	import { setActiveLocation, storedMarineModel, storedUnits } from '$lib/stores/settings';

	import { skeletonOut } from '$lib/utils/skeleton-fade';
	import { syncSearchParams, unlessDefault } from '$lib/utils/url-state';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { ChartContainer, ChartToolbar } from '$lib/components/charts';

	import { CanvasChart, type ChartSeries, SERIES_COLORS } from '$lib/charts';
	import * as m from '$lib/paraglide/messages';
	import { type MarineForecastResult, fetchMarineForecast } from '$lib/services/weather';

	import { useHeroActions } from '../../hero.svelte';
	import { marineModelGroups } from '../../options';
	import ModelSelector from '../../week/[location]/ModelSelector.svelte';

	import type { PageData } from './$types';

	const CHART_GROUP = 'marine';

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

	const DEFAULT_MODEL = 'best_match';

	// The charts, grouped by what reads well on one y-scale.
	const CHART_SPECS: { title: string; vars: [string, string][] }[] = [
		{
			title: 'Wave height',
			vars: [
				['wave_height', 'Significant'],
				['wind_wave_height', 'Wind waves'],
				['swell_wave_height', 'Swell']
			]
		},
		{
			title: 'Wave period',
			vars: [
				['wave_period', 'Mean'],
				['wind_wave_period', 'Wind waves'],
				['swell_wave_period', 'Swell']
			]
		},
		{
			title: 'Sea surface temperature',
			vars: [['sea_surface_temperature', 'SST']]
		},
		{
			title: 'Ocean current',
			vars: [['ocean_current_velocity', 'Current']]
		}
	];

	const HOURLY_VARS = CHART_SPECS.flatMap((spec) => spec.vars.map(([name]) => name));

	let params = $state({
		model: DEFAULT_MODEL,
		temperature_unit: 'celsius',
		wind_speed_unit: 'kmh'
	});

	// units live in a persisted store; mirror them into params so a change
	// re-runs the fetch effect (which reads params.*_unit)
	$effect(() => {
		params.temperature_unit = $storedUnits.temperature_unit;
		params.wind_speed_unit = $storedUnits.wind_speed_unit;
	});

	let fetchedData: MarineForecastResult | null = $state(null);

	// ─── Lifecycle ──────────────────────────────────────────────────────────────

	onMount(() => {
		// a shared link carries its model; otherwise fall back to the stored choice
		const fromUrl = get(page).url.searchParams.get('model');
		params.model = fromUrl || get(storedMarineModel);
		mounted = true;
	});

	// keep the plotted wave model in the URL
	$effect(() => {
		const model = params.model;
		if (!mounted || !model) return;
		syncSearchParams({ model: unlessDefault(model, DEFAULT_MODEL) });
	});

	// components persist across refetches; entries are null while unmounted
	let liveCharts = $derived(chartComponents.filter((chart) => chart != null));

	// ─── Data Fetching (only when params.model or the units change) ─────────────

	$effect(() => {
		const model = params.model;
		if (!mounted || !model) return;

		const loc = location;

		// versioned so a slow stale response can never overwrite a newer one
		const version = ++requestVersion;
		loading = true;
		loadError = null;

		fetchMarineForecast({
			latitude: loc.latitude!,
			longitude: loc.longitude!,
			hourlyVariables: HOURLY_VARS,
			model,
			temperature_unit: params.temperature_unit as 'celsius' | 'fahrenheit',
			wind_speed_unit: params.wind_speed_unit as 'kmh' | 'ms' | 'mph' | 'kn',
			timezone: loc.timezone
		})
			.then((result: MarineForecastResult) => {
				if (version !== requestVersion) return;
				fetchedData = result;
				loading = false;
			})
			.catch((err: unknown) => {
				if (version !== requestVersion) return;
				loadError = err instanceof Error ? err.message : String(err);
				loading = false;
			});
	});

	// ─── Chart Building ─────────────────────────────────────────────────────────

	// Timestamps from the service are in milliseconds; CanvasChart uses seconds.
	let timestampsSec = $derived.by(() =>
		fetchedData ? fetchedData.timestamps.map((t) => t / 1000) : []
	);

	// Inland grid cells answer with NaN for every hour rather than an error.
	let noSeaHere = $derived.by(() => {
		if (!fetchedData) return false;
		const wave = fetchedData.variables['wave_height'];
		return wave != null && !wave.values.some((v) => Number.isFinite(v));
	});

	interface ChartDef {
		title?: string;
		subtitle?: string;
		unit: string;
		showCredit: boolean;
		series: ChartSeries[];
	}

	// null breaks the line where the model has no water instead of plotting zero
	const clean = (values: number[]): (number | null)[] =>
		values.map((v) => (Number.isFinite(v) ? v : null));

	let chartDefs = $derived.by((): ChartDef[] => {
		if (!fetchedData) return [];

		const defs: ChartDef[] = [];

		for (const spec of CHART_SPECS) {
			const series: ChartSeries[] = [];
			let unit = '';

			for (const [si, [varName, label]] of spec.vars.entries()) {
				const varData = fetchedData.variables[varName];
				if (!varData) continue;
				const values = clean(varData.values);
				if (!values.some((v) => v != null)) continue;
				if (!unit && varData.unit) unit = varData.unit;
				series.push({
					name: label,
					type: 'line',
					color: SERIES_COLORS[si % SERIES_COLORS.length],
					data: values,
					width: si === 0 ? 2.5 : 1.5,
					fill: si === 0,
					fillOpacity: 0.12,
					format: (v) => `${v.toFixed(1)} ${unit}`.trim()
				});
			}

			if (series.length === 0) continue;

			defs.push({
				title: spec.title,
				subtitle: unit ? `hourly values (${unit})` : undefined,
				unit,
				showCredit: false,
				series
			});
		}

		if (defs.length > 0) defs[defs.length - 1].showCredit = true;
		return defs;
	});
</script>

<!-- the wave model picker rides in the layout's location row (see weather/+layout) -->
{#snippet heroActions()}
	<div class="flex w-full items-center gap-3 sm:w-auto">
		<ModelSelector
			selectedModel={params.model ?? DEFAULT_MODEL}
			groups={marineModelGroups}
			label={m.model_marine()}
			onModelChange={(model) => {
				params.model = model;
				storedMarineModel.set(model);
			}}
		/>
	</div>
{/snippet}

{#if noSeaHere}
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
		<span>{m.err_nodata_title()} {m.err_nodata_hint()}</span>
	</div>
{/if}

{#if loadError}
	<div
		class="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
	>
		Failed to load marine data: {loadError}
	</div>
{/if}

<!-- `relative` lets the placeholder dissolve over the finished charts (skeletonOut) -->
<div class="relative">
	{#if fetchedData && !noSeaHere}
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
							zeroBaseLeft={def.title !== 'Sea surface temperature'}
							{showLegend}
							height={300}
							group={CHART_GROUP}
						/>
					</ChartContainer>
				</div>
			{/each}
		</div>
	{:else if !fetchedData}
		<!-- reserve the chart area height before data arrives (no layout shift) -->
		<div in:fade={{ duration: 200 }} out:skeletonOut>
			<ChartContainer loading chartCount={4} chartHeight={340} bleed={false} />
		</div>
	{/if}
</div>

<!-- ─── Toolbar: Controls + Download ───────────────────────────────────────── -->

{#if !noSeaHere}
	<div class="mt-6 md:mt-10">
		<ChartToolbar charts={liveCharts} fileName="wave-forecast">
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
{/if}
