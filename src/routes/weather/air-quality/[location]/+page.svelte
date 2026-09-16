<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';

	import { page } from '$app/stores';

	import { reportPageReady } from '$lib/stores/page-transition.svelte';
	import { setActiveLocation, storedAirQualityDomain } from '$lib/stores/settings';

	import { skeletonOut } from '$lib/utils/skeleton-fade';
	import { syncSearchParams, unlessDefault } from '$lib/utils/url-state';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { ChartContainer, ChartToolbar } from '$lib/components/charts';

	import { CanvasChart, type ChartSeries, SERIES_COLORS } from '$lib/charts';
	import * as m from '$lib/paraglide/messages';
	import { type AirQualityResult, fetchAirQuality } from '$lib/services/weather';

	import { useHeroActions } from '../../hero.svelte';
	import { airQualityDomainGroups } from '../../options';
	import ModelSelector from '../../week/[location]/ModelSelector.svelte';

	import type { PageData } from './$types';

	const CHART_GROUP = 'air-quality';

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

	const DEFAULT_DOMAIN = 'auto';

	// The charts, grouped by what reads well on one y-scale. Pollen only has
	// data in Europe during pollen season; the chart is dropped when every
	// species comes back empty.
	const CHART_SPECS: {
		title: string;
		subtitle?: string;
		vars: [string, string][];
		unit?: string;
		yMin?: number;
	}[] = [
		{
			title: 'European AQI',
			subtitle: 'European Air Quality Index · 0-20 good, above 100 extremely poor',
			vars: [['european_aqi', 'European AQI']],
			unit: 'AQI',
			yMin: 0
		},
		{
			title: 'US AQI',
			subtitle: 'United States Air Quality Index · 0-50 good, above 300 hazardous',
			vars: [['us_aqi', 'US AQI']],
			unit: 'AQI',
			yMin: 0
		},
		{
			title: 'Particulate matter',
			vars: [
				['pm10', 'PM10'],
				['pm2_5', 'PM2.5'],
				['dust', 'Dust']
			]
		},
		{
			title: 'Ozone · NO₂ · SO₂',
			vars: [
				['ozone', 'Ozone'],
				['nitrogen_dioxide', 'NO₂'],
				['sulphur_dioxide', 'SO₂']
			]
		},
		{
			title: 'Carbon monoxide',
			vars: [['carbon_monoxide', 'CO']]
		},
		{
			title: 'Pollen',
			subtitle: 'Europe only, during pollen season',
			vars: [
				['alder_pollen', 'Alder'],
				['birch_pollen', 'Birch'],
				['grass_pollen', 'Grass'],
				['mugwort_pollen', 'Mugwort'],
				['olive_pollen', 'Olive'],
				['ragweed_pollen', 'Ragweed']
			]
		}
	];

	const HOURLY_VARS = CHART_SPECS.flatMap((spec) => spec.vars.map(([name]) => name));

	let domain = $state(DEFAULT_DOMAIN);

	let fetchedData: AirQualityResult | null = $state(null);

	// ─── Lifecycle ──────────────────────────────────────────────────────────────

	onMount(() => {
		// a shared link carries its domain; otherwise fall back to the stored choice
		const fromUrl = get(page).url.searchParams.get('domain');
		domain = fromUrl || get(storedAirQualityDomain);
		mounted = true;
	});

	// keep the plotted domain in the URL
	$effect(() => {
		if (!mounted || !domain) return;
		syncSearchParams({ domain: unlessDefault(domain, DEFAULT_DOMAIN) });
	});

	// components persist across refetches; entries are null while unmounted
	let liveCharts = $derived(chartComponents.filter((chart) => chart != null));

	// ─── Data Fetching (only when the domain changes) ───────────────────────────

	$effect(() => {
		const selectedDomain = domain;
		if (!mounted || !selectedDomain) return;

		const loc = location;

		// versioned so a slow stale response can never overwrite a newer one
		const version = ++requestVersion;
		loading = true;
		loadError = null;

		fetchAirQuality({
			latitude: loc.latitude!,
			longitude: loc.longitude!,
			hourlyVariables: HOURLY_VARS,
			domains: selectedDomain,
			timezone: loc.timezone
		})
			.then((result: AirQualityResult) => {
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

	interface ChartDef {
		title?: string;
		subtitle?: string;
		unit: string;
		showCredit: boolean;
		series: ChartSeries[];
		yMin?: number;
	}

	// Hours or variables the chosen domain does not cover come back as NaN;
	// null breaks the line there instead of plotting a bogus zero.
	const clean = (values: number[]): (number | null)[] =>
		values.map((v) => (Number.isFinite(v) ? v : null));

	let chartDefs = $derived.by((): ChartDef[] => {
		if (!fetchedData) return [];

		const defs: ChartDef[] = [];

		for (const spec of CHART_SPECS) {
			const series: ChartSeries[] = [];
			let unit = spec.unit ?? '';

			for (const [si, [varName, label]] of spec.vars.entries()) {
				const varData = fetchedData.variables[varName];
				if (!varData) continue;
				const values = clean(varData.values);
				// a variable without any data (pollen outside Europe) is dropped
				if (!values.some((v) => v != null)) continue;
				if (!spec.unit && varData.unit) unit = varData.unit;
				series.push({
					name: label,
					type: 'line',
					color: SERIES_COLORS[si % SERIES_COLORS.length],
					data: values,
					width: 2,
					format: (v) => `${v.toFixed(1)} ${unit}`.trim()
				});
			}

			if (series.length === 0) continue;

			defs.push({
				title: spec.title,
				subtitle: spec.subtitle ?? (unit ? `hourly values (${unit})` : undefined),
				unit,
				showCredit: false,
				series,
				yMin: spec.yMin
			});
		}

		if (defs.length > 0) defs[defs.length - 1].showCredit = true;
		return defs;
	});
</script>

<!-- the domain picker rides in the layout's location row (see weather/+layout) -->
{#snippet heroActions()}
	<div class="flex w-full items-center gap-3 sm:w-auto">
		<ModelSelector
			selectedModel={domain}
			groups={airQualityDomainGroups}
			label={m.model_air_quality()}
			onModelChange={(selected) => {
				domain = selected;
				storedAirQualityDomain.set(selected);
			}}
		/>
	</div>
{/snippet}

{#if loadError}
	<div
		class="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
	>
		Failed to load air quality data: {loadError}
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
							zeroBaseLeft={true}
							yMin={def.yMin}
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
			<ChartContainer loading chartCount={5} chartHeight={340} bleed={false} />
		</div>
	{/if}
</div>

<!-- ─── Toolbar: Controls + Download ───────────────────────────────────────── -->

<div class="mt-6 md:mt-10">
	<ChartToolbar charts={liveCharts} fileName="air-quality">
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
