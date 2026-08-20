<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';

	import { page } from '$app/stores';

	import { reportPageReady } from '$lib/stores/page-transition.svelte';
	import {
		setActiveLocation,
		storedChartLayout,
		storedModel,
		storedUnits,
		storedVariablePrefs
	} from '$lib/stores/settings';

	import { formatZoned } from '$lib/utils/date';
	import { daySwap, runDayTransition } from '$lib/utils/day-swap';
	import { buildLocationRoute } from '$lib/utils/location';
	import { skeletonOut } from '$lib/utils/skeleton-fade';
	import { syncSearchParams, unlessDefault } from '$lib/utils/url-state';

	import { ChartContainer } from '$lib/components/charts';

	import { href } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import {
		type FriendlyWeatherError,
		type WeekForecastResult,
		fetchWeekForecast,
		humanizeWeatherError
	} from '$lib/services/weather';

	import { useHeroActions } from '../../hero.svelte';
	import { defaultParameters, inDomainCity } from '../../options';
	import { computeDayNightWeatherCodes } from '../../utils/weather-codes';
	import DailyStripSticky from './DailyStripSticky.svelte';
	import DaySummary from './DaySummary.svelte';
	import HourlyTable from './HourlyTable.svelte';
	import MeteogramCharts from './MeteogramCharts.svelte';
	import ModelSelector from './ModelSelector.svelte';
	import NearbyCities from './NearbyCities.svelte';
	import VariableSidebar from './VariableSidebar.svelte';
	import { neededHourlyApiVars } from './variables';

	import type { PageData } from './$types';
	import type { FetchedDaily, FetchedHourly } from './types';

	let { data }: { data: PageData } = $props();

	// the page cross-fade waits for this before revealing the new page
	reportPageReady(() => (fetchedDaily != null && fetchedHourly != null) || loadError != null);

	useHeroActions(heroActions);

	let params = $state({
		models: ['best_match'],
		...defaultParameters
	});

	// units live in a persisted store; mirror them into params so a change
	// re-runs the fetch effect below (which reads params.*_unit)
	$effect(() => {
		params.temperature_unit = $storedUnits.temperature_unit;
		params.wind_speed_unit = $storedUnits.wind_speed_unit;
		params.precipitation_unit = $storedUnits.precipitation_unit;
	});

	let variableSidebarOpen = $state(false);
	let hourlyDetailsOpen = $state(false);
	let chartsOpen = $state(false);

	// Meteogram canvases are shorter on phones, where a 300px plot eats most of
	// the viewport. The placeholder below uses the same number, so the reserved
	// space still matches exactly.
	let narrowViewport = $state(false);
	onMount(() => {
		const mq = window.matchMedia('(max-width: 767px)');
		const apply = () => (narrowViewport = mq.matches);
		apply();
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	});
	let chartHeight = $derived(narrowViewport ? 215 : 300);

	// Number of meteogram panels: reserves the chart area height before data
	// arrives (no layout shift)
	let enabledChartCount = $derived($storedChartLayout.filter((p) => p.variables.length > 0).length);

	// The hourly table is a header row, the time/daylight row, then one row per
	// enabled variable, so the placeholder below reserves exactly that and
	// nothing under it jumps when the real table arrives. Rows are shorter below
	// lg, where the cells sit tighter - measured, not guessed: 36px against 55px,
	// and the time row is 48px at every width.
	let compactRows = $state(false);
	onMount(() => {
		const mq = window.matchMedia('(max-width: 1023px)');
		const apply = () => (compactRows = mq.matches);
		apply();
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	});
	let tableRowPx = $derived(compactRows ? 36 : 55);

	// Height one meteogram takes: the plot plus its chrome (title row, axis
	// labels, legend). Measured from the rendered charts, and it steps twice -
	// the plot itself is shorter on phones, and from lg up the sidebar narrows
	// the charts enough that their chrome takes another line.
	let chartSlotHeight = $derived(
		narrowViewport ? chartHeight + 53 : compactRows ? chartHeight + 57 : chartHeight + 73
	);
	const TABLE_TIME_ROW_PX = 48;
	let enabledTableRows = $derived(Object.values($storedVariablePrefs.table).filter(Boolean).length);

	// Request only the hourly variables the table rows and meteograms actually
	// show, so unused variables are never fetched. weather_code is always
	// included: the day cards / strip derive their day- and night-period icons
	// from the hourly codes locally.
	let hourlyVars = $derived([
		...new Set([
			...neededHourlyApiVars(
				$storedVariablePrefs.table,
				$storedChartLayout.flatMap((p) => p.variables)
			),
			'weather_code'
		])
	]);

	// the URL is the source of truth: location comes from the load function,
	// which is also correct on hydrated prerendered pages. The persisted store
	// only mirrors it so the header and bare /weather/* redirects follow along.
	let location = $derived(data.location);
	$effect(() => {
		setActiveLocation(data.location);
	});

	// Lets the strip's side buttons hand over to the archive / seasonal outlook
	// for the same place once their range is exhausted.
	let locationRoute = $derived(buildLocationRoute(location));

	// When a regional model has no data here, point at a place it does cover
	// rather than only offering to abandon the model.
	let suggestedCity = $derived.by(() => {
		const city = inDomainCity(params.models?.[0] ?? '');
		// pointless to offer the place we are already on
		return city && city.slug !== locationRoute ? city : null;
	});

	let mounted = $state(false);
	let loading = $state(true);
	let loadError = $state<FriendlyWeatherError | null>(null);
	let requestVersion = 0;
	// bumped by the "Try again" button to re-run the fetch effect
	let retryNonce = $state(0);

	/** Back to the model that always has data (also what ModelSelector does). */
	function resetToBestMatch() {
		params.models = ['best_match'];
		storedModel.set('best_match');
		forecastDays = 7;
		pastDays = 0;
	}

	// A request can succeed yet contain nothing usable: regional models return
	// all-NaN outside their coverage area. Detect that so the page can say so
	// instead of silently rendering an empty strip.
	let noData = $derived.by((): boolean => {
		const fd = fetchedDaily;
		if (loading || !fd) return false;
		return !fd.daily.temperature_2m_max.some(
			(v, i) => v != null && !isNaN(v) && !(v === 0 && fd.daily.temperature_2m_min[i] === 0)
		);
	});

	// 7 by default; the user can extend to the model's longer range (up to 16 days)
	let forecastDays = $state(7);
	// 0 by default; the user can pull in a few recent past days
	let pastDays = $state(0);

	const selectedDay = new SvelteDate();

	let fetchedHourly: FetchedHourly | null = $state(null);
	let fetchedDaily: FetchedDaily | null = $state(null);

	// Stable per-day key: the fade only replays when the day actually changes,
	// not on every clock tick or refetch.
	let selectedDayKey = $derived.by(() => {
		const fd = fetchedDaily;
		return fd ? formatZoned(selectedDay, fd.timezone, 'yyyy-MM-dd') : '';
	});

	// A model swap can leave the open day outside what the new model covers (a
	// short-range model after a 15-day one, say). Rather than showing an empty
	// day, fall back to the nearest day that does have data - searching forward
	// first, then back.
	$effect(() => {
		const fd = fetchedDaily;
		if (!fd || wantedDay) return;
		const days = fd.dailyDates;
		if (days.length === 0) return;

		const covered = (i: number) => {
			const max = fd.daily.temperature_2m_max[i];
			return max != null && Number.isFinite(max);
		};
		const current = days.findIndex(
			(d) => formatZoned(d, fd.timezone, 'yyyy-MM-dd') === selectedDayKey
		);
		if (current >= 0 && covered(current)) return;

		const from = current >= 0 ? current : 0;
		for (let step = 0; step < days.length; step++) {
			for (const i of [from + step, from - step]) {
				if (i >= 0 && i < days.length && covered(i)) {
					selectedDay.setTime(days[i].getTime());
					return;
				}
			}
		}
	});

	// Charts intentionally keep their current range: they show the full week
	// unless the user narrows it via the range presets or Ctrl+scroll.
	// A model that answers with a broken timestamp must not be able to park an
	// unreadable date in `selectedDay`: everything downstream formats it, and a
	// date that cannot be formatted takes the page with it.
	const switchDay = (date: Date) => {
		const time = date?.getTime();
		if (!Number.isFinite(time)) return;
		runDayTransition(() => selectedDay.setTime(time));
	};

	onMount(() => {
		// the URL wins over the persisted choice, so a shared link opens on the
		// same model the sender was looking at
		const fromUrl = get(page).url.searchParams.get('model');
		params.models = [fromUrl || get(storedModel)];
		mounted = true;
	});

	// Apply ?day= once the forecast is in: the parameter is a plain calendar date,
	// which only means something against the location's own timezone.
	// A `?day=` outside what this page can ever show (more than 3 days back, or
	// beyond the 15-day horizon) is dropped and we open on today. A day that IS
	// reachable but sits outside the default 7-day window widens the request up
	// front, so the link loads straight into the right day instead of showing
	// today and making the visitor click.
	let wantedDay: string | null = $state(null);
	onMount(() => {
		const param = get(page).url.searchParams.get('day');
		if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return;

		const target = Date.parse(`${param}T12:00:00Z`);
		if (Number.isNaN(target)) return;
		const now = new Date();
		const todayNoon = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12);
		const offset = Math.round((target - todayNoon) / 86_400_000);

		if (offset < -3 || offset > 15) return; // out of reach: stay on today
		wantedDay = param;
		if (offset < 0) pastDays = 3;
		if (offset >= 7) forecastDays = 15;
	});

	// Select it as soon as a fetch arrives that actually covers the day.
	$effect(() => {
		const fd = fetchedDaily;
		const wanted = wantedDay;
		if (!fd || !wanted) return;
		const match = fd.dailyDates.find((d) => formatZoned(d, fd.timezone, 'yyyy-MM-dd') === wanted);
		if (match) {
			selectedDay.setTime(match.getTime());
			wantedDay = null;
		}
	});

	// Mirror the open day and the plotted model back into the URL.
	$effect(() => {
		const dayKey = selectedDayKey;
		const model = params.models?.[0];
		if (!mounted || !dayKey) return;
		const isToday = fetchedDaily
			? dayKey === formatZoned(new Date(), fetchedDaily.timezone, 'yyyy-MM-dd')
			: false;
		syncSearchParams({
			day: isToday ? null : dayKey,
			model: unlessDefault(model, 'best_match')
		});
	});

	$effect(() => {
		const loc = location;
		const modelList = params.models;
		const requestVars = hourlyVars;
		void retryNonce; // re-run on "Try again"

		if (!mounted || !loc || !modelList?.length) return;

		// versioned so a slow stale response can never overwrite a newer one
		const version = ++requestVersion;
		loading = true;
		loadError = null;

		fetchWeekForecast({
			latitude: loc.latitude!,
			longitude: loc.longitude!,
			model: modelList[0],
			hourlyVariables: requestVars,
			temperature_unit: params.temperature_unit as 'celsius' | 'fahrenheit',
			wind_speed_unit: params.wind_speed_unit as 'kmh' | 'ms' | 'mph' | 'kn',
			precipitation_unit: params.precipitation_unit as 'mm' | 'inch',
			forecast_days: forecastDays,
			past_days: pastDays,
			timezone: loc.timezone
		})
			.then((result: WeekForecastResult) => {
				if (version !== requestVersion) return;

				fetchedHourly = {
					hourly: result.hourly,
					utc_offset_seconds: result.utcOffsetSeconds,
					timezone: result.timezone,
					timestamps: result.hourlyTimestamps,
					hourlyDates: result.hourlyDates,
					daylightBands: result.daylightBands
				};

				// Split the hourly codes into daylight / following-night buckets so
				// the night badge shows the actual night conditions instead of a
				// night-styled copy of the day icon.
				const parts = computeDayNightWeatherCodes(
					result.hourlyTimestamps,
					result.hourly.weather_code,
					result.daily.sunrise,
					result.daily.sunset
				);
				fetchedDaily = {
					daily: result.daily,
					timezone: result.timezone,
					dailyDates: result.dailyDates,
					dayCodes: parts.day.map((c, i) => c ?? result.daily.weather_code[i]),
					nightCodes: parts.night.map((c, i) => c ?? parts.day[i] ?? result.daily.weather_code[i])
				};

				loading = false;
			})
			.catch((err: unknown) => {
				if (version !== requestVersion) return;
				loadError = humanizeWeatherError(err);
				loading = false;
			});
	});
</script>

<svelte:head>
	<title>Drizz.li | {m.page_week_title()}</title>
	<link rel="canonical" href="https://drizz.li/weather/week" />
	<meta name="description" content="Weekly weather forecast with detailed hourly data" />
</svelte:head>

<!-- the model picker rides in the layout's location row (see weather/+layout) -->
{#snippet heroActions()}
	<div class="flex w-full min-w-0 items-center gap-3 sm:w-auto">
		<ModelSelector
			selectedModel={params.models?.[0] ?? 'best_match'}
			onModelChange={(model) => {
				params.models = [model];
				storedModel.set(model);
				// a new model may not support the extended / past range
				forecastDays = 7;
				pastDays = 0;
			}}
		/>
	</div>
{/snippet}

<div class="week-page">
	<div class="weather-content" style="min-height: 50vh">
		<VariableSidebar open={variableSidebarOpen} onClose={() => (variableSidebarOpen = false)} />

		{#if loadError}
			<div class="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
				<p class="font-semibold text-destructive">{loadError.title}</p>
				{#if loadError.hint}
					<p class="mt-0.5 text-destructive/90">{loadError.hint}</p>
				{/if}
				<div class="mt-2.5 flex flex-wrap gap-2">
					<button
						class="cursor-pointer rounded-md border border-destructive/40 bg-background px-3 py-1 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
						onclick={() => retryNonce++}
					>
						{m.action_try_again()}
					</button>
					{#if suggestedCity}
						<a
							class="cursor-pointer rounded-md border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
							href={href('/weather/week/[location]', { location: suggestedCity.slug })}
						>
							{m.no_data_try_city({ city: suggestedCity.label })}
						</a>
					{/if}
					{#if params.models?.[0] !== 'best_match'}
						<button
							class="cursor-pointer rounded-md border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
							onclick={resetToBestMatch}
						>
							{m.no_data_best_match()}
						</button>
					{/if}
				</div>
				{#if loadError.detail}
					<details class="mt-2 text-xs text-destructive/70">
						<summary class="cursor-pointer select-none">{m.error_technical_details()}</summary>
						<p class="mt-1 font-mono break-all">{loadError.detail}</p>
					</details>
				{/if}
			</div>
		{/if}

		{#if noData && !loadError}
			<!-- the request succeeded but every value is NaN: the selected (regional)
			     model doesn't cover this location -->
			<div
				class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200"
			>
				<svg
					class="h-4 w-4 shrink-0"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
					/>
				</svg>
				<div class="min-w-0 flex-1">
					<p class="font-semibold">{m.no_data_title()}</p>
					<p class="text-[13px] opacity-90">
						{m.no_data_body({ location: location.name ?? '' })}
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					{#if suggestedCity}
						<a
							class="cursor-pointer rounded-md border border-amber-500/50 bg-background/60 px-3 py-1 text-xs font-semibold transition-colors hover:bg-background"
							href={href('/weather/week/[location]', { location: suggestedCity.slug })}
						>
							{m.no_data_try_city({ city: suggestedCity.label })}
						</a>
					{/if}
					<button
						class="cursor-pointer rounded-md border border-amber-500/50 bg-background/60 px-3 py-1 text-xs font-semibold transition-colors hover:bg-background"
						onclick={resetToBestMatch}
					>
						{m.no_data_best_match()}
					</button>
				</div>
			</div>
		{/if}

		<!-- The sticky day strip, the hourly table AND the meteograms share this
		     wrapper, so the strip stays stuck for the entire page: the full day
		     cards collapse into the compact strip as it sticks (on md+ the bar
		     docks under the topbar at its exact height). timeline-scope hoists
		     the strip's sentinel view-timeline so the sticky strip (a sibling of
		     the sentinel) can scrub its collapse from it. -->
		<div style="timeline-scope: --daystrip-sentinel">
			<!-- rendered even before the data lands: the strip's box is a fixed
			     height, so keeping it mounted reserves its space (it shows skeleton
			     tiles meanwhile) instead of shoving the page down on arrival -->
			<DailyStripSticky
				daily={fetchedDaily}
				{selectedDay}
				units={params}
				onSelectDay={switchDay}
				canExtend={forecastDays < 15}
				onExtend={() => (forecastDays = 15)}
				canExtendPast={pastDays < 3}
				onExtendPast={() => (pastDays = 3)}
				{locationRoute}
			/>

			<!-- On a phone the useful answer comes before the expert data table: the
			     selected day's written summary and warnings are immediately glanceable.
			     Desktop keeps the same order for a consistent reading flow. -->
			<div class="relative">
				{#if fetchedHourly && fetchedDaily}
					<div class="day-region-summary" use:daySwap={selectedDayKey}>
						<DaySummary data={fetchedHourly} daily={fetchedDaily} {selectedDay} units={params} />
					</div>
				{:else}
					<!-- Same footprint as the written forecast, so it doesn't shove the
				     hourly table down when it arrives. -->
					<section class="mt-3 md:mt-6" in:fade={{ duration: 200 }} out:skeletonOut>
						<div
							class="h-102.5 animate-pulse rounded-2xl border border-border/70 bg-card sm:h-91 md:h-85 lg:h-62"
						></div>
					</section>
				{/if}
			</div>

			<button
				type="button"
				class="mt-4 flex min-h-12 w-full cursor-pointer items-center justify-between rounded-xl border border-border bg-card px-4 text-left text-sm font-bold shadow-sm active:bg-muted md:hidden"
				onclick={() => (hourlyDetailsOpen = !hourlyDetailsOpen)}
				aria-expanded={hourlyDetailsOpen}
			>
				<span class="flex items-center gap-2.5">
					<svg
						class="h-5 w-5 text-primary"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="1.75"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="9" />
						<path stroke-linecap="round" d="M12 7v5l3 2" />
					</svg>
					{m.mobile_hourly_details()}
				</span>
				<svg
					class="h-4 w-4 text-muted-foreground transition-transform {hourlyDetailsOpen
						? 'rotate-180'
						: ''}"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					stroke-width="2"
					aria-hidden="true"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" />
				</svg>
			</button>

			<!-- The analytical table is available on demand on phones and remains
			     permanently visible from md upwards. -->
			<div class={hourlyDetailsOpen ? 'block' : 'hidden md:block'}>
				<!-- `relative` lets the placeholder fade out on top of the table instead
				     of holding a second slot in the layout (see skeletonOut). -->
				<div class="relative">
					{#if fetchedHourly && fetchedDaily}
						<div class="day-region-table" use:daySwap={selectedDayKey}>
							<HourlyTable
								data={fetchedHourly}
								daily={fetchedDaily}
								{selectedDay}
								units={params}
								locationName={location.name ?? ''}
								onCustomize={() => (variableSidebarOpen = true)}
							/>
						</div>
					{:else}
						<!-- Mirrors the real table: same header bar and the same body height,
					     so the heading doesn't pop in and nothing below moves. -->
						<div
							in:fade={{ duration: 200 }}
							out:skeletonOut
							class="-mx-3 overflow-hidden border-y border-border/70 bg-card shadow-sm md:mx-0 md:rounded-2xl md:border"
						>
							<div
								class="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/40 px-4 py-2.5"
							>
								<div class="h-6 w-44 animate-pulse rounded bg-muted"></div>
								<div class="flex items-center gap-2">
									<div class="h-8 w-24 animate-pulse rounded-lg bg-muted"></div>
									<div class="h-8 w-20 animate-pulse rounded-lg bg-muted"></div>
								</div>
							</div>
							<!-- one placeholder per row the real table will render, so the body
					     reads as a loading table rather than a blank panel -->
							<div class="divide-y divide-border/50">
								<!-- the time + daylight row, which is taller than the variable rows -->
								<div class="flex items-center gap-4 px-4" style="height: {TABLE_TIME_ROW_PX}px">
									<div class="h-3.5 w-14 shrink-0 animate-pulse rounded bg-muted"></div>
									<div class="h-5 flex-1 animate-pulse rounded bg-muted/70"></div>
								</div>
								{#each { length: enabledTableRows } as _, i (i)}
									<div class="flex items-center gap-4 px-4" style="height: {tableRowPx}px">
										<div class="h-3.5 w-14 shrink-0 animate-pulse rounded bg-muted"></div>
										<div class="h-3.5 flex-1 animate-pulse rounded bg-muted/70"></div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<button
				type="button"
				class="mt-3 flex min-h-12 w-full cursor-pointer items-center justify-between rounded-xl border border-border bg-card px-4 text-left text-sm font-bold shadow-sm active:bg-muted md:hidden"
				onclick={() => (chartsOpen = !chartsOpen)}
				aria-expanded={chartsOpen}
			>
				<span class="flex items-center gap-2.5">
					<svg
						class="h-5 w-5 text-primary"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="1.75"
						aria-hidden="true"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M4 19V9m5 10V5m5 14v-7m5 7V3" />
					</svg>
					{m.meteograms_heading()}
				</span>
				<svg
					class="h-4 w-4 text-muted-foreground transition-transform {chartsOpen
						? 'rotate-180'
						: ''}"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					stroke-width="2"
					aria-hidden="true"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" />
				</svg>
			</button>

			<div class={chartsOpen ? 'block' : 'hidden md:block'}>
				<div class="relative">
					{#if fetchedHourly}
						<div class="day-region-charts" use:daySwap={selectedDayKey}>
							<MeteogramCharts
								data={fetchedHourly}
								{selectedDay}
								units={params}
								{loading}
								{chartHeight}
							/>
						</div>
					{:else}
						<!-- reserve the exact chart area height before the first fetch resolves,
					     header row included -->
						<section class="mt-8" in:fade={{ duration: 200 }} out:skeletonOut>
							<!-- The real header wraps to two rows until the controls fit beside
					     the title, which happens at different widths than you would
					     expect because the sidebar takes its share from md up. These
					     min-heights follow the measured wrap points; below md the
					     customise/PNG pair always sits on its own row (a forced break
					     in MeteogramCharts), so the header is three rows there. -->
							<div
								class="mb-3 flex min-h-27 flex-wrap items-center justify-between gap-2 lg:min-h-16.5 xl:min-h-7.5"
							>
								<div class="h-7 w-52 animate-pulse rounded bg-muted"></div>
								<div class="flex items-center gap-3">
									<div class="h-7 w-56 animate-pulse rounded-lg bg-muted"></div>
									<div class="h-7 w-24 animate-pulse rounded-lg bg-muted"></div>
								</div>
							</div>
							<!-- The reserved box is the plot plus each chart's own chrome (see
					     chartSlotHeight), or everything below it lands too high. -->
							<ChartContainer
								loading
								chartCount={enabledChartCount || 1}
								chartHeight={chartSlotHeight}
							/>
						</section>
					{/if}
				</div>
			</div>

			{#if selectedDayKey}
				<NearbyCities
					latitude={location.latitude}
					longitude={location.longitude}
					population={location.population}
					countryCode={location.country_code}
					{selectedDayKey}
					units={$storedUnits}
				/>
			{/if}
		</div>
	</div>
</div>
