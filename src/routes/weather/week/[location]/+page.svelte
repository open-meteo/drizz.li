<script lang="ts">
	import { onMount } from 'svelte';
	import { MediaQuery, SvelteDate } from 'svelte/reactivity';
	import { get } from 'svelte/store';

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
	import { syncSearchParams, unlessDefault } from '$lib/utils/url-state';

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
	import WeekSkeleton from './WeekSkeleton.svelte';
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

	// Meteogram canvases are shorter on phones, where a 300px plot eats most of
	// the viewport. WeekSkeleton reads the same query, so the space it reserves
	// still matches exactly.
	const narrowViewport = new MediaQuery('max-width: 767px');
	let chartHeight = $derived(narrowViewport.current ? 215 : 300);

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

	/**
	 * Everything the forecast request is made of, as one comparable string.
	 *
	 * The effect below depends on this key and on nothing else, which is what
	 * makes the request predictable: it changes when the range buttons, the
	 * model, the units, the variables or the location change, and at no other
	 * time. Depending on the values directly meant depending on their identity -
	 * `hourlyVars` is rebuilt whenever any preference is touched - so turning a
	 * table row off used to re-request the exact same ten variables it already
	 * had. The variable list is sorted for the same reason: reordering the chart
	 * panels changes the array without changing the request.
	 */
	let requestKey = $derived.by(() => {
		const loc = location;
		const model = params.models?.[0];
		if (!mounted || !loc || !model) return '';

		return JSON.stringify({
			latitude: loc.latitude!,
			longitude: loc.longitude!,
			timezone: loc.timezone,
			model,
			hourly: [...hourlyVars].sort(),
			temperature_unit: params.temperature_unit,
			wind_speed_unit: params.wind_speed_unit,
			precipitation_unit: params.precipitation_unit,
			forecast_days: forecastDays,
			past_days: pastDays,
			// part of the key, so "Try again" always counts as a different request
			retry: retryNonce
		});
	});

	type WeekRequest = ReturnType<typeof parseRequest>;
	const parseRequest = (key: string) =>
		JSON.parse(key) as {
			latitude: number;
			longitude: number;
			timezone: string | undefined;
			model: string;
			hourly: string[];
			temperature_unit: string;
			wind_speed_unit: string;
			precipitation_unit: string;
			forecast_days: number;
			past_days: number;
			retry: number;
		};

	/**
	 * What the last response covers. Plain fields, not state: only the effect
	 * reads them, and they must not feed back into it.
	 */
	let held: { scope: string; hourly: string[]; forecastDays: number; pastDays: number } | null =
		null;

	/** The parts of a request that invalidate everything held when they change. */
	const scopeOf = (req: WeekRequest) =>
		JSON.stringify([
			req.latitude,
			req.longitude,
			req.timezone,
			req.model,
			req.temperature_unit,
			req.wind_speed_unit,
			req.precipitation_unit,
			req.retry
		]);

	/**
	 * Whether the data on screen already answers this request. This is where
	 * "only fetch what is missing" lives: not in stitching partial responses
	 * together, but in not asking when nothing is missing. A narrower range or a
	 * variable that was in the last response - toggled off and back on, say - is
	 * served from what is in hand; only a wider range or a variable that was
	 * never fetched costs a round trip.
	 */
	const alreadyHeld = (req: WeekRequest): boolean =>
		held !== null &&
		held.scope === scopeOf(req) &&
		req.forecast_days <= held.forecastDays &&
		req.past_days <= held.pastDays &&
		req.hourly.every((name) => held!.hourly.includes(name));

	$effect(() => {
		const key = requestKey;
		if (!key) return;
		// read back out of the key, so the effect tracks the key and nothing else
		const req = parseRequest(key);

		if (alreadyHeld(req)) return;

		// versioned so a slow stale response can never overwrite a newer one
		const version = ++requestVersion;
		loading = true;
		loadError = null;

		fetchWeekForecast({
			latitude: req.latitude,
			longitude: req.longitude,
			model: req.model,
			hourlyVariables: req.hourly,
			temperature_unit: req.temperature_unit as 'celsius' | 'fahrenheit',
			wind_speed_unit: req.wind_speed_unit as 'kmh' | 'ms' | 'mph' | 'kn',
			precipitation_unit: req.precipitation_unit as 'mm' | 'inch',
			forecast_days: req.forecast_days,
			past_days: req.past_days,
			timezone: req.timezone
		})
			.then((result: WeekForecastResult) => {
				if (version !== requestVersion) return;

				held = {
					scope: scopeOf(req),
					hourly: req.hourly,
					forecastDays: req.forecast_days,
					pastDays: req.past_days
				};

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

			<!-- `relative` is what lets the placeholder fade out on top of the table
			     instead of holding a second slot in the layout (see skeletonOut). -->
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
					<WeekSkeleton part="table" />
				{/if}
			</div>

			<div class="relative">
				{#if fetchedHourly && fetchedDaily}
					<div class="day-region-summary" use:daySwap={selectedDayKey}>
						<DaySummary data={fetchedHourly} daily={fetchedDaily} {selectedDay} units={params} />
					</div>
				{:else}
					<WeekSkeleton part="summary" />
				{/if}
			</div>

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
					<WeekSkeleton part="charts" />
				{/if}
			</div>

			{#if selectedDayKey}
				<NearbyCities
					latitude={location.latitude}
					longitude={location.longitude}
					population={location.population}
					countryCode={location.country_code}
					{selectedDayKey}
					units={$storedUnits}
					{forecastDays}
					{pastDays}
				/>
			{/if}
		</div>
	</div>
</div>
