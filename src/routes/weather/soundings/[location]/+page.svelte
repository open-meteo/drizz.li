<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { get } from 'svelte/store';

	import { fromZonedTime } from 'date-fns-tz';

	import { page } from '$app/stores';

	import { reportPageReady } from '$lib/stores/page-transition.svelte';
	import { setActiveLocation, storedModel, storedUnits } from '$lib/stores/settings';

	import { formatZoned } from '$lib/utils/date';
	import { syncSearchParams } from '$lib/utils/url-state';

	import { ChartToolbar } from '$lib/components/charts';
	import SoundingChart from '$lib/components/charts/SoundingChart.svelte';

	import { href } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { fetchSoundingForecast, humanizeWeatherError } from '$lib/services/weather';
	import {
		SOUNDING_MODELS,
		SOUNDING_PAST_DAYS,
		TOP_PRESSURES,
		soundingModel,
		soundingModelGroups
	} from '$lib/soundings/models';
	import { addDays, isPlottable } from '$lib/soundings/profile';
	import { TRACE_COLORS } from '$lib/soundings/renderer';
	import { soundingHours } from '$lib/soundings/time';

	import { useHeroActions } from '../../hero.svelte';
	import { findModel, inDomainCity } from '../../options';
	import ModelSelector from '../../week/[location]/ModelSelector.svelte';

	import type { FriendlyWeatherError } from '$lib/services/weather';
	import type { SoundingForecastResult, SoundingProfile } from '$lib/soundings/profile';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let location = $derived(data.location);
	let mounted = $state(false);
	let model = $state('best_match');
	let day = $state('');
	let topPressure = $state(100);
	let preferredClock = '12:00';
	let requestedTime: number | null = null;
	let selectedTime = $state<number | null>(null);
	let result = $state<SoundingForecastResult | null>(null);
	let loading = $state(true);
	let error = $state<FriendlyWeatherError | null>(null);
	let adjusted = $state(false);
	let retry = $state(0);
	let chart: SoundingChart | undefined = $state();
	let requestVersion = 0;
	let observedRoute = '';
	let cacheScope = '';
	let days: Record<string, SoundingForecastResult> = {};
	let now = $state(Date.now());
	let today = $derived(formatZoned(new Date(now), location.timezone, 'yyyy-MM-dd'));
	let firstDay = $derived(addDays(today, -SOUNDING_PAST_DAYS));
	let lastDay = $derived(addDays(today, SOUNDING_MODELS[model].forecastDays - 1));
	let profiles = $derived(result?.profiles.filter((profile) => isPlottable(profile)) ?? []);
	let profile = $derived(profiles.find((item) => item.time === selectedTime) ?? null);
	let hourIndex = $derived(
		Math.max(
			0,
			profiles.findIndex((item) => item.time === selectedTime)
		)
	);
	let visibleDays = $derived(
		Array.from({ length: SOUNDING_PAST_DAYS + SOUNDING_MODELS[model].forecastDays }, (_, i) =>
			addDays(firstDay, i)
		)
	);
	let hours = $derived.by(() => {
		if (!day) return [];
		const times = soundingHours(day, location.timezone);
		return times.map((time) => {
			const clock = formatZoned(new Date(time), location.timezone, 'HH');
			return {
				time,
				index: profiles.findIndex((item) => item.time === time),
				repeated: times.some(
					(other) =>
						other !== time && formatZoned(new Date(other), location.timezone, 'HH') === clock
				)
			};
		});
	});
	let timezone = $derived(result?.timezone ?? location.timezone);
	let modelLabel = $derived(findModel(model)?.label ?? model);
	let combined = $derived(model === 'best_match' || model.endsWith('_seamless'));
	let suggestedCity = $derived(inDomainCity(model));
	let title = $derived(
		`${m.sounding_title()} · ${location.name} · ${modelLabel}${profile ? ` · ${formatZoned(new Date(profile.time), timezone, 'yyyy-MM-dd HH:mm zzz')}` : ''}`
	);
	let exportLegend = $derived([
		{ name: m.var_temperature(), color: TRACE_COLORS.temperature },
		{ name: m.var_dew_point(), color: TRACE_COLORS.dewpoint },
		{ name: m.sounding_dry(), color: TRACE_COLORS.dry, style: 'dashed' as const },
		{ name: m.sounding_moist(), color: TRACE_COLORS.moist },
		{ name: m.sounding_mixing(), color: TRACE_COLORS.mixing, style: 'dashed' as const }
	]);

	useHeroActions(heroActions);
	reportPageReady(() => mounted && !loading);
	$effect(() => setActiveLocation(location));
	onMount(() => {
		mounted = true;
		const timer = window.setInterval(() => {
			now = Date.now();
		}, 60_000);
		return () => {
			window.clearInterval(timer);
			requestVersion++;
		};
	});

	function readUrl(url: URL) {
		const chosenModel = url.searchParams.get('model') ?? get(storedModel);
		model = soundingModel(chosenModel);
		adjusted = chosenModel !== model;
		const rawTime = url.searchParams.get('time');
		const parsed = rawTime ? Date.parse(rawTime) : NaN;
		requestedTime = Number.isFinite(parsed) ? parsed : null;
		if (rawTime && requestedTime === null) adjusted = true;
		const instant = new Date(requestedTime ?? Date.now());
		const desiredDay = formatZoned(instant, location.timezone, 'yyyy-MM-dd');
		day = boundDay(desiredDay);
		if (day !== desiredDay) {
			adjusted = true;
			requestedTime = null;
		}
		preferredClock = formatZoned(instant, location.timezone, 'HH:mm');
		const top = Number(url.searchParams.get('top'));
		topPressure = TOP_PRESSURES.some((p) => p === top) ? top : 100;
	}

	$effect(() => {
		const url = $page.url;
		const loc = location;
		if (mounted && loc)
			untrack(() => {
				// Shallow URL writes republish the page store with its previous URL.
				// Only an actual route change should restore state from that URL.
				const route = `${url.href}|${loc.latitude},${loc.longitude},${loc.timezone}`;
				if (route === observedRoute) return;
				observedRoute = route;
				readUrl(url);
			});
	});

	$effect(() => {
		void today;
		if (mounted && day) {
			const bounded = boundDay(day);
			if (bounded !== day) {
				day = bounded;
				requestedTime = null;
				adjusted = true;
			}
		}
	});

	const requestKey = $derived(
		mounted && day
			? JSON.stringify({
					latitude: location.latitude,
					longitude: location.longitude,
					timezone: location.timezone,
					model,
					date: day,
					retry
				})
			: ''
	);

	function selectResult(next: SoundingForecastResult) {
		result = next;
		const usable = next.profiles.filter((item) => isPlottable(item));
		const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
		const exact =
			requestedTime === null ? undefined : usable.find((item) => item.time === requestedTime);
		const target = minutes(preferredClock);
		const nearest = usable.reduce<SoundingProfile | undefined>((best, item) => {
			const distance = (entry: SoundingProfile) =>
				Math.abs(minutes(formatZoned(new Date(entry.time), next.timezone, 'HH:mm')) - target);
			return !best || distance(item) < distance(best) ? item : best;
		}, undefined);
		selectedTime = (exact ?? nearest)?.time ?? null;
		if (requestedTime !== null && selectedTime !== requestedTime && usable.length) adjusted = true;
		requestedTime = null;
		if (selectedTime !== null)
			preferredClock = formatZoned(new Date(selectedTime), next.timezone, 'HH:mm');
		loading = false;
	}

	$effect(() => {
		const key = requestKey;
		if (!key) return;
		const req = JSON.parse(key) as {
			latitude: number;
			longitude: number;
			timezone: string;
			model: string;
			date: string;
			retry: number;
		};
		const scope = JSON.stringify([req.latitude, req.longitude, req.timezone, req.model]);
		if (scope !== cacheScope) {
			cacheScope = scope;
			days = {};
		}
		const version = ++requestVersion;
		loading = true;
		error = null;
		result = null;
		selectedTime = null;
		const cached = days[req.date];
		if (cached) {
			untrack(() => selectResult(cached));
			return;
		}
		fetchSoundingForecast(req)
			.then((next) => {
				if (version !== requestVersion) return;
				days[req.date] = next;
				selectResult(next);
			})
			.catch((cause: unknown) => {
				if (version !== requestVersion) return;
				error = humanizeWeatherError(cause);
				loading = false;
			});
	});

	$effect(() => {
		if (!mounted || loading || !day) return;
		const time =
			selectedTime ?? fromZonedTime(`${day}T${preferredClock}:00`, location.timezone).getTime();
		syncSearchParams({
			model,
			time: new Date(time).toISOString(),
			top: topPressure === 100 ? null : String(topPressure)
		});
	});

	function boundDay(value: string) {
		// Compute directly: readUrl can change the model before a derived bound updates.
		const last = addDays(today, SOUNDING_MODELS[model].forecastDays - 1);
		return value < firstDay ? firstDay : value > last ? last : value;
	}
	function changeDay(next: string) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
		day = boundDay(next);
		requestedTime = null;
		adjusted = next !== day;
	}
	function changeModel(next: string) {
		model = soundingModel(next);
		storedModel.set(model);
		const bounded = boundDay(day);
		adjusted = bounded !== day;
		day = bounded;
		requestedTime = null;
	}
	function changeHour(index: number) {
		const next = profiles[index];
		if (!next) return;
		selectedTime = next.time;
		preferredClock = formatZoned(new Date(next.time), timezone, 'HH:mm');
		adjusted = false;
	}
	function stepHour(direction: number) {
		if (loading) return;
		const next = hourIndex + direction;
		if (next >= 0 && next < profiles.length) {
			changeHour(next);
			return;
		}
		const nextDay = addDays(day, direction);
		if (nextDay < firstDay || nextDay > lastDay) return;
		preferredClock = direction > 0 ? '00:00' : '23:59';
		changeDay(nextDay);
	}
	function hourKeydown(event: KeyboardEvent) {
		if (
			event.defaultPrevented ||
			event.isComposing ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.shiftKey ||
			!['ArrowLeft', 'ArrowRight'].includes(event.key)
		)
			return;
		if (
			event
				.composedPath()
				.some(
					(target) =>
						target instanceof Element &&
						target.matches(
							'input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="menu"], [role="listbox"], [role="combobox"], [role="slider"]'
						)
				)
		)
			return;
		event.preventDefault();
		stepHour(event.key === 'ArrowLeft' ? -1 : 1);
	}

	function revealSelected(node: HTMLButtonElement, selected: boolean) {
		const center = () => {
			const parent = node.parentElement;
			if (parent) parent.scrollLeft = node.offsetLeft - (parent.clientWidth - node.clientWidth) / 2;
		};
		// Observe only the selected button's strip, including desktop/mobile resizes.
		const observer = new ResizeObserver(center);
		const update = (active: boolean) => {
			observer.disconnect();
			if (active && node.parentElement) {
				observer.observe(node.parentElement);
				center();
			}
		};
		update(selected);
		return { update, destroy: () => observer.disconnect() };
	}

	function retryDay() {
		delete days[day];
		retry++;
	}
</script>

<svelte:head
	><title>{title} · drizz.li</title><meta
		name="description"
		content={m.sounding_description()}
	/></svelte:head
>

{#snippet heroActions()}<ModelSelector
		selectedModel={model}
		onModelChange={changeModel}
		groups={soundingModelGroups}
	/>{/snippet}

<svelte:window onkeydown={hourKeydown} />

<section
	class="w-full min-w-0 space-y-3"
	aria-keyshortcuts="ArrowLeft ArrowRight"
	aria-label={m.sounding_title()}
>
	<div class="space-y-1">
		<div class="flex items-center gap-2">
			<div class="time-strip" role="group" aria-label={m.sounding_day()}>
				{#each visibleDays as date (date)}
					{@const instant = fromZonedTime(`${date}T12:00:00`, location.timezone)}
					<button
						use:revealSelected={day === date}
						class="day-button"
						class:chosen={day === date}
						aria-pressed={day === date}
						aria-label={formatZoned(instant, location.timezone, 'EEE d MMM yyyy')}
						onclick={() => changeDay(date)}
					>
						<span class="text-xs">{formatZoned(instant, location.timezone, 'EEE')}</span>
						<span class="text-sm font-semibold"
							>{formatZoned(
								instant,
								location.timezone,
								date.slice(0, 4) === today.slice(0, 4) ? 'd MMM' : 'd MMM yyyy'
							)}</span
						>
					</button>
				{/each}
			</div>
			<button
				class="shrink-0 rounded-md px-3 py-2 text-xs text-muted-foreground"
				onclick={() => changeDay(today)}
				disabled={day === today}>{m.day_today()}</button
			>
		</div>
		{#if profile && !loading}
			<div class="flex w-full min-w-0 items-center gap-1">
				<button
					class="time-arrow"
					disabled={hourIndex === 0 && day <= firstDay}
					onclick={() => stepHour(-1)}
					aria-label={m.sounding_previous_hour()}>‹</button
				>

				<div class="time-strip" role="group" aria-label={m.sounding_hour()}>
					{#each hours as hour (hour.time)}
						<button
							use:revealSelected={selectedTime === hour.time}
							class="hour-button"
							class:chosen={selectedTime === hour.time}
							aria-pressed={selectedTime === hour.time}
							aria-label={formatZoned(new Date(hour.time), timezone, 'HH:mm zzz')}
							title={hour.index < 0
								? m.sounding_empty()
								: formatZoned(new Date(hour.time), timezone, 'HH:mm zzz')}
							disabled={hour.index < 0}
							onclick={() => changeHour(hour.index)}
						>
							{formatZoned(new Date(hour.time), timezone, 'HH')}
							{#if hour.repeated}<span class="block text-[9px]"
									>{formatZoned(new Date(hour.time), timezone, 'zzz')}</span
								>{/if}
						</button>
					{/each}
				</div>
				<button
					class="time-arrow"
					disabled={hourIndex === profiles.length - 1 && day >= lastDay}
					onclick={() => stepHour(1)}
					aria-label={m.sounding_next_hour()}>›</button
				>
				<span class="shrink-0 pl-1 text-xs text-muted-foreground" title={timezone}
					>{formatZoned(new Date(profile.time), timezone, 'zzz')}</span
				>
			</div>
			<p class="sr-only" aria-live="polite">
				{formatZoned(new Date(profile.time), timezone, 'EEE d MMM yyyy · HH:mm zzz')}
			</p>
		{/if}
	</div>
	{#if combined}<p class="text-xs text-muted-foreground">{m.sounding_combined()}</p>{/if}
	{#if adjusted}<p role="status" class="text-sm text-muted-foreground">
			{m.sounding_adjusted()}
		</p>{/if}
	{#if loading}
		<div
			role="status"
			class="flex min-h-120 items-center justify-center rounded-xl bg-muted/30 text-muted-foreground"
		>
			{m.charts_loading()}
		</div>
	{:else if error || !profile}
		<div role="status" class="rounded-xl border border-border bg-card p-6">
			<h2 class="font-semibold">{error?.title ?? m.sounding_empty()}</h2>
			<p class="mt-2 text-sm text-muted-foreground">{error?.hint ?? m.sounding_empty_hint()}</p>
			<div class="mt-4 flex flex-wrap gap-3">
				<button class="rounded-md border border-border px-3 py-2 text-sm" onclick={retryDay}
					>{m.sounding_retry()}</button
				>
				{#if model !== 'best_match'}<button
						class="rounded-md border border-border px-3 py-2 text-sm"
						onclick={() => changeModel('best_match')}>{m.no_data_best_match()}</button
					>{/if}
				{#if suggestedCity}<a
						class="rounded-md border border-border px-3 py-2 text-sm"
						href={`${href('/weather/soundings/[location]', { location: suggestedCity.slug })}?model=${model}`}
						>{m.no_data_try_city({ city: suggestedCity.label })}</a
					>{/if}
			</div>
			{#if error?.detail}<details class="mt-3 text-xs text-muted-foreground">
					<summary>{m.error_technical_details()}</summary>
					<p class="mt-2 break-words">{error.detail}</p>
				</details>{/if}
		</div>
	{:else}
		<div>
			<div class="flex items-center justify-between gap-2">
				<p class="min-w-0 flex-1 text-xs text-muted-foreground">
					{#if Number.isFinite(result?.elevation)}{m.sounding_elevation({
							elevation: String(Math.round(result!.elevation))
						})}{/if}
				</p>

				<ChartToolbar
					charts={[chart]}
					fileName={`drizzli-sounding-${day}`}
					exportOptions={{ title, legend: exportLegend }}
					class="!flex-row !gap-0"
				/>
			</div>
			<SoundingChart
				bind:this={chart}
				{profile}
				dayProfiles={profiles}
				elevation={result!.elevation}
				bind:topPressure
				units={$storedUnits}
			/>
		</div>
	{/if}
</section>

<style>
	.time-strip {
		position: relative;
		display: flex;
		flex: 1;
		min-width: 0;
		gap: 0.25rem;
		padding-block: 0.25rem;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.time-arrow {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 0.5rem;
		font-size: 1.5rem;
		color: var(--muted-foreground);
	}
	.day-button {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.125rem;
		flex-shrink: 0;
		min-width: 4rem;
		min-height: 3rem;
		padding: 0.375rem 0.5rem;
		border-radius: 0.5rem;
		color: var(--muted-foreground);
	}
	.hour-button {
		flex: 1 0 2.75rem;
		min-height: 2.75rem;
		border-radius: 0.375rem;
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
		color: var(--muted-foreground);
		background: var(--muted);
	}
	button {
		cursor: pointer;
	}
	button:hover:not(:disabled):not(.chosen) {
		background: var(--muted);
		color: var(--foreground);
	}
	button:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	button.chosen {
		background: var(--primary);
		color: var(--primary-foreground);
	}
	button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.hour-button:disabled {
		background: transparent;
		text-decoration: line-through;
	}
</style>
