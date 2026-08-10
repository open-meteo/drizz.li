<script lang="ts">
	import { fade } from 'svelte/transition';

	import { formatZoned, getRelativeDayLabel, isSameDayInZone } from '$lib/utils/date';

	import * as m from '$lib/paraglide/messages';

	import { getTempStyle } from '../../utils/colors';
	import { getWeatherDescription, getWeatherIconName } from '../../utils/weather-codes';
	import { precipIsSignificant, sunIsSignificant, windIsSignificant } from './significance';
	import { type FetchedDaily, type WeatherUnits, getWindArrowRotation } from './types';

	interface Props {
		daily: FetchedDaily | null;
		selectedDay: Date;
		units: WeatherUnits;
		onSelectDay: (date: Date, index: number) => void;
		/** Offer a button after the last day to load the model's longer range */
		canExtend?: boolean;
		onExtend?: () => void;
		/** Offer a button before the first day to load recent past days */
		canExtendPast?: boolean;
		onExtendPast?: () => void;
	}

	let {
		daily,
		selectedDay,
		units,
		onSelectDay,
		canExtend = false,
		onExtend,
		canExtendPast = false,
		onExtendPast
	}: Props = $props();

	// The "past days" button sits before the first card but starts scrolled out
	// of view — the user reveals it by scrolling left. Re-hide only when the
	// dataset (location) changes, not on every re-render.
	let scrollEl = $state<HTMLDivElement>();
	let cardsWrapEl = $state<HTMLDivElement>();
	let hiddenForRef: FetchedDaily | null = null;

	// Show the scrollbar only briefly while actively scrolling (a constant thin
	// gutter is reserved so revealing the thumb never shifts layout).
	let scrolling = $state(false);
	let scrollHideTimer: ReturnType<typeof setTimeout> | undefined;
	function onScroll() {
		scrolling = true;
		clearTimeout(scrollHideTimer);
		scrollHideTimer = setTimeout(() => (scrolling = false), 700);
	}

	$effect(() => {
		const d = daily;
		if (!d || !canExtendPast || !scrollEl || !cardsWrapEl || hiddenForRef === d) return;
		hiddenForRef = d;
		const el = scrollEl;
		const wrap = cardsWrapEl;
		// defer to after layout so the measured positions and scroll width are final
		requestAnimationFrame(() => {
			// scroll so the first day card sits exactly at the content edge (aligned
			// with the page hero), leaving the "past days" button fully off to the
			// left. The scroll's pl-3 keeps the lifted/scaled card from being clipped,
			// so subtract it here to land the card on the content edge.
			el.scrollLeft += wrap.getBoundingClientRect().left - el.getBoundingClientRect().left - 12;
		});
	});

	function getDaylightSeconds(index: number): number {
		if (!daily) return 0;
		const sunriseTs = daily.daily.sunrise[index];
		const sunsetTs = daily.daily.sunset[index];
		if (!sunriseTs || !sunsetTs) return 0;
		return Math.max(0, sunsetTs - sunriseTs);
	}

	function getSunshinePercent(sunshineSeconds: number | null, daylightSeconds: number): number {
		if (!sunshineSeconds || daylightSeconds <= 0) return 0;
		return Math.min(100, (sunshineSeconds / daylightSeconds) * 100);
	}

	function getSunshineColor(sunshineSeconds: number | null, daylightSeconds: number): string {
		if (daylightSeconds <= 0) return '#d1d5db';
		const ratio = (sunshineSeconds ?? 0) / daylightSeconds;
		if (ratio >= 0.7) return '#f59e0b';
		if (ratio >= 0.45) return '#fbbf24';
		if (ratio >= 0.1) return '#fcd34d';
		return '#d1d5db';
	}
</script>

<!-- Shared filter: erodes the filled weather glyphs slightly so their
     lines read a touch thinner at large sizes (radius = how much to shave) -->
<svg aria-hidden="true" width="0" height="0" class="absolute">
	<defs>
		<filter id="thin-day-icon" x="-10%" y="-10%" width="120%" height="120%">
			<feMorphology operator="erode" radius="0.45" />
		</filter>
	</defs>
</svg>

<div
	transition:fade={{ duration: 200 }}
	class="-mx-3 mb-1 flex min-h-47.5 items-stretch gap-2 px-3 md:mb-6 md:min-h-65"
>
	<!-- A horizontally-scrolling rail (past button + day cards) plus a "load more"
	     card pinned to the right so it's always visible on every screen. The
	     matching top/bottom padding gives a lifted/scaled card room so it's never
	     clipped, while the first card still lines up with the page content edge. -->
	<div
		bind:this={scrollEl}
		class="day-scroll -ml-3 flex min-w-0 flex-1 gap-2 overflow-x-auto pt-3 pb-3 pl-3 md:pt-5 md:pb-11"
		class:scrolling
		onscroll={onScroll}
	>
		{#if daily}
			{#if canExtendPast && onExtendPast}
				<button
					type="button"
					class="mr-4 flex w-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-card/40 px-2 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
					onclick={onExtendPast}
					aria-label={m.strip_past_aria()}
				>
					<svg
						class="h-6 w-6"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="1.75"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"
						/>
						<path stroke-linecap="round" stroke-linejoin="round" d="M14 13l-3 3 3 3" />
					</svg>
					<span class="text-center text-[11px] leading-tight font-semibold">
						{m.daycards_past()}
					</span>
				</button>
			{/if}
			<!-- the cards fill at least the viewport so the row overflows past the
			     "past days" button, letting it scroll out of view even on wide
			     screens -->
			<div bind:this={cardsWrapEl} class="cards-fill flex gap-2">
				{#each daily.dailyDates as time, index (index)}
					{@const selected = isSameDayInZone(time, selectedDay, daily.timezone)}
					{@const tempMax = daily.daily.temperature_2m_max[index]}
					{@const tempMin = daily.daily.temperature_2m_min[index]}
					{@const wCode = daily.daily.weather_code[index]}
					{@const dayCode = daily.dayCodes?.[index] ?? wCode}
					{@const nightCode = daily.nightCodes?.[index] ?? wCode}
					{@const sunDuration = daily.daily.sunshine_duration[index]}
					{@const daylightSec = getDaylightSeconds(index)}
					{@const sunColor = getSunshineColor(sunDuration, daylightSec)}
					{@const sunPct = getSunshinePercent(sunDuration, daylightSec)}
					{@const precipSum = daily.daily.precipitation_sum[index]}
					{@const windMax = daily.daily.windspeed_10m_max[index]}
					{@const gustMax = daily.daily.windgusts_10m_max[index]}
					{@const windDir = daily.daily.winddirection_10m_dominant[index]}
					{@const unit = String(units.temperature_unit)}
					{@const maxStyle = getTempStyle(tempMax, unit)}
					{@const lowSun = !sunIsSignificant(sunDuration, daylightSec)}
					{@const lowPrecip = !precipIsSignificant(precipSum, String(units.precipitation_unit))}
					{@const lowWind = !windIsSignificant(windMax, gustMax, String(units.wind_speed_unit))}
					{#if tempMax != null && !isNaN(tempMax) && !(tempMax === 0 && tempMin === 0)}
						<button
							class="day-card group relative flex w-35 shrink-0 cursor-pointer flex-col items-center gap-1 rounded-2xl border px-2 pt-3 pb-2.5 transition-all duration-200 ease-out will-change-transform motion-reduce:transition-none
							{selected
								? 'z-10 -translate-y-1 scale-[1.04] border-primary bg-primary/10 shadow-[0_5px_14px_-4px_rgba(0,0,0,0.4)] ring-2 ring-primary/60 md:shadow-xl'
								: 'border-border/60 bg-card shadow-xs hover:z-10 hover:-translate-y-1 hover:scale-[1.02] hover:border-border hover:shadow-lg'}"
							aria-pressed={selected}
							onclick={() => onSelectDay(time, index)}
						>
							<!-- Day label -->
							<span
								class="text-[13px] font-semibold tracking-wider {selected ? 'text-primary' : ''}"
							>
								{formatZoned(time, daily.timezone, 'EEE').toUpperCase()}
							</span>
							<span
								class="-mt-1 text-[11px] {selected
									? 'font-medium text-primary/80'
									: 'text-muted-foreground'}"
							>
								{getRelativeDayLabel(time, daily.timezone)}
							</span>

							<!-- Weather icon: large day with a night badge in the corner -->
							<div class="relative my-1 px-3 -ml-2.5">
								<svg
									class="day-icon fill-foreground"
									width="100px"
									height="100px"
									style="filter: url(#thin-day-icon)"
								>
									<title>{getWeatherDescription(dayCode)}</title>
									<use
										xlink:href="/images/weather-icons/{getWeatherIconName(
											dayCode,
											true
										)}.svg#Layer_1"
									></use>
								</svg>
								<svg
									class="night-icon absolute -right-2 -bottom-1 rounded-full bg-card fill-foreground/60 p-0.5 ring-1 ring-border/60"
									width="42px"
									height="42px"
								>
									<title>{getWeatherDescription(nightCode)}</title>
									<use
										xlink:href="/images/weather-icons/{getWeatherIconName(
											nightCode,
											false
										)}.svg#Layer_1"
									></use>
								</svg>
							</div>

							<!-- Temperature max/min -->
							<div class="flex items-baseline gap-1.5">
								<span
									class="ml-1 rounded-xl px-5 py-1.5 text-xl font-extrabold tabular-nums"
									style="background-color: {maxStyle.bg}; color: {maxStyle.fg}"
								>
									{tempMax.toFixed(0)}°
								</span>
								<span class="text-lg font-semibold tabular-nums text-muted-foreground">
									{tempMin.toFixed(0)}°
								</span>
							</div>

							<!-- Details -->
							<div class="mt-1.5 flex w-full flex-col gap-1 border-t border-border/50 px-1 pt-1.5">
								<!-- Sunshine -->
								<div class="flex w-full items-center gap-1.5 {lowSun ? 'opacity-45' : ''}">
									<svg class="shrink-0" width="20px" height="20px" style="fill: {sunColor}">
										<use xlink:href="/images/weather-icons/wi-day-sunny.svg#Layer_1"></use>
									</svg>
									<div class="h-1 flex-1 overflow-hidden rounded-full bg-muted">
										<div
											class="h-full rounded-full transition-all"
											style="width: {sunPct}%; background-color: {sunColor}"
										></div>
									</div>
									<span class="text-[10px] font-medium tabular-nums text-muted-foreground">
										{Number((sunDuration ?? 0) / 3600).toFixed(0)}h
									</span>
								</div>

								<!-- Precipitation + wind -->
								<div
									class="flex w-full items-center justify-center gap-2.5 text-[11px] tabular-nums text-foreground/80"
								>
									<span
										class="inline-flex items-center gap-0.5 {lowPrecip
											? 'text-muted-foreground/50'
											: ''}"
									>
										<svg
											class="shrink-0 {lowPrecip
												? 'fill-muted-foreground/40'
												: 'fill-foreground/70'}"
											width="23px"
											height="23px"
										>
											<use xlink:href="/images/weather-icons/wi-raindrop.svg#Layer_1"></use>
										</svg>
										{Number(precipSum ?? 0).toFixed(
											precipSum >= 10 ? 0 : 1
										)}{units.precipitation_unit === 'mm' ? ' mm' : "'"}
									</span>
									<span
										class="inline-flex items-center gap-0.5 {lowWind
											? 'text-muted-foreground/50'
											: ''}"
									>
										{#if windDir != null && !isNaN(windDir)}
											<span
												class="inline-flex shrink-0 -mr-2"
												style="transform: {getWindArrowRotation(windDir)}"
											>
												<svg
													class={lowWind ? 'fill-muted-foreground/40' : 'fill-foreground/70'}
													width="40px"
													height="40px"
												>
													<use xlink:href="/images/weather-icons/wi-direction-down.svg#Layer_1"
													></use>
												</svg>
											</span>
										{:else}
											<svg
												class="shrink-0 -mr-2 {lowWind
													? 'fill-muted-foreground/40'
													: 'fill-foreground/70'}"
												width="40px"
												height="40px"
											>
												<use xlink:href="/images/weather-icons/wi-strong-wind.svg#Layer_1"></use>
											</svg>
										{/if}
										{windMax?.toFixed(0) ?? '-'}<span class="opacity-70"
											>-{gustMax?.toFixed(0) ?? '-'}</span
										>
									</span>
								</div>
							</div>
						</button>
					{/if}
				{/each}

				<!-- Mobile: the "load more" card is the last item in the SAME flex row
				     as the cards (reached by scrolling); keeping it in this container
				     avoids the zoom/flex mis-position seen when it was a sibling. On
				     md+ it's hidden here and the pinned sibling below is shown. -->
				{#if canExtend && onExtend}
					<button
						type="button"
						class="day-card-btn flex w-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-2 self-stretch rounded-2xl border border-dashed border-border/70 bg-card/40 px-2 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground md:hidden"
						onclick={onExtend}
						aria-label={m.strip_extend_aria()}
					>
						<svg
							class="h-6 w-6"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							stroke-width="1.75"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"
							/>
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 14v4m-2-2h4" />
						</svg>
						<span class="text-center text-[11px] leading-tight font-semibold">
							{m.daycards_load_15()}
						</span>
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Desktop: "load more" card pinned to the right of the scroll rail (a
	     sibling, not inside the scroll) so it's always visible and full-height. -->
	{#if daily && canExtend && onExtend}
		<button
			type="button"
			class="mt-2 mb-3 hidden w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-2 self-stretch rounded-2xl border border-dashed border-border/70 bg-card/40 px-2 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground md:mt-5 md:mb-11 md:flex md:w-24"
			onclick={onExtend}
			aria-label={m.strip_extend_aria()}
		>
			<svg
				class="h-6 w-6"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				stroke-width="1.75"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"
				/>
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 14v4m-2-2h4" />
			</svg>
			<span class="text-center text-[11px] leading-tight font-semibold">{m.daycards_load_15()}</span
			>
		</button>
	{/if}
</div>

<style>
	/* Reserve a constant thin scrollbar gutter (no layout shift), but keep the
	   thumb invisible until the user is actively scrolling. */
	.day-scroll {
		scrollbar-width: thin;
		scrollbar-color: transparent transparent;
		/* Soft fade at the right edge (only) so cards dissolve into the page
		   margin instead of being hard-cut as they scroll off. */
		-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
		mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
	}
	.day-scroll.scrolling {
		scrollbar-color: color-mix(in oklab, var(--color-border) 85%, transparent) transparent;
	}
	.day-scroll::-webkit-scrollbar {
		height: 8px;
	}
	.day-scroll::-webkit-scrollbar-thumb {
		border-radius: 4px;
		background: transparent;
		transition: background 0.2s;
	}
	.day-scroll.scrolling::-webkit-scrollbar-thumb {
		background: color-mix(in oklab, var(--color-border) 85%, transparent);
	}

	/* The cards group fills the viewport so the row overflows past the side
	   buttons. On md+ we also reserve room so the "load more" button stays in
	   view; on mobile it keeps its full width after the cards (reached by
	   scrolling) and is never clipped. */
	.cards-fill {
		min-width: 100%;
	}
	@media (min-width: 768px) {
		.cards-fill {
			min-width: calc(100% - var(--fill-reserve, 0rem));
		}
	}

	/* Mobile: keep the exact desktop layout, just scale the whole card down. */
	@media (max-width: 768px) {
		.day-card {
			zoom: 0.72;
		}
	}
</style>
