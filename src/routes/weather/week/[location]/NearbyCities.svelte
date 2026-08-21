<script lang="ts">
	import { fade } from 'svelte/transition';

	import { storedNearbyOpen } from '$lib/stores/settings';

	import { buildLocationRoute } from '$lib/utils/location';
	import { skeletonOut } from '$lib/utils/skeleton-fade';
	import { warmWeatherIcon, weatherIconHref, weatherIconReady } from '$lib/utils/weather-icon';

	import { href } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { type NearbyCity, findNearbyCities } from '$lib/services/nearby-cities';
	import { type NearbyDaily, fetchNearbyDaily } from '$lib/services/weather';

	import { getWeatherDescription, getWeatherIconName } from '../../utils/weather-codes';

	import type { UnitPrefs } from '$lib/stores/settings';

	interface Props {
		latitude: number;
		longitude: number;
		/** of the location itself: sets how far out counts as "still here" */
		population: number | undefined;
		/** of the location itself: only foreign countries are worth naming */
		countryCode: string | undefined;
		/** "yyyy-MM-dd" of the day the rest of the page is showing */
		selectedDayKey: string;
		units: UnitPrefs;
		/** the page's own range, so this list covers the strip and no more */
		forecastDays: number;
		pastDays: number;
	}

	let {
		latitude,
		longitude,
		population,
		countryCode,
		selectedDayKey,
		units,
		forecastDays,
		pastDays
	}: Props = $props();

	const COUNT = 10;

	let cities = $state<NearbyCity[]>([]);
	let daily = $state<(NearbyDaily | null)[]>([]);
	let failed = $state(false);
	/** false until the list for the current location has been resolved either way */
	let listed = $state(false);

	// Country names come free and localized from the platform; the flag images
	// are the same set the header uses.
	let countryNames = $derived(new Intl.DisplayNames([getLocale()], { type: 'region' }));
	const countryName = (code: string) => {
		try {
			return countryNames.of(code) ?? code;
		} catch {
			return code;
		}
	};

	// ── Fetching ──────────────────────────────────────────────────────────────
	// Two steps, kept apart on purpose. Which cities to show depends only on
	// where we are; their readings depend on the units and the range as well. A
	// widened forecast therefore refreshes the numbers without taking the rows
	// off screen, and a day click touches neither.
	//
	// Nothing here runs while the panel is closed - not the city tile, not the
	// ten-location request. That is the point of remembering the closed state.

	/** What the snapshots in hand cover. Plain fields: only the effect reads them. */
	let heldUnits = '';
	let heldForecastDays = 0;
	let heldPastDays = 0;

	$effect(() => {
		if (!$storedNearbyOpen) return;

		const lat = latitude;
		const lon = longitude;
		const pop = population ?? 0;
		let cancelled = false;

		cities = [];
		daily = [];
		failed = false;
		listed = false;
		heldUnits = '';
		heldForecastDays = 0;
		heldPastDays = 0;

		(async () => {
			try {
				const found = await findNearbyCities(lat, lon, COUNT, pop);
				if (cancelled) return;
				cities = found;
			} catch {
				if (!cancelled) failed = true;
			} finally {
				if (!cancelled) listed = true;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (!$storedNearbyOpen) return;

		const points = cities;
		if (points.length === 0) return;

		const unitPrefs = { ...units };
		const unitKey = JSON.stringify(unitPrefs);
		const wantForecast = forecastDays;
		const wantPast = pastDays;

		// Already answered. Clicking through the days reads the snapshots in hand,
		// and so does a range that narrows - a model switch resets the page to
		// seven days, which is a subset of what a widened list already holds.
		if (unitKey === heldUnits && wantForecast <= heldForecastDays && wantPast <= heldPastDays) {
			return;
		}

		let cancelled = false;

		(async () => {
			try {
				const snapshots = await fetchNearbyDaily({
					points,
					...unitPrefs,
					forecast_days: wantForecast,
					past_days: wantPast
				});
				if (cancelled) return;
				// deliberately not cleared beforehand: the old readings stay up until
				// the new ones land, so widening the range does not blank the rows
				daily = snapshots;
				heldUnits = unitKey;
				heldForecastDays = wantForecast;
				heldPastDays = wantPast;
			} catch {
				if (!cancelled) failed = true;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	const dayFor = (index: number) => daily[index]?.byDate[selectedDayKey];

	const iconFor = (index: number) => {
		const day = dayFor(index);
		return day ? getWeatherIconName(day.weatherCode, true) : '';
	};

	// The pictogram files are fetched per condition, so a day of weather nobody
	// has looked at yet arrives one response at a time. Warm them here and let
	// each cell hold a placeholder until its own file is in.
	let iconNames = $derived(cities.map((_, i) => iconFor(i)).filter(Boolean));
	$effect(() => {
		for (const name of iconNames) warmWeatherIcon(name);
	});

	const temp = (value: number | undefined) =>
		value == null || !Number.isFinite(value) ? '–' : `${Math.round(value)}°`;

	const distance = (km: number) =>
		units.wind_speed_unit === 'mph' ? `${Math.round(km * 0.621371)} mi` : `${Math.round(km)} km`;

	const toggle = () => storedNearbyOpen.set(!$storedNearbyOpen);

	// Closed, the panel is just its own header - which has to stay, or there is
	// no way back. Open, it keeps the old rule: a place with no cities around it
	// (an ocean tile) or a lookup that failed shows nothing rather than an empty
	// frame.
	let hasContent = $derived(!failed && (!listed || cities.length > 0));
</script>

{#if !$storedNearbyOpen || hasContent}
	<section class="mt-8">
		<div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
			<h2 class="text-lg font-semibold">
				<button
					type="button"
					class="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-primary"
					onclick={toggle}
					aria-expanded={$storedNearbyOpen}
					aria-controls="nearby-cities-panel"
					title={m.nearby_cities_toggle()}
				>
					{m.nearby_cities_title()}
					<svg
						class="h-4 w-4 text-muted-foreground transition-transform duration-200"
						class:-rotate-90={!$storedNearbyOpen}
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="2.5"
						aria-hidden="true"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
					</svg>
				</button>
			</h2>
			<!-- closed, the same line says why there is nothing here: the panel is not
			     merely hidden, it is the one thing on the page that is never fetched -->
			<p class="text-xs text-muted-foreground">
				{$storedNearbyOpen ? m.nearby_cities_subtitle() : m.nearby_cities_collapsed()}
			</p>
		</div>

		{#if $storedNearbyOpen}
			<div
				id="nearby-cities-panel"
				class="-mx-3 grid grid-cols-2 gap-px overflow-hidden border-y border-border/70 bg-border/70 shadow-sm sm:grid-cols-3 md:mx-0 md:rounded-2xl md:border lg:grid-cols-5"
			>
				{#if cities.length > 0}
					{#each cities as city, i (city.id)}
						{@const day = dayFor(i)}
						{@const icon = iconFor(i)}
						<a
							href={href('/weather/week/[location]', {
								location: buildLocationRoute({
									id: city.id,
									name: city.name,
									latitude: city.latitude,
									longitude: city.longitude,
									population: city.population,
									feature_code: 'PPL'
								})
							})}
							class="group flex items-center gap-2 bg-card px-3 py-2.5 transition-colors hover:bg-muted/60"
							title="{city.name}, {countryName(city.countryCode)}"
						>
							<!-- fixed box: the placeholder and the icon are stacked inside it,
							     so the row never resizes as the files arrive -->
							<div class="relative h-8.5 w-8.5 shrink-0">
								{#if day && icon && weatherIconReady(icon)}
									<svg
										class="absolute inset-0 h-full w-full fill-foreground/80"
										in:fade={{ duration: 200 }}
									>
										<title>{getWeatherDescription(day.weatherCode)}</title>
										<use xlink:href={weatherIconHref(icon)}></use>
									</svg>
								{:else}
									<div
										class="absolute inset-0 animate-pulse rounded-full bg-muted"
										out:fade={{ duration: 200 }}
									></div>
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-medium group-hover:underline">{city.name}</div>
								<div class="truncate text-[11px] text-muted-foreground">
									<!-- the country only earns its space when it isn't the one you are in -->
									{distance(city.distanceKm)}{city.countryCode === countryCode
										? ''
										: ` · ${countryName(city.countryCode)}`}
								</div>
							</div>
							<!-- `relative` so the placeholder can dissolve over the readings
							     instead of stacking above them (skeletonOut) -->
							<div class="relative text-right text-sm tabular-nums">
								{#if day}
									<div in:fade={{ duration: 200 }}>
										<div class="font-semibold">{temp(day.max)}</div>
										<div class="text-[11px] text-muted-foreground">{temp(day.min)}</div>
									</div>
								{:else}
									<!-- The readings arrive after the names, and a dash here would read
									     as "no data" rather than "not yet". The hidden sample values are
									     what give the column its width: a measured one would have to be
									     kept in step with the font, and an unset one lets the row shift
									     sideways when the numbers land. -->
									<div out:skeletonOut>
										<div class="relative font-semibold">
											<span class="invisible">20°</span>
											<div
												class="absolute inset-x-0 inset-y-0.5 animate-pulse rounded bg-muted"
											></div>
										</div>
										<div class="relative text-[11px]">
											<span class="invisible">16°</span>
											<div
												class="absolute inset-x-0 inset-y-0.5 animate-pulse rounded bg-muted/70"
											></div>
										</div>
									</div>
								{/if}
							</div>
						</a>
					{/each}
				{:else}
					<!-- Same cell for the same count, so the finished list drops straight
					     into the space the placeholder was already holding. -->
					{#each { length: COUNT } as _, i (i)}
						<div class="flex items-center gap-2 bg-card px-3 py-2.5">
							<div class="h-8.5 w-8.5 shrink-0 animate-pulse rounded-full bg-muted"></div>
							<!-- the bars ride inside the real line boxes (`&nbsp;` holds each one
							     open), so the placeholder row is exactly as tall as the row that
							     replaces it without a measured height to keep in sync -->
							<div class="min-w-0 flex-1">
								<div class="relative text-sm font-medium">
									&nbsp;
									<div
										class="absolute inset-y-0.5 left-0 w-20 animate-pulse rounded bg-muted"
									></div>
								</div>
								<div class="relative text-[11px]">
									&nbsp;
									<div
										class="absolute inset-y-0.5 left-0 w-14 animate-pulse rounded bg-muted/70"
									></div>
								</div>
							</div>
							<div class="text-sm tabular-nums">
								<div class="relative font-semibold">
									<span class="invisible">20°</span>
									<div class="absolute inset-x-0 inset-y-0.5 animate-pulse rounded bg-muted"></div>
								</div>
								<div class="relative text-[11px]">
									<span class="invisible">16°</span>
									<div
										class="absolute inset-x-0 inset-y-0.5 animate-pulse rounded bg-muted/70"
									></div>
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		{/if}
	</section>
{/if}
