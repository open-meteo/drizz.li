<script lang="ts">
	import { fade } from 'svelte/transition';

	import { buildLocationRoute } from '$lib/utils/location';

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
	}

	let { latitude, longitude, population, countryCode, selectedDayKey, units }: Props = $props();

	const COUNT = 10;

	let cities = $state<NearbyCity[]>([]);
	let daily = $state<(NearbyDaily | null)[]>([]);
	let failed = $state(false);

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

	// One request covers the whole strip's date range, so clicking through the
	// days re-reads what is already here instead of refetching ten cities.
	$effect(() => {
		const lat = latitude;
		const lon = longitude;
		const pop = population ?? 0;
		const unitPrefs = { ...units };
		let cancelled = false;

		cities = [];
		daily = [];
		failed = false;

		(async () => {
			try {
				const found = await findNearbyCities(lat, lon, COUNT, pop);
				if (cancelled) return;
				cities = found;

				const snapshots = await fetchNearbyDaily({ points: found, ...unitPrefs });
				if (cancelled) return;
				daily = snapshots;
			} catch {
				if (!cancelled) failed = true;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	const dayFor = (index: number) => daily[index]?.byDate[selectedDayKey];

	const temp = (value: number | undefined) =>
		value == null || !Number.isFinite(value) ? '–' : `${Math.round(value)}°`;

	const distance = (km: number) =>
		units.wind_speed_unit === 'mph' ? `${Math.round(km * 0.621371)} mi` : `${Math.round(km)} km`;
</script>

{#if cities.length > 0 && !failed}
	<section class="mt-8" in:fade={{ duration: 200 }}>
		<div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
			<h2 class="text-lg font-semibold">{m.nearby_cities_title()}</h2>
			<p class="text-xs text-muted-foreground">{m.nearby_cities_subtitle()}</p>
		</div>

		<div
			class="-mx-3 grid grid-cols-2 gap-px overflow-hidden border-y border-border/70 bg-border/70 sm:grid-cols-3 md:mx-0 md:rounded-2xl md:border lg:grid-cols-5"
		>
			{#each cities as city, i (city.id)}
				{@const day = dayFor(i)}
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
					<svg class="shrink-0 fill-foreground/80" width="34px" height="34px">
						{#if day}
							<title>{getWeatherDescription(day.weatherCode)}</title>
							<use
								xlink:href="/images/weather-icons/{getWeatherIconName(
									day.weatherCode,
									true
								)}.svg#Layer_1"
							></use>
						{/if}
					</svg>
					<div class="min-w-0 flex-1">
						<div class="truncate text-sm font-medium group-hover:underline">{city.name}</div>
						<div class="truncate text-[11px] text-muted-foreground">
							<!-- the country only earns its space when it isn't the one you are in -->
							{distance(city.distanceKm)}{city.countryCode === countryCode
								? ''
								: ` · ${countryName(city.countryCode)}`}
						</div>
					</div>
					<div class="text-right text-sm tabular-nums">
						<div class="font-semibold">{temp(day?.max)}</div>
						<div class="text-[11px] text-muted-foreground">{temp(day?.min)}</div>
					</div>
				</a>
			{/each}
		</div>
	</section>
{/if}
