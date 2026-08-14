<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';

	import { reportPageReady } from '$lib/stores/page-transition.svelte';
	import { setActiveLocation, storedSeasonalModel, storedUnits } from '$lib/stores/settings';

	import { skeletonOut } from '$lib/utils/skeleton-fade';

	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import { ChartContainer, ChartToolbar } from '$lib/components/charts';

	import * as m from '$lib/paraglide/messages';
	import {
		type ClimateNormals,
		type SeasonalForecastResult,
		fetchClimateNormals,
		fetchSeasonalForecast
	} from '$lib/services/weather';

	import { useHeroActions } from '../../hero.svelte';
	import { defaultParameters, seasonalModelGroups } from '../../options';
	import ModelSelector from '../../week/[location]/ModelSelector.svelte';
	import { getPrecipUnit } from '../../week/[location]/types';
	import SeasonalCharts from './SeasonalCharts.svelte';
	import SeasonalMonths from './SeasonalMonths.svelte';
	import { buildMonthOutlooks, sliceSeasonal } from './outlook';

	import type { CanvasChart } from '$lib/charts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The page cross-fade waits for this before revealing the new page, and so
	// does the loading overlay.
	reportPageReady(() => result != null || loadError != null);

	useHeroActions(heroActions);

	// the URL is the source of truth: location comes from the load function,
	// which is also correct on hydrated prerendered pages. The persisted store
	// only mirrors it so the header and bare /weather/* redirects follow along.
	let location = $derived(data.location);
	$effect(() => {
		setActiveLocation(data.location);
	});

	let params = $state({ ...defaultParameters });
	$effect(() => {
		params.temperature_unit = $storedUnits.temperature_unit;
		params.wind_speed_unit = $storedUnits.wind_speed_unit;
		params.precipitation_unit = $storedUnits.precipitation_unit;
	});

	// Only the variables the outlook actually renders: every extra one costs a
	// full member set (50+ series) over half a year of days.
	const SEASONAL_VARS = [
		'temperature_2m_max',
		'temperature_2m_min',
		'temperature_2m_mean',
		'precipitation_sum'
	];

	// ─── Display state (no refetch) ─────────────────────────────────────────────
	const RANGES = [
		{ label: '3 months', days: 92 },
		{ label: '6 months', days: 183 },
		{ label: 'Full range', days: Infinity }
	];
	let rangeIndex = $state(1);
	let showLegend = $state(true);
	let chartComponents: CanvasChart[] = $state([]);
	let liveCharts = $derived(chartComponents.filter((chart) => chart != null));

	// ─── Fetch state ────────────────────────────────────────────────────────────
	let mounted = $state(false);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let requestVersion = 0;

	let result = $state<SeasonalForecastResult | null>(null);
	let normals = $state<ClimateNormals | null>(null);

	let seasonalModel = $state('best_match');
	onMount(() => {
		seasonalModel = get(storedSeasonalModel);
		mounted = true;
	});

	// The full horizon is fetched once per location/units; the range buttons only
	// reslice it.
	$effect(() => {
		const loc = location;
		const tempUnit = params.temperature_unit;
		const precipUnit = params.precipitation_unit;
		const model = seasonalModel;
		if (!mounted || !loc) return;

		const version = ++requestVersion;
		loading = true;
		loadError = null;

		fetchSeasonalForecast({
			latitude: loc.latitude!,
			longitude: loc.longitude!,
			dailyVariables: SEASONAL_VARS,
			model,
			temperature_unit: tempUnit as 'celsius' | 'fahrenheit',
			wind_speed_unit: params.wind_speed_unit as 'kmh' | 'ms' | 'mph' | 'kn',
			precipitation_unit: precipUnit as 'mm' | 'inch',
			timezone: loc.timezone
		})
			.then((r) => {
				if (version !== requestVersion) return;
				result = r;
				loading = false;
			})
			.catch((err: unknown) => {
				if (version !== requestVersion) return;
				loadError = err instanceof Error ? err.message : String(err);
				loading = false;
			});
	});

	// Normals are the whole point of a seasonal outlook (everything is shown as a
	// departure from them), but a failure only drops the comparison.
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
				if (version === normalsVersion) normals = null;
			});
		void key;
	});

	// ─── Derived view ───────────────────────────────────────────────────────────
	let visible = $derived(result ? sliceSeasonal(result, RANGES[rangeIndex].days) : null);

	// 1 mm and 0.04 in are the same "measurable rain" threshold in either unit.
	let wetDayThreshold = $derived(getPrecipUnit(params) === 'in' ? 0.04 : 1);

	let months = $derived(visible ? buildMonthOutlooks(visible, normals, { wetDayThreshold }) : []);

	let horizonDays = $derived(result?.timestamps.length ?? 0);
	let lastDay = $derived(
		visible && visible.dailyDates.length > 0
			? visible.dailyDates[visible.dailyDates.length - 1]
			: null
	);
	// dailyDates are local wall time held as UTC instants (see the service), so
	// the label has to be formatted in UTC to read back the local date.
	let lastDayLabel = $derived(
		lastDay
			? lastDay.toLocaleDateString(undefined, {
					month: 'long',
					day: 'numeric',
					year: 'numeric',
					timeZone: 'UTC'
				})
			: ''
	);
</script>

<svelte:head>
	<title>Drizz.li | {m.page_seasonal_subtitle()}</title>
	<meta
		name="description"
		content="Multi-month seasonal outlook: monthly temperature and precipitation trends against the 1991-2020 climate normal"
	/>
</svelte:head>

<!-- the range buttons ride in the layout's location row (see weather/+layout) -->
{#snippet heroActions()}
	<!-- Out of flow on lg+ (the hero row is `relative`), same as the week, 14-day
	     and archive pages: the controls then cannot move the heading when they
	     change size. -->
	<div class="flex w-full flex-wrap items-center gap-3 sm:w-auto">
		<!-- Range buttons reslice the already-fetched horizon (no refetch). While a
		     forecast is on its way they stay mounted but invisible, because
		     mounting them on arrival re-flowed the row and nudged the heading.
		     The exception is below sm, where the group is a full-width row of its
		     own and the gap would be reserved for nothing. -->
		<div
			class="flex w-full gap-1 rounded-lg border border-border bg-card p-1 sm:w-auto {result
				? ''
				: 'hidden sm:flex sm:invisible'}"
			role="group"
			aria-label={m.seasonal_range_aria()}
			aria-hidden={!result}
		>
			{#each RANGES as range, i (range.label)}
				{@const disabled = !result || (range.days !== Infinity && range.days > horizonDays)}
				<button
					type="button"
					class="flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors sm:flex-none {rangeIndex ===
					i
						? 'bg-primary text-primary-foreground'
						: 'text-muted-foreground hover:bg-muted hover:text-foreground'} {disabled
						? 'cursor-not-allowed opacity-40'
						: ''}"
					aria-pressed={rangeIndex === i}
					{disabled}
					tabindex={result ? undefined : -1}
					onclick={() => (rangeIndex = i)}
				>
					{range.label}
				</button>
			{/each}
		</div>
		<ModelSelector
			selectedModel={seasonalModel}
			groups={seasonalModelGroups}
			label={m.model_seasonal()}
			onModelChange={(model) => {
				seasonalModel = model;
				storedSeasonalModel.set(model);
			}}
		/>
	</div>
{/snippet}

<!-- What a seasonal forecast is (and is not): without this the daily-looking
     charts invite over-reading. -->
<div
	class="mb-4 flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-3.5 py-2.5 text-sm"
>
	<svg
		class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
		fill="none"
		stroke="currentColor"
		viewBox="0 0 24 24"
		stroke-width="2"
	>
		<path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4m0-4h.01" />
		<circle cx="12" cy="12" r="9" />
	</svg>
	<p class="text-muted-foreground">
		{m.seasonal_explainer_before()}
		<strong class="font-semibold text-foreground">{m.seasonal_explainer_strong()}</strong>
		{m.seasonal_explainer_after()}
		{#if lastDayLabel}
			{m.seasonal_runs_to({ date: lastDayLabel })}
		{/if}
	</p>
</div>

{#if loadError}
	<div
		class="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
	>
		Failed to load the seasonal outlook: {loadError}
	</div>
{/if}

<!-- `relative` anchors the placeholder while it fades out over the real
     outlook rather than holding its own slot in the layout (skeletonOut). -->
<div class="relative">
	{#if visible && months.length > 0}
		<SeasonalMonths {months} units={params} {normals} />

		<div class="mt-6">
			<SeasonalCharts
				result={visible}
				{normals}
				units={params}
				{loading}
				{showLegend}
				bind:charts={chartComponents}
			/>
		</div>

		<div class="mt-6 md:mt-10">
			<ChartToolbar charts={liveCharts} fileName="seasonal-outlook">
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
	{:else if !loadError}
		<div in:fade={{ duration: 200 }} out:skeletonOut class="grid gap-3">
			<div class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
				{#each [0, 1, 2, 3, 4, 5] as i (i)}
					<div class="h-44 animate-pulse rounded-xl border border-border/70 bg-card"></div>
				{/each}
			</div>
			<ChartContainer loading chartCount={2} chartHeight={300} bleed={false} />
		</div>
	{/if}
</div>
