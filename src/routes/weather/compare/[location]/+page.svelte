<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';

	import { page } from '$app/stores';

	import { reportPageReady } from '$lib/stores/page-transition.svelte';
	import { setActiveLocation, storedModel, storedUnits } from '$lib/stores/settings';

	import { formatZoned } from '$lib/utils/date';
	import { skeletonOut } from '$lib/utils/skeleton-fade';
	import { listUnlessDefault, readList, syncSearchParams } from '$lib/utils/url-state';

	import {
		ChartContainer,
		ChartToolbar,
		type ExportLegendItem,
		type ExportableChart
	} from '$lib/components/charts';

	import {
		CHART_COLORS,
		CanvasChart,
		type ChartAgreementStrip,
		type ChartSeries,
		groupRange,
		isColumnUnit,
		setGroupRange
	} from '$lib/charts';
	import * as m from '$lib/paraglide/messages';
	import {
		type FriendlyWeatherError,
		type ModelCompareResult,
		fetchModelComparison,
		humanizeWeatherError
	} from '$lib/services/weather';

	import { useHeroActions } from '../../hero.svelte';
	import { defaultParameters, hourly, modelGroups, models as modelOptions } from '../../options';
	import ComparisonSelectionPanel from './ComparisonSelectionPanel.svelte';
	import ModelPictogramTimeline from './ModelPictogramTimeline.svelte';
	import {
		cardinalDirection,
		isWindDirection,
		modelColor,
		modelLabel,
		modelMean,
		precipitationAgreement,
		sanitizeList,
		validDirectionValues
	} from './comparison';

	import type { PageData } from './$types';

	const CHART_GROUP = 'model-compare';
	const MODEL_IDS = new Set(modelOptions.map((model) => model.value));
	const MODEL_ORDER = new Map(modelOptions.map((model, index) => [model.value, index]));
	const AUTOMATIC_SEAMLESS_MODEL_IDS = new Set(
		modelGroups
			.find((group) => group.value === 'automatic_seamless')
			?.models.map((model) => model.value)
	);
	const COMPARE_MODEL_GROUPS = [
		...modelGroups.filter((group) => group.value !== 'automatic_seamless'),
		...modelGroups.filter((group) => group.value === 'automatic_seamless')
	];
	// Weather code and total cloud cover form one comparison feature. Cloud cover
	// remains an auxiliary API field for pictogram shading, not a standalone chart.
	const COMPARISON_HOURLY = hourly.map((group) =>
		group.filter((variable) => variable.value !== 'cloud_cover')
	);
	const VARIABLE_IDS = new Set(COMPARISON_HOURLY.flat().map((variable) => variable.value));
	const VARIABLE_ORDER = new Map(
		COMPARISON_HOURLY.flat().map((variable, index) => [variable.value, index])
	);
	const SECONDS_PER_HOUR = 3600;
	const FETCH_DEBOUNCE_MS = 300;
	const STANDARD_COMPARE_VARIABLES = [
		'temperature_2m',
		'precipitation',
		'wind_speed_10m',
		'wind_direction_10m',
		'weather_code',
		'relative_humidity_2m'
	];

	let { data }: { data: PageData } = $props();

	// the URL is the source of truth: location comes from the load function,
	// which is also correct on hydrated prerendered pages. The persisted store
	// only mirrors it so the header and bare /weather/* redirects follow along.
	let location = $derived(data.location);
	let mounted = $state(false);
	let loading = $state(true);
	let loadError = $state<FriendlyWeatherError | null>(null);
	let retryNonce = $state(0);
	let settledLocationKey = $state<string | null>(null);
	let requestVersion = 0;
	let activeController: AbortController | null = null;
	let chartComponents: CanvasChart[] = $state([]);
	let pictogramExporter: ExportableChart | null = $state(null);

	let isMobile = $state(false);
	let showModelNames = $state(true);
	let modelNamesInitialized = false;
	let initialRangeInitialized = false;
	let compactYAxis = $derived(!showModelNames);
	let comparisonPlotInsetLeft = $derived(
		showModelNames ? (isMobile ? 92 : 116) : isMobile ? 34 : 40
	);
	let comparisonPlotInsetRight = $derived(isMobile ? 8 : 20);
	const DEFAULT_MODELS = orderModels([
		'ecmwf_ifs',
		'meteofrance_arpege_world',
		'ukmo_global_deterministic_10km',
		'icon_global',
		'gfs_global'
	]);
	let params = $state({
		...defaultParameters,
		hourly: [...STANDARD_COMPARE_VARIABLES],
		models: [...DEFAULT_MODELS]
	});
	let appliedHourly = $state<string[]>([...STANDARD_COMPARE_VARIABLES]);
	let appliedModels = $state<string[]>([...params.models]);

	interface FetchedData {
		result: ModelCompareResult;
		selection: { models: string[]; hourly: string[] };
	}

	let fetchedData: FetchedData | null = $state(null);
	let liveCharts = $derived(chartComponents.filter((chart) => chart != null));
	let selectionEmpty = $derived(appliedModels.length === 0 || appliedHourly.length === 0);
	let selectedModelWarning = $derived(params.models.length > 10);

	function hasSameVariables(left: string[], right: string[]): boolean {
		return left.length === right.length && left.every((variable) => right.includes(variable));
	}

	function hasSameOrder(left: string[], right: string[]): boolean {
		return left.length === right.length && left.every((value, index) => value === right[index]);
	}

	function changedValueCount(left: string[], right: string[]): number {
		const leftValues = new Set(left);
		const rightValues = new Set(right);
		let count = 0;
		for (const value of leftValues) if (!rightValues.has(value)) count++;
		for (const value of rightValues) if (!leftValues.has(value)) count++;
		return count;
	}

	function orderModels(values: string[]): string[] {
		return [...values].sort(
			(left, right) =>
				(MODEL_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
				(MODEL_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER)
		);
	}

	function orderVariables(values: string[]): string[] {
		return [...values].sort(
			(left, right) =>
				(VARIABLE_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
				(VARIABLE_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER)
		);
	}

	let variablesDirty = $derived(!hasSameVariables(params.hourly, appliedHourly));
	let modelsDirty = $derived(!hasSameOrder(params.models, appliedModels));
	let displayedVariablesStale = $derived.by(() => {
		const current: FetchedData | null = fetchedData;
		return current !== null && !hasSameVariables(current.selection.hourly, appliedHourly);
	});
	let displayedModelsStale = $derived.by(() => {
		const current: FetchedData | null = fetchedData;
		return current !== null && !hasSameOrder(current.selection.models, appliedModels);
	});
	let comparisonSelectionDirty = $derived(variablesDirty || modelsDirty);
	let pendingVariableChanges = $derived(changedValueCount(params.hourly, appliedHourly));
	let pendingModelChanges = $derived(changedValueCount(params.models, appliedModels));
	let comparisonMuted = $derived(
		comparisonSelectionDirty || displayedVariablesStale || displayedModelsStale
	);
	let currentLocationKey = $derived(
		`${location.latitude},${location.longitude},${location.timezone}`
	);

	// The component survives a location navigation and deliberately keeps its old
	// charts visible while the replacement request runs. `loading` can therefore
	// remain false across the navigation, so track which location has settled.
	reportPageReady(() => mounted && settledLocationKey === currentLocationKey);
	useHeroActions(heroActions);

	$effect(() => setActiveLocation(data.location));
	$effect(() => {
		params.temperature_unit = $storedUnits.temperature_unit;
		params.wind_speed_unit = $storedUnits.wind_speed_unit;
		params.precipitation_unit = $storedUnits.precipitation_unit;
	});

	onMount(() => {
		const url = get(page).url;
		const urlModels = sanitizeList(readList(url, 'models'), MODEL_IDS);
		const urlVars = sanitizeList(readList(url, 'vars'), VARIABLE_IDS);
		if (urlModels) params.models = orderModels(urlModels);
		else {
			const selectedModel = get(storedModel);
			if (
				selectedModel !== 'best_match' &&
				!AUTOMATIC_SEAMLESS_MODEL_IDS.has(selectedModel) &&
				MODEL_IDS.has(selectedModel) &&
				!params.models.includes(selectedModel)
			) {
				params.models = orderModels([...params.models, selectedModel]);
			}
		}
		appliedModels = [...params.models];
		if (urlVars) {
			params.hourly = urlVars;
			appliedHourly = [...urlVars];
		}

		const media = window.matchMedia('(max-width: 639px)');
		const applyMedia = () => {
			isMobile = media.matches;
			if (!modelNamesInitialized) {
				showModelNames = !media.matches;
				modelNamesInitialized = true;
			}
		};
		applyMedia();
		media.addEventListener('change', applyMedia);
		mounted = true;
		return () => media.removeEventListener('change', applyMedia);
	});

	onDestroy(() => activeController?.abort());

	$effect(() => {
		const models = appliedModels;
		const vars = appliedHourly;
		if (!mounted) return;
		// variables are always held in the canonical order, so compare the ordered
		// list against the ordered defaults - only a real change reaches the URL
		syncSearchParams({
			models: listUnlessDefault(models, DEFAULT_MODELS),
			vars: listUnlessDefault(orderVariables(vars), orderVariables(STANDARD_COMPARE_VARIABLES))
		});
	});

	$effect(() => {
		const modelList = [...appliedModels];
		const hourlyVars = [...appliedHourly];
		const loc = location;
		const locationKey = currentLocationKey;
		const units = {
			temperature_unit: params.temperature_unit as 'celsius' | 'fahrenheit',
			wind_speed_unit: params.wind_speed_unit as 'kmh' | 'ms' | 'mph' | 'kn',
			precipitation_unit: params.precipitation_unit as 'mm' | 'inch'
		};
		void retryNonce;
		if (!mounted) return;

		const version = ++requestVersion;
		activeController?.abort();
		activeController = null;

		if (modelList.length === 0 || hourlyVars.length === 0) {
			fetchedData = null;
			loading = false;
			loadError = null;
			settledLocationKey = locationKey;
			return;
		}

		const hasFetchedData = untrack(() => fetchedData !== null);
		loading = !hasFetchedData;
		loadError = null;
		const timer = window.setTimeout(() => {
			const controller = new AbortController();
			activeController = controller;
			fetchModelComparison(
				{
					latitude: loc.latitude,
					longitude: loc.longitude,
					hourlyVariables: [
						...new Set([
							...hourlyVars,
							...(hourlyVars.includes('weather_code') ? ['cloud_cover'] : [])
						])
					],
					models: modelList,
					...units,
					timezone: loc.timezone
				},
				{ signal: controller.signal }
			)
				.then((result) => {
					if (version !== requestVersion) return;
					const applyInitialMobileRange = !initialRangeInitialized && isMobile;
					initialRangeInitialized = true;
					fetchedData = { result, selection: { models: modelList, hourly: hourlyVars } };
					loading = false;
					settledLocationKey = locationKey;
					if (applyInitialMobileRange) {
						void tick().then(() => {
							if (version === requestVersion && groupRange(CHART_GROUP) === null) setRangeDays(3);
						});
					}
				})
				.catch((error: unknown) => {
					if (version !== requestVersion || controller.signal.aborted) return;
					loadError = humanizeWeatherError(error);
					loading = false;
					settledLocationKey = locationKey;
				});
		}, FETCH_DEBOUNCE_MS);

		return () => window.clearTimeout(timer);
	});

	// ─── Chart ranges ────────────────────────────────────────────────────────────

	function setRangeDays(days: number): void {
		if (!fetchedData) return;
		const { timestamps, timezone } = fetchedData.result;
		const today = formatZoned(new Date(), timezone, 'yyyy-MM-dd');
		const startIndex = timestamps.findIndex(
			(timestamp) => formatZoned(new Date(timestamp), timezone, 'yyyy-MM-dd') === today
		);
		if (startIndex === -1) return;
		const dayKeys: string[] = [];
		let endIndex = timestamps.length;
		for (let i = startIndex; i < timestamps.length; i++) {
			const key = formatZoned(new Date(timestamps[i]), timezone, 'yyyy-MM-dd');
			if (!dayKeys.includes(key)) dayKeys.push(key);
			if (dayKeys.length > days) {
				endIndex = i;
				break;
			}
		}
		const start = timestamps[startIndex] / 1000;
		const end =
			endIndex < timestamps.length
				? timestamps[endIndex] / 1000
				: timestamps[timestamps.length - 1] / 1000 + SECONDS_PER_HOUR;
		if (liveCharts[0]) liveCharts[0].setRange(start, end);
		else setGroupRange(CHART_GROUP, { start, end });
	}

	function resetZoom(): void {
		if (liveCharts[0]) liveCharts[0].resetRange();
		else setGroupRange(CHART_GROUP, null);
	}

	const rangePresets = [
		{ label: m.range_today, apply: () => setRangeDays(1) },
		{ label: m.range_3_days, apply: () => setRangeDays(3) },
		{ label: m.range_5_days, apply: () => setRangeDays(5) },
		{ label: m.range_all, apply: resetZoom }
	];
	let zoomActive = $derived(groupRange(CHART_GROUP) != null);

	// ─── Chart definitions ──────────────────────────────────────────────────────

	const variableLabel = (variable: string): string => {
		const labels: Record<string, () => string> = {
			temperature_2m: m.var_temperature,
			apparent_temperature: m.var_apparent,
			dew_point_2m: m.var_dew_point,
			precipitation: m.var_precipitation,
			precipitation_probability: m.var_pop,
			rain: m.var_rain,
			showers: m.var_showers,
			snowfall: m.var_snowfall,
			wind_speed_10m: m.var_wind,
			wind_gusts_10m: m.var_gusts,
			relative_humidity_2m: m.var_humidity,
			cloud_cover: m.var_cloud,
			cloud_cover_low: m.var_cloud_low,
			cloud_cover_mid: m.var_cloud_mid,
			cloud_cover_high: m.var_cloud_high,
			weather_code: m.compare_weather_conditions,
			pressure_msl: m.var_pressure,
			surface_pressure: m.var_surface_pressure
		};
		if (isWindDirection(variable)) {
			const height = variable.match(/_(\d+)m$/)?.[1] ?? '10';
			return m.compare_wind_direction_height({ height });
		}
		return (
			labels[variable]?.() ?? variable.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
		);
	};

	interface ChartDef {
		title: string;
		subtitle: string;
		unit: string;
		series: ChartSeries[];
		zeroBaseLeft: boolean;
		yMin?: number;
		yMax?: number;
		yTicks?: number[];
		yTickFormat?: (value: number) => string;
		agreementStrip?: ChartAgreementStrip;
	}

	let chartDefs = $derived.by((): ChartDef[] => {
		if (!fetchedData) return [];
		const { result, selection } = fetchedData;
		const variables = selection.hourly.filter(
			(variable) => variable !== 'weather_code' && variable !== 'cloud_cover'
		);
		return variables.map((variable) => {
			const direction = isWindDirection(variable);
			const unit = result.units[variable] ?? '';
			const column = !direction && isColumnUnit(unit);
			const series: ChartSeries[] = result.models.map((model) => ({
				name: modelLabel(model.modelId),
				type: direction ? 'point' : column ? 'bar' : 'line',
				color: modelColor(model.modelId, selection.models),
				data: direction
					? validDirectionValues(model.variables[variable])
					: (model.variables[variable] ?? []),
				width: 2,
				pointRadius: 3.25,
				format: direction
					? (value) => `${value.toFixed(0)}° ${cardinalDirection(value)}`
					: undefined
			}));

			if (!direction && variable !== 'precipitation') {
				series.push({
					name: m.compare_model_mean(),
					type: column ? 'bar' : 'line',
					color: CHART_COLORS.average,
					data: modelMean(result.models, variable, result.timestamps.length),
					width: 4,
					dashed: !column,
					outline: !column
				});
			}

			const percentage = [
				'relative_humidity_2m',
				'cloud_cover',
				'cloud_cover_low',
				'cloud_cover_mid',
				'cloud_cover_high',
				'precipitation_probability'
			].includes(variable);
			const floating = [
				'pressure_msl',
				'surface_pressure',
				'temperature_2m',
				'dew_point_2m'
			].includes(variable);
			const amountDecimals = unit === 'inch' || unit === 'in' ? 3 : 1;
			const wetThreshold = unit === 'inch' || unit === 'in' ? 0.1 / 25.4 : 0.1;
			const agreementStrip: ChartAgreementStrip | undefined =
				variable === 'precipitation'
					? {
							points: precipitationAgreement(
								result.models,
								variable,
								result.timestamps.length,
								wetThreshold
							),
							label: m.compare_precipitation_agreement(),
							format: (point) =>
								m.compare_precipitation_agreement_tooltip({
									wet: point.wetCount,
									available: point.availableCount,
									median: point.median.toFixed(amountDecimals),
									min: point.min.toFixed(amountDecimals),
									max: point.max.toFixed(amountDecimals),
									unit
								})
						}
					: undefined;
			return {
				title: variableLabel(variable),
				subtitle:
					variable === 'precipitation'
						? m.compare_precipitation_subtitle({ count: result.models.length })
						: direction
							? m.compare_direction_subtitle({ count: result.models.length })
							: m.compare_scalar_subtitle({ count: result.models.length }),
				unit,
				series,
				agreementStrip,
				zeroBaseLeft: !floating,
				yMin: direction || percentage ? 0 : undefined,
				yMax: direction ? 360 : percentage ? 100 : undefined,
				yTicks: direction ? [0, 90, 180, 270, 360] : undefined,
				yTickFormat: direction
					? (value) => `${cardinalDirection(value)} ${value.toFixed(0)}°`
					: undefined
			};
		});
	});

	let timestampsSec = $derived.by((): number[] => {
		const current: FetchedData | null = fetchedData;
		return current ? current.result.timestamps.map((timestamp) => timestamp / 1000) : [];
	});
	let displayedModels = $derived.by(() => {
		const current: FetchedData | null = fetchedData;
		return current?.result.models ?? [];
	});
	let chartVariablesEmpty = $derived.by(() => {
		const current: FetchedData | null = fetchedData;
		return (
			current?.selection.hourly.every(
				(variable) => variable === 'weather_code' || variable === 'cloud_cover'
			) ?? false
		);
	});
	let noUsableData = $derived.by(() => {
		if (!fetchedData || loading) return false;
		return !fetchedData.result.models.some((model) =>
			Object.values(model.variables).some((values) =>
				values.some((value) => Number.isFinite(value))
			)
		);
	});

	let exportLegend = $derived.by((): ExportLegendItem[] => [
		...displayedModels.map((model) => ({
			name: modelLabel(model.modelId),
			color: modelColor(model.modelId, fetchedData?.selection.models),
			style: 'point' as const
		})),
		...(chartDefs.some((def) => def.series.some((series) => series.name === m.compare_model_mean()))
			? [{ name: m.compare_model_mean(), color: CHART_COLORS.average, style: 'dashed' as const }]
			: [])
	]);

	function toggleSelection(list: 'models' | 'hourly', value: string): void {
		const values = params[list];
		const nextValues = values.includes(value)
			? values.filter((item) => item !== value)
			: [...values, value];
		params[list] = list === 'models' ? orderModels(nextValues) : orderVariables(nextValues);
	}

	function toggleGroupSelection(
		list: 'models' | 'hourly',
		values: string[],
		select: boolean
	): void {
		const groupValues = new Set(values);
		const nextValues = select
			? [...new Set([...params[list], ...values])]
			: params[list].filter((value) => !groupValues.has(value));
		params[list] = list === 'models' ? orderModels(nextValues) : orderVariables(nextValues);
	}

	function restoreStandardVariables(): void {
		params.hourly = [...STANDARD_COMPARE_VARIABLES];
	}

	function applyComparisonSelection(): void {
		const variablesChanged = !hasSameVariables(params.hourly, appliedHourly);
		const modelsChanged = !hasSameOrder(params.models, appliedModels);
		if (modelsChanged) {
			appliedModels = [...params.models];
		}
		if (variablesChanged) appliedHourly = [...params.hourly];
		if (!variablesChanged && !modelsChanged) retryNonce++;
	}

	function discardComparisonSelection(): void {
		params.hourly = [...appliedHourly];
		params.models = [...appliedModels];
	}

	const variableGroupLabels = [
		m.compare_group_temperature,
		m.compare_group_precipitation,
		m.compare_group_clouds,
		m.compare_group_wind,
		m.compare_group_upper_air
	];
	const allHourlyVariables = COMPARISON_HOURLY.flat();
	let modelSelectionGroups = $derived(
		COMPARE_MODEL_GROUPS.map((group) => ({
			value: group.value,
			label: group.label,
			options: group.models.map((model) => ({
				value: model.value,
				label: model.label,
				metadata: [model.resolution, model.update].filter(Boolean).join(' · ')
			}))
		}))
	);
	let variableSelectionGroups = $derived(
		COMPARISON_HOURLY.map((variables, index) => ({
			value: `variables_${index}`,
			label: variableGroupLabels[index](),
			options: variables.map((variable) => ({
				value: variable.value,
				label: variableLabel(variable.value)
			}))
		}))
	);
</script>

<svelte:head>
	<title>Drizz.li | {m.page_compare_title()}</title>
	<link rel="canonical" href="https://drizz.li/weather/compare" />
	<meta name="description" content={m.page_compare_description()} />
</svelte:head>

{#snippet rangeControls(compact = false)}
	<div class="flex min-w-max items-center gap-2" aria-label={m.range_group_aria()}>
		{#if zoomActive}
			<button
				type="button"
				class="rounded-lg border border-primary/50 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
				onclick={resetZoom}>{m.reset_zoom()}</button
			>
		{/if}
		<div class="inline-flex rounded-lg bg-muted p-0.5 text-xs font-semibold" role="group">
			{#each rangePresets as preset (preset.label())}
				<button
					type="button"
					class="rounded-md px-2.5 py-1 whitespace-nowrap text-muted-foreground transition-colors hover:bg-background hover:text-foreground hover:shadow-sm {compact
						? 'min-h-9'
						: ''}"
					onclick={preset.apply}>{preset.label()}</button
				>
			{/each}
		</div>
	</div>
{/snippet}

{#snippet heroActions()}
	<!-- Same footprint and look as the model selector on the other pages, so the
	     title row is the same height everywhere. Selection itself happens in the
	     multi-select panel further down, so this only hands over to it. -->
	<div class="flex w-full min-w-0 items-center gap-3 sm:w-auto">
		<button
			type="button"
			class="group flex h-auto min-h-12 w-full min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl border-2 border-primary/35 bg-card py-1.5 ps-2.5 pe-3 text-left shadow-sm transition-colors hover:border-primary/70 hover:shadow-md sm:min-h-14 sm:w-80 sm:flex-none sm:gap-3 sm:py-2"
			onclick={() =>
				document.getElementById('models')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
		>
			<div
				class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary sm:size-9"
			>
				<!-- layered-globe icon, matching the model selector -->
				<svg
					class="size-4.5 sm:size-5"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					stroke-width="1.75"
				>
					<circle cx="12" cy="12" r="9" />
					<path
						stroke-linecap="round"
						d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"
					/>
				</svg>
			</div>
			<div class="flex min-w-0 flex-1 flex-col items-start gap-0 overflow-hidden">
				<span class="text-[11px] font-semibold tracking-wide text-primary uppercase">
					{m.compare_models_heading()}
				</span>
				<span class="max-w-full truncate text-[13px] font-bold text-foreground sm:text-sm">
					{params.models.length} / {modelOptions.length}
				</span>
				<span
					class="hidden max-w-full truncate text-[11px] leading-tight text-muted-foreground sm:block"
				>
					{m.compare_models_choose()}
				</span>
			</div>
			<svg
				class="size-4 shrink-0 text-muted-foreground"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
			</svg>
		</button>
	</div>

	<div class="lg:absolute lg:right-0 lg:top-20 z-40 hidden items-center gap-3 lg:flex">
		<span class="text-xs text-muted-foreground">
			{m.meteograms_zoom_hint()}
			<kbd class="rounded border border-border bg-muted px-1 py-0.5 font-sans text-[10px]">Ctrl</kbd
			>
			{m.meteograms_zoom_hint_end()}
		</span>
		{@render rangeControls()}
	</div>
{/snippet}

<div class="-mx-3 mb-3 overflow-x-auto px-3 lg:hidden">{@render rangeControls(true)}</div>

{#if loadError}
	<div
		class="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm"
		role="alert"
	>
		<p class="font-semibold text-destructive">{loadError.title}</p>
		{#if loadError.hint}<p class="mt-0.5 text-destructive/90">{loadError.hint}</p>{/if}
		{#if fetchedData}<p class="mt-1 text-xs text-destructive/80">
				{m.compare_showing_previous()}
			</p>{/if}
		<button
			type="button"
			class="mt-2 rounded-md border border-destructive/40 bg-background px-3 py-1 text-xs font-semibold text-destructive"
			onclick={() => retryNonce++}>{m.action_try_again()}</button
		>
		{#if loadError.detail}
			<details class="mt-2 text-xs text-destructive/70">
				<summary>{m.error_technical_details()}</summary>
				<p class="mt-1 font-mono break-all">{loadError.detail}</p>
			</details>
		{/if}
	</div>
{/if}

<!-- `relative` lets the placeholder dissolve over the finished charts (skeletonOut) -->
<div class="relative">
	{#if selectionEmpty}
		<div
			class="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground"
		>
			{m.compare_empty_selection()}
		</div>
	{:else if noUsableData}
		<div
			class="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-4 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200"
		>
			{m.compare_no_data()}
		</div>
	{:else if loadError && !fetchedData}
		<!-- The actionable error panel above replaces the chart until a retry succeeds. -->
	{:else if fetchedData && chartVariablesEmpty}
		<div
			class="rounded-xl border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground"
		>
			{m.compare_weather_codes_only()}
		</div>
	{:else if fetchedData}
		<div
			class="relative -mx-3 border-y border-border/70 bg-card shadow-sm lg:mx-0 lg:rounded-2xl lg:border"
		>
			<div
				class="transition-[opacity,filter] duration-200 {comparisonMuted
					? 'pointer-events-none opacity-35 saturate-50'
					: ''}"
			>
				{#each chartDefs as def, i (def.title)}
					<div class="px-0 pt-1.5 pb-1 lg:px-4 lg:pb-3 {i > 0 ? 'border-t border-border/50' : ''}">
						<div class="mb-1 px-3 lg:px-0">
							<h2 class="text-sm font-bold tracking-tight">{def.title}</h2>
							<p class="text-xs text-muted-foreground">{def.subtitle}</p>
						</div>
						<ChartContainer
							loading={loading && !fetchedData}
							chartCount={1}
							chartHeight={280}
							minWidth={520}
							bleed={false}
						>
							<CanvasChart
								bind:this={chartComponents[i]}
								timestamps={timestampsSec}
								timezone={fetchedData.result.timezone}
								series={def.series}
								agreementStrip={def.agreementStrip}
								bands={fetchedData.result.daylightBands}
								unit={def.unit}
								zeroBaseLeft={def.zeroBaseLeft}
								yMin={def.yMin}
								yMax={def.yMax}
								yTicks={def.yTicks}
								yTickFormat={def.yTickFormat}
								{compactYAxis}
								plotInsetLeft={comparisonPlotInsetLeft}
								plotInsetRight={comparisonPlotInsetRight}
								showCredit={i === chartDefs.length - 1}
								height={280}
								group={CHART_GROUP}
								ariaLabel={`${def.title}. ${def.subtitle}`}
							/>
						</ChartContainer>
					</div>
				{/each}
			</div>
			{#if comparisonMuted}
				<div
					class="absolute inset-0 z-40 flex items-start justify-center bg-background/30 px-4 py-6 backdrop-blur-[1px]"
				>
					<div
						class="sticky top-24 flex flex-col items-center gap-2 rounded-xl border border-border/70 bg-background/95 p-3 text-center shadow-lg"
						role="status"
					>
						<span class="text-xs font-semibold text-muted-foreground">
							{m.compare_selection_pending()}
						</span>
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<!-- reserve the chart area height before data arrives (no layout shift) -->
		<div in:fade={{ duration: 200 }} out:skeletonOut>
			<ChartContainer
				loading
				chartCount={appliedHourly.filter((v) => v !== 'weather_code' && v !== 'cloud_cover')
					.length || 1}
				chartHeight={300}
				bleed={false}
			/>
		</div>
	{/if}
</div>

{#if fetchedData && !loading && fetchedData.selection.hourly.includes('weather_code')}
	<div
		class="transition-[opacity,filter] duration-200 {comparisonMuted
			? 'pointer-events-none opacity-35 saturate-50'
			: ''}"
	>
		<ModelPictogramTimeline
			timestamps={fetchedData.result.timestamps}
			models={fetchedData.result.models}
			modelOrder={fetchedData.selection.models}
			sunrise={fetchedData.result.sunrise}
			sunset={fetchedData.result.sunset}
			timezone={fetchedData.result.timezone}
			group={CHART_GROUP}
			plotInsetLeft={comparisonPlotInsetLeft}
			plotInsetRight={comparisonPlotInsetRight}
			{showModelNames}
			onToggleModelNames={() => (showModelNames = !showModelNames)}
			registerExporter={(exporter) => (pictogramExporter = exporter)}
		/>
	</div>
{/if}

{#if fetchedData && displayedModels.length > 0}
	<div
		class="mt-5 rounded-xl border border-border/70 bg-card px-3 py-2.5 transition-opacity {comparisonMuted
			? 'pointer-events-none opacity-40'
			: ''}"
	>
		<p class="text-xs font-semibold text-muted-foreground">{m.compare_model_colors()}</p>
		<div class="-mx-1 mt-2 flex gap-3 overflow-x-auto px-1 pb-1 sm:flex-wrap">
			{#each displayedModels as model (model.modelId)}
				<span class="flex min-h-8 shrink-0 items-center gap-1.5 text-xs">
					<span
						class="size-2.5 rounded-full"
						style:background-color={modelColor(model.modelId, fetchedData.selection.models)}
					></span>
					{modelLabel(model.modelId)}
				</span>
			{/each}
			{#if chartDefs.some( (def) => def.series.some((series) => series.name === m.compare_model_mean()) )}
				<span class="flex shrink-0 items-center gap-1.5 text-xs">
					<span class="w-4 border-t-2 border-dashed" style:border-color={CHART_COLORS.average}
					></span>
					{m.compare_model_mean()}
				</span>
			{/if}
		</div>
	</div>

	<div
		class="mt-4 flex justify-end transition-opacity {comparisonMuted
			? 'pointer-events-none opacity-40'
			: ''}"
	>
		<ChartToolbar
			charts={[
				...chartDefs.map((def, i) => ({ chart: chartComponents[i], title: def.title })),
				{ chart: pictogramExporter, title: m.compare_timeline_title() }
			]}
			fileName="model-comparison"
			exportOptions={{
				title: `${location.name} · ${m.page_compare_subtitle()}`,
				legend: exportLegend
			}}
		/>
	</div>
{/if}

<section
	class="mt-6 border-t border-border/60 pt-5 md:mt-10"
	aria-labelledby="hourly_weather_variables"
>
	<div class="flex items-baseline justify-between gap-3">
		<h2 id="hourly_weather_variables" class="text-2xl md:text-3xl">
			{m.compare_variables_heading()}
		</h2>
		<span class="shrink-0 text-sm text-muted-foreground">
			{params.hourly.length}/{allHourlyVariables.length}
		</span>
	</div>
	<ComparisonSelectionPanel
		mode="variables"
		groups={variableSelectionGroups}
		selected={params.hourly}
		onToggle={(value) => toggleSelection('hourly', value)}
		onToggleGroup={(values, select) => toggleGroupSelection('hourly', values, select)}
		onRestoreDefaults={restoreStandardVariables}
	/>
</section>

<section class="mt-5 border-t border-border/60 pt-5 md:mt-10" aria-labelledby="models">
	<div class="flex items-baseline justify-between gap-3">
		<h2 id="models" class="text-2xl md:text-3xl">{m.compare_models_heading()}</h2>
		<span class="shrink-0 text-sm text-muted-foreground">
			{params.models.length}/{modelOptions.length}
		</span>
	</div>
	{#if selectedModelWarning}
		<p
			class="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
			role="status"
		>
			{m.compare_many_models_warning({ count: params.models.length })}
		</p>
	{/if}
	<ComparisonSelectionPanel
		mode="models"
		groups={modelSelectionGroups}
		selected={params.models}
		onToggle={(value) => toggleSelection('models', value)}
		onToggleGroup={(values, select) => toggleGroupSelection('models', values, select)}
	/>
</section>

{#if comparisonSelectionDirty}
	<div class="h-24" aria-hidden="true"></div>
	<div
		class="pointer-events-none fixed right-3 bottom-3 left-3 z-50 md:left-auto md:w-[42rem] md:max-w-[calc(100vw-2rem)] lg:right-8"
	>
		<div
			class="pointer-events-auto flex flex-col gap-3 rounded-2xl border border-primary/30 bg-background/95 p-3 shadow-2xl backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-4"
		>
			<div class="min-w-0" aria-live="polite">
				<p class="text-sm font-bold">{m.compare_selection_pending()}</p>
				<div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
					{#if variablesDirty}
						<span>{m.compare_variables_heading()}: {pendingVariableChanges}</span>
					{/if}
					{#if modelsDirty}
						<span>{m.compare_models_heading()}: {pendingModelChanges}</span>
					{/if}
				</div>
			</div>
			<div class="grid shrink-0 grid-cols-2 gap-2">
				<button
					type="button"
					class="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-muted"
					onclick={discardComparisonSelection}
				>
					{m.compare_discard_changes()}
				</button>
				<button
					type="button"
					class="min-h-10 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
					onclick={applyComparisonSelection}
				>
					{m.compare_apply_selection()}
				</button>
			</div>
		</div>
	</div>
{/if}
