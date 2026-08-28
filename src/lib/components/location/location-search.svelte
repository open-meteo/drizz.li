<script lang="ts">
	import { createEventDispatcher, onDestroy, tick } from 'svelte';

	import {
		type GeoLocation,
		locationKey,
		storedFavoriteLocations,
		storedRecentLocations
	} from '$lib/stores/settings';

	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';

	import * as m from '$lib/paraglide/messages';

	export let label: string = 'Search location...';
	export let placeholder: string = 'Enter city name...';
	export let location: GeoLocation | null = null;
	export let locationDetail: string = '';

	interface ResultSet {
		results: GeoLocation[] | undefined;
	}

	const dispatch = createEventDispatcher();
	let debounceTimeout: ReturnType<typeof setTimeout> | undefined;
	let searchQuery = '';
	let popoverOpen = false;
	let searchInputEl: HTMLInputElement | null = null;

	onDestroy(() => {
		clearTimeout(debounceTimeout);
	});

	const closePopover = () => {
		popoverOpen = false;
	};

	const selectLocation = (location: GeoLocation) => {
		addRecent(location);
		searchQuery = '';
		closePopover();
		dispatch('location', location);
	};

	function addRecent(loc: GeoLocation) {
		const key = locationKey(loc);
		storedRecentLocations.update((list) =>
			[loc, ...list.filter((l) => locationKey(l) !== key)].slice(0, 8)
		);
	}

	/** Drop a single entry from the recent list (favourites are unaffected). */
	function removeRecent(loc: GeoLocation) {
		const key = locationKey(loc);
		storedRecentLocations.update((list) => list.filter((l) => locationKey(l) !== key));
	}

	function toggleFavorite(loc: GeoLocation) {
		const key = locationKey(loc);
		storedFavoriteLocations.update((list) =>
			list.some((l) => locationKey(l) === key)
				? list.filter((l) => locationKey(l) !== key)
				: [loc, ...list].slice(0, 24)
		);
	}

	$: favKeys = new Set($storedFavoriteLocations.map(locationKey));
	$: recentToShow = $storedRecentLocations.filter((l) => !favKeys.has(locationKey(l)));

	async function focusInput() {
		await tick();
		searchInputEl?.focus();
	}

	$: if (popoverOpen) {
		focusInput();
	}

	$: results = (async () => {
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}
		if (searchQuery.length < 2) {
			return { results: [] };
		}
		await new Promise((resolve) => {
			debounceTimeout = setTimeout(resolve, 300);
		});

		if (searchQuery.toLowerCase() == 'gps') {
			let position: GeolocationPosition = await new Promise((resolve, reject) =>
				navigator.geolocation.getCurrentPosition(resolve, reject, {})
			);
			const latitude = position.coords.latitude;
			const longitude = position.coords.longitude;
			return {
				results: [
					{
						// coordinate-only location: id 0 + COORD makes
						// buildLocationRoute emit a "52.52N13.41E" route
						id: 0,
						name: `GPS ${latitude.toFixed(2)}°N ${longitude.toFixed(2)}°E`,
						latitude: latitude,
						longitude: longitude,
						elevation: position.coords.altitude ?? 0,
						feature_code: 'COORD',
						country_code: undefined,
						admin1_id: undefined,
						admin3_id: undefined,
						admin4_id: undefined,
						timezone: 'UTC',
						population: undefined,
						postcodes: undefined,
						country_id: undefined,
						country: undefined,
						admin1: undefined,
						admin3: undefined,
						admin4: undefined
					}
				]
			};
		}

		const url = 'https://geocoding-api.open-meteo.com/v1/search';
		const fetchUrl = `${url}?${new URLSearchParams({ name: searchQuery })}`;
		const result = await fetch(fetchUrl);

		if (!result.ok) {
			throw new Error(await result.text());
		}

		return (await result.json()) as ResultSet;
	})();
</script>

{#snippet locationRow(location: GeoLocation, removable: boolean)}
	{@const fav = favKeys.has(locationKey(location))}
	<div
		class="group flex items-center rounded-md border border-transparent transition-[background,border-color] duration-150 hover:border-border hover:bg-accent"
	>
		<button
			class="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left"
			onclick={() => selectLocation(location)}
		>
			<img
				class="h-7 w-7 shrink-0 rounded-full"
				src="/images/country-flags/{(location.country_code || 'united_nations').toLowerCase()}.svg"
				alt={location.country}
			/>
			<div class="min-w-0 flex-1">
				<div class="truncate text-sm font-medium text-foreground">{location.name}</div>
				<div class="truncate text-xs text-muted-foreground">
					{location.admin1 || ''}
					{location.country || ''}
					· {location.latitude.toFixed(2)}°N {location.longitude.toFixed(2)}°E
					{#if location.elevation}· {location.elevation.toFixed(0)}m{/if}
				</div>
			</div>
		</button>
		<button
			class="mr-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-background hover:text-amber-500 {fav
				? 'text-amber-500'
				: 'text-muted-foreground/50'}"
			onclick={() => toggleFavorite(location)}
			aria-label={fav ? m.search_favorite_remove() : m.search_favorite_add()}
			title={fav ? m.search_favorite_remove() : m.search_favorite_add()}
		>
			<svg
				class="h-4 w-4"
				viewBox="0 0 24 24"
				fill={fav ? 'currentColor' : 'none'}
				stroke="currentColor"
				stroke-width="1.75"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 3.6l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7 1-5.6-4-3.9 5.5-.8z"
				/>
			</svg>
		</button>
		{#if removable}
			<button
				class="mr-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/50 hover:bg-background hover:text-destructive"
				onclick={() => removeRecent(location)}
				aria-label={m.search_remove_recent({ location: location.name })}
				title={m.search_remove_recent_short()}
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
					<path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>
		{/if}
	</div>
{/snippet}

<Popover.Root bind:open={popoverOpen}>
	<Popover.Trigger
		class="flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-full border border-border/80 bg-background py-1 ps-1 pe-3 text-[0.8125rem] font-medium text-muted-foreground shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-primary/70 hover:shadow-md md:h-10"
		aria-label={m.search_aria()}
		title={location ? [location.name, locationDetail].filter(Boolean).join(' · ') : label}
	>
		{#if location}
			<img
				class="h-8 w-8 shrink-0 rounded-full ring-1 ring-border md:h-7 md:w-7"
				src="/images/country-flags/{(location.country_code || 'united_nations').toLowerCase()}.svg"
				alt={location.country}
			/>
			<span class="min-w-0 flex-1 text-left leading-tight">
				<span class="block truncate text-sm font-semibold text-foreground">{location.name}</span>
				{#if locationDetail}
					<span class="block truncate text-[11px] font-normal text-muted-foreground sm:text-xs">
						{locationDetail}
					</span>
				{/if}
			</span>
		{:else}
			<span class="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" aria-hidden="true"></span>
			<span class="min-w-0 flex-1 truncate text-left">{label}</span>
		{/if}
		<svg
			class="h-4 w-4 shrink-0 text-primary"
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="8" />
			<path d="m21 21-4.3-4.3" />
		</svg>
	</Popover.Trigger>

	<Popover.Content
		class="popover-dropdown w-(--bits-popover-anchor-width) min-w-[min(320px,calc(100vw-1rem))] p-0"
		side="bottom"
		align="start"
		sideOffset={4}
		onOpenAutoFocus={(e) => {
			e.preventDefault();
			focusInput();
		}}
	>
		<div class="flex flex-col">
			<div class="p-3">
				<div class="flex gap-2">
					<div class="flex-1">
						<Input
							type="search"
							{placeholder}
							class="h-9"
							autocomplete="off"
							spellcheck="false"
							aria-label={m.search_aria()}
							bind:value={searchQuery}
							bind:ref={searchInputEl}
						/>
					</div>
					<Button
						variant="outline"
						size="default"
						class="h-9 px-2.5"
						title={m.search_gps()}
						onclick={() => (searchQuery = 'GPS')}
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
							/>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
							/>
						</svg>
					</Button>
				</div>
			</div>

			<div class="max-h-[min(400px,50vh)] overflow-y-auto px-3 pb-3">
				{#await results}
					<div class="flex h-20 items-center justify-center">
						<div class="flex items-center space-x-2">
							<div class="h-4 w-4 animate-spin rounded-full border-b-2 border-primary"></div>
							<span class="text-sm text-muted-foreground">{m.search_searching()}</span>
						</div>
					</div>
				{:then results}
					{#if searchQuery.length < 2}
						{#if $storedFavoriteLocations.length > 0 || recentToShow.length > 0}
							{#if $storedFavoriteLocations.length > 0}
								<div
									class="mb-1 px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
								>
									{m.search_favorites()}
								</div>
								<div class="space-y-0.5">
									{#each $storedFavoriteLocations as loc (locationKey(loc))}
										{@render locationRow(loc, false)}
									{/each}
								</div>
							{/if}
							{#if recentToShow.length > 0}
								<div
									class="mb-1 px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase {$storedFavoriteLocations.length
										? 'mt-3'
										: ''}"
								>
									{m.search_recent()}
								</div>
								<div class="space-y-0.5">
									{#each recentToShow as loc (locationKey(loc))}
										{@render locationRow(loc, true)}
									{/each}
								</div>
							{/if}
						{:else}
							<div
								class="flex items-start gap-2 rounded-md bg-primary/8 p-2.5 text-muted-foreground"
							>
								<svg
									class="mt-0.5 h-3.5 w-3.5 shrink-0"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<span class="text-xs">
									{m.search_hint()}
								</span>
							</div>
						{/if}
					{:else if results.results && results.results.length > 0}
						<div class="space-y-0.5">
							{#each results.results as location, i (i)}
								{@render locationRow(location, false)}
							{/each}
						</div>
					{:else if results.results}
						<Alert.Root
							class="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20"
						>
							<Alert.Description class="text-orange-700 dark:text-orange-300">
								No locations found for "{searchQuery}". Try a different term.
							</Alert.Description>
						</Alert.Root>
					{:else}
						<Alert.Root variant="destructive">
							<Alert.Description>{m.search_no_results()}</Alert.Description>
						</Alert.Root>
					{/if}
				{:catch error}
					<Alert.Root variant="destructive">
						<Alert.Description>Error: {error.message}</Alert.Description>
					</Alert.Root>
				{/await}
			</div>
		</div>
	</Popover.Content>
</Popover.Root>
