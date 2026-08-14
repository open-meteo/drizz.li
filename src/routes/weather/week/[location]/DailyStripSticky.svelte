<script lang="ts">
	import { onMount } from 'svelte';

	import { formatZoned, getRelativeDayLabel, isSameDayInZone } from '$lib/utils/date';

	import { href } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	import { getTempStyle } from '../../utils/colors';
	import { getWeatherDescription, getWeatherIconName } from '../../utils/weather-codes';
	import {
		getSunshineColor,
		getSunshinePercent,
		precipIsSignificant,
		sunIsSignificant,
		windIsSignificant
	} from './significance';
	import { type FetchedDaily, type WeatherUnits, getWindArrowRotation } from './types';

	interface Props {
		daily: FetchedDaily | null;
		selectedDay: Date;
		units: WeatherUnits;
		onSelectDay: (date: Date, index: number) => void;
		canExtend?: boolean;
		onExtend?: () => void;
		canExtendPast?: boolean;
		onExtendPast?: () => void;
		/**
		 * Location segment for the hand-off links that replace the side buttons
		 * once their range is exhausted. Omit to leave the slots empty.
		 */
		locationRoute?: string;
	}

	let {
		daily,
		selectedDay,
		units,
		onSelectDay,
		canExtend = false,
		onExtend,
		canExtendPast = false,
		onExtendPast,
		locationRoute
	}: Props = $props();

	// enough placeholder tiles to fill a wide viewport; the row scrolls, so a
	// couple too many costs nothing
	const SKELETON_CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

	// ─── Scroll-driven collapse (full cards → compact strip) ────────────────────
	// All sizing derives from a single registered custom property `--strip-p`
	// (0 = full cards, 1 = compact strip). Mobile and desktop share the exact
	// same mechanics — desktop just uses larger "full" tunables and collapses
	// into a bar that matches the topbar height.
	//
	//  * Browsers with CSS scroll-driven animations (Chrome/Edge 115+, Safari 26+)
	//    scrub `--strip-p` natively from a view-timeline on the sentinel below —
	//    no JS runs during scroll at all, so there is no rAF frame-lag or jitter.
	//  * Everything else (Firefox, older Safari) snaps between the two states
	//    with a short CSS transition instead: an IntersectionObserver on the same
	//    sentinel toggles `.compact`. No per-frame scroll handler anywhere.
	let sentinelEl = $state<HTMLDivElement>();
	let stripEl = $state<HTMLDivElement>();
	let stripScrollEl = $state<HTMLDivElement>();
	let daysWrapEl = $state<HTMLDivElement>();
	let needsSnapFallback = $state(false);
	let compact = $state(false);
	let stuck = $state(false);

	onMount(() => {
		const scrubSupported =
			CSS.supports('animation-timeline: view()') && CSS.supports('timeline-scope: none');
		if (scrubSupported || !sentinelEl || !stripEl) return;

		// Without scroll-driven animations (Firefox, older Safari) the collapse used
		// to snap between the two states at a threshold, which reads as a jump next
		// to the smooth scrub everywhere else. Drive `--strip-p` from the scroll
		// position instead, so the cells shrink with the scroll exactly as they do
		// natively. One rAF-coalesced write per frame, no layout thrash.
		const sentinel = sentinelEl;
		const strip = stripEl;
		const scroller = sentinel.closest('main');

		let frame = 0;
		const update = () => {
			frame = 0;
			const band = sentinel.getBoundingClientRect();
			const top = scroller ? scroller.getBoundingClientRect().top : 0;
			const height = band.height || 1;
			const progress = Math.min(1, Math.max(0, (top - band.top) / height));
			strip.style.setProperty('--strip-p', String(progress));
			strip.style.setProperty('--stuck', progress > 0.02 ? '1' : '0');
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};

		update();
		const target: EventTarget = scroller ?? window;
		target.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', schedule);
		return () => {
			if (frame) cancelAnimationFrame(frame);
			target.removeEventListener('scroll', schedule);
			window.removeEventListener('resize', schedule);
		};
	});

	// Start scrolled so the "Past" button sits just off the left edge (revealed by
	// scrolling left), with the first day flush to the content edge. The days
	// group has min-width:100%, so the row always overflows by exactly the past
	// button — this works at every viewport size. Runs once per dataset.
	let scrolledForRef: FetchedDaily | null = null;
	$effect(() => {
		const d = daily;
		if (!d || !stripScrollEl || !daysWrapEl || scrolledForRef === d) return;
		scrolledForRef = d;
		const scroll = stripScrollEl;
		const wrap = daysWrapEl;
		if (!canExtendPast) {
			// the past button has been replaced by the history link, which is a
			// destination rather than a control: it stays in view instead of parked
			scroll.scrollLeft = 0;
			return;
		}
		// the delta form is self-correcting (a no-op once right), so apply after
		// layout and once more after late-loading CSS/fonts settle — otherwise a
		// sliver of the past button can stay visible on first paint
		const apply = () => {
			const padLeft = parseFloat(getComputedStyle(scroll).paddingLeft) || 0;
			const firstCell = wrap.querySelector('.strip-cell') ?? wrap;
			scroll.scrollLeft +=
				firstCell.getBoundingClientRect().left - scroll.getBoundingClientRect().left - padLeft;
		};
		requestAnimationFrame(() => {
			apply();
			setTimeout(apply, 250);
		});
	});
</script>

<!-- progress sentinel: an invisible band (taking no layout space) just above
     the sticky strip. Its exit across the scrollport top drives the collapse —
     via view-timeline where supported, IntersectionObserver otherwise. It sits
     above the strip so the strip shrinking never feeds back into the
     measurement. -->
<div bind:this={sentinelEl} class="sentinel" aria-hidden="true"></div>

<div
	bind:this={stripEl}
	class="daystrip sticky -top-3 z-30 -mx-3 lg:-top-6 lg:-mx-8 mt-0.5"
	class:js-snap={needsSnapFallback}
	class:compact
	class:stuck
>
	<div class="strip-row flex overflow-x-auto px-3 lg:px-8" bind:this={stripScrollEl}>
		{#if daily}
			{#if canExtendPast && onExtendPast}
				<!-- starts scrolled out of view (revealed by scrolling left); styled to
				     match the 15-days button on the other end -->
				<button
					type="button"
					class="strip-side strip-park flex shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-primary/50 bg-primary/5 text-primary transition-colors hover:border-primary hover:bg-primary/10"
					onclick={onExtendPast}
					aria-label={m.strip_past_aria()}
					title={m.strip_past_aria()}
				>
					<span class="inline-flex items-baseline gap-0.5">
						<svg
							class="h-3 w-3 translate-y-px"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							stroke-width="2.5"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 5l-7 7 7 7" />
						</svg>
						<span class="text-sm leading-none font-extrabold">3</span>
					</span>
					<span class="text-[9px] leading-tight font-semibold">{m.strip_past_label()}</span>
				</button>
			{:else if locationRoute}
				<!-- the past days are already in the strip: the only way further back
				     is the archive, so the button hands over to it -->
				<a
					href={href('/weather/historical/[location]', { location: locationRoute })}
					class="strip-side flex shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-primary/50 bg-primary/5 text-primary transition-colors hover:border-primary hover:bg-primary/10"
					aria-label={m.strip_history_aria()}
					title={m.strip_history_title()}
				>
					<svg
						class="h-4 w-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 2" />
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3.5 9a9 9 0 1 0 2.2-3.6L3 8m0-4.5V8h4.5"
						/>
					</svg>
					<span class="text-[9px] leading-tight font-semibold">{m.strip_history_label()}</span>
				</a>
			{/if}

			<div class="strip-days flex" bind:this={daysWrapEl}>
				{#each daily.dailyDates as time, index (index)}
					{@const selected = isSameDayInZone(time, selectedDay, daily.timezone)}
					{@const tempMax = daily.daily.temperature_2m_max[index]}
					{@const tempMin = daily.daily.temperature_2m_min[index]}
					{@const wCode = daily.daily.weather_code[index]}
					{@const dayCode = daily.dayCodes?.[index] ?? wCode}
					{@const nightCode = daily.nightCodes?.[index] ?? wCode}
					{@const precipSum = daily.daily.precipitation_sum[index]}
					{@const windMax = daily.daily.windspeed_10m_max[index]}
					{@const gustMax = daily.daily.windgusts_10m_max[index]}
					{@const windDir = daily.daily.winddirection_10m_dominant[index]}
					{@const sunDuration = daily.daily.sunshine_duration[index]}
					{@const daylightSec = Math.max(
						0,
						(daily.daily.sunset[index] ?? 0) - (daily.daily.sunrise[index] ?? 0)
					)}
					{@const sunColor = getSunshineColor(sunDuration, daylightSec)}
					{@const sunPct = getSunshinePercent(sunDuration, daylightSec)}
					{@const lowSun = !sunIsSignificant(sunDuration, daylightSec)}
					{@const maxStyle = getTempStyle(tempMax, String(units.temperature_unit))}
					{@const lowPrecip = !precipIsSignificant(precipSum, String(units.precipitation_unit))}
					{@const lowWind = !windIsSignificant(windMax, gustMax, String(units.wind_speed_unit))}
					{@const relLabel = getRelativeDayLabel(time, daily.timezone)}
					{@const isToday = relLabel === 'Today'}
					{#if tempMax != null && !isNaN(tempMax) && !(tempMax === 0 && tempMin === 0)}
						<button
							type="button"
							class="strip-cell flex shrink-0 cursor-pointer flex-col items-center justify-start gap-0.5 rounded-xl border px-1 {selected
								? 'border-primary bg-primary/10 ring-1 ring-primary/50'
								: isToday
									? 'today-cell border-primary/35 bg-primary/4'
									: 'border-border/60 bg-card'}"
							aria-pressed={selected}
							aria-current={isToday ? 'date' : undefined}
							onclick={() => onSelectDay(time, index)}
						>
							<!-- weekday drifts to the left edge and the date fades in at the
							     right edge as the cards collapse (flex spacers driven by --rel) -->
							<span
								class="dow-row flex w-full items-baseline px-0.5 font-semibold tracking-wide whitespace-nowrap {selected
									? 'text-primary'
									: ''}"
							>
								<span class="dow-spacer"></span>
								<span>{formatZoned(time, daily.timezone, 'EEE').toUpperCase()}</span>
								<span class="dow-mid"></span>
								<span class="date-inline text-right font-medium tabular-nums text-muted-foreground"
									>{formatZoned(time, daily.timezone, 'd')}</span
								>
								<span class="dow-spacer"></span>
							</span>

							<span
								class="rel-label leading-[1.25] whitespace-nowrap {isToday
									? 'font-semibold text-primary/80'
									: 'text-muted-foreground'}"
							>
								{relLabel}
							</span>

							<!-- Two centered rows: day + night icons, then day + night temps.
							     Both stay perfectly centered when compact (the night icon melts
							     away and the day icon re-centers on its own); when full, small
							     k-driven nudges line each temp up under its icon. -->
							<div class="icon-row flex w-full items-center justify-center">
								<div class="icon-wrap">
									<svg class="day-icon fill-foreground">
										<title>{getWeatherDescription(dayCode)}</title>
										<use
											xlink:href="/images/weather-icons/{getWeatherIconName(
												dayCode,
												true
											)}.svg#Layer_1"
										></use>
									</svg>
								</div>
								<svg class="night-icon self-end fill-foreground/60">
									<title>{getWeatherDescription(nightCode)}</title>
									<use
										xlink:href="/images/weather-icons/{getWeatherIconName(
											nightCode,
											false
										)}.svg#Layer_1"
									></use>
								</svg>
							</div>

							<div class="flex w-full items-baseline justify-center gap-0.5 leading-none">
								<span
									class="temp-max rounded-md font-extrabold tabular-nums"
									style="background-color:{maxStyle.bg};color:{maxStyle.fg}"
								>
									{tempMax.toFixed(0)}°
								</span>
								<span class="temp-min font-semibold tabular-nums text-muted-foreground">
									{tempMin.toFixed(0)}°
								</span>
							</div>

							<div
								class="detail-row flex w-full flex-col items-center gap-0.5 overflow-hidden text-[10px] tabular-nums text-muted-foreground"
							>
								<!-- sunshine bar (desktop full cards only, like the old day cards) -->
								<div
									class="hidden w-full items-center gap-1 px-0.5 md:my-1 md:flex {lowSun
										? 'opacity-45'
										: ''}"
								>
									<svg class="shrink-0" width="14" height="14" style="fill:{sunColor}">
										<use xlink:href="/images/weather-icons/wi-day-sunny.svg#Layer_1"></use>
									</svg>
									<div class="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
										<div
											class="h-full rounded-full"
											style="width:{sunPct}%;background-color:{sunColor}"
										></div>
									</div>
									<span class="font-medium">
										{Number((sunDuration ?? 0) / 3600).toFixed(0)}h
									</span>
								</div>

								<!-- precip + wind: stacked on mobile, one row on md+ (old card style) -->
								<div
									class="flex w-full flex-col items-center gap-0.5 md:flex-row md:justify-center md:gap-2"
								>
									<span class="inline-flex items-center gap-1 {lowPrecip ? 'opacity-40' : ''}">
										<svg class="fill-sky-500" width="16" height="16">
											<use xlink:href="/images/weather-icons/wi-raindrop.svg#Layer_1"></use>
										</svg>
										{Number(precipSum ?? 0).toFixed(precipSum >= 10 ? 0 : 1)}
									</span>
									<span class="inline-flex items-center gap-1 {lowWind ? 'opacity-40' : ''}">
										{#if windDir != null && !isNaN(windDir)}
											<span
												class="hidden shrink-0 md:inline-flex md:-mr-1"
												style="transform: {getWindArrowRotation(windDir)}"
											>
												<svg class="fill-muted-foreground" width="25" height="25">
													<use xlink:href="/images/weather-icons/wi-direction-down.svg#Layer_1"
													></use>
												</svg>
											</span>
											<svg class="fill-muted-foreground md:hidden" width="16" height="16">
												<use xlink:href="/images/weather-icons/wi-strong-wind.svg#Layer_1"></use>
											</svg>
										{:else}
											<svg class="fill-muted-foreground" width="16" height="16">
												<use xlink:href="/images/weather-icons/wi-strong-wind.svg#Layer_1"></use>
											</svg>
										{/if}
										<span class="whitespace-nowrap"
											>{windMax?.toFixed(0) ?? '-'}<span class="hidden opacity-70 md:inline"
												>-{gustMax?.toFixed(0) ?? '-'}</span
											></span
										>
									</span>
								</div>
							</div>
						</button>
					{/if}
				{/each}

				{#if canExtend && onExtend}
					<!-- shows the RESULTING range, not an increment: tapping switches the
					     whole forecast from 7 to 15 days -->
					<button
						type="button"
						class="strip-side flex shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-primary/50 bg-primary/5 text-primary transition-colors hover:border-primary hover:bg-primary/10"
						onclick={onExtend}
						aria-label={m.strip_extend_aria()}
						title={m.strip_extend_aria()}
					>
						<span class="inline-flex items-baseline gap-0.5">
							<span class="text-sm leading-none font-extrabold">15</span>
							<svg
								class="h-3 w-3 translate-y-px"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								stroke-width="2.5"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
							</svg>
						</span>
						<span class="text-[9px] leading-tight font-semibold">{m.strip_days_label()}</span>
					</button>
				{:else if locationRoute}
					<!-- the strip is at the model's limit: anything further out is a
					     seasonal outlook, so the button hands over to it -->
					<a
						href={href('/weather/seasonal/[location]', { location: locationRoute })}
						class="strip-side flex shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-primary/50 bg-primary/5 text-primary transition-colors hover:border-primary hover:bg-primary/10"
						aria-label={m.strip_seasonal_aria()}
						title={m.strip_seasonal_title()}
					>
						<svg
							class="h-4 w-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M3 17l6-6 4 4 7-7" />
							<path stroke-linecap="round" stroke-linejoin="round" d="M16 8h5v5" />
						</svg>
						<span class="text-[9px] leading-tight font-semibold">{m.strip_seasonal_label()}</span>
					</a>
				{/if}
			</div>
		{:else}
			<!-- same cell metrics as the real strip, so the bar looks alive while
			     the forecast lands and nothing moves when it does -->
			<div class="strip-days flex">
				{#each SKELETON_CELLS as i (i)}
					<div
						class="strip-cell shrink-0 animate-pulse rounded-xl border border-border/60 bg-muted"
					></div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	/* `--strip-p` is registered so it interpolates: scroll-driven keyframes scrub
	   it continuously, and the snap fallback's `transition` eases it 0 ↔ 1.
	   Everything below derives from it via calc(), so a scroll frame is one
	   property update resolved natively by the browser — no JS, no inline-style
	   patches across cells. */
	@property --strip-p {
		syntax: '<number>';
		inherits: true;
		initial-value: 0;
	}

	/* 1 as soon as the strip pins — drives the bar chrome independently of the
	   collapse progress so nothing ever shows through a still-expanding bar. */
	@property --stuck {
		syntax: '<number>';
		inherits: true;
		initial-value: 0;
	}

	/* Tunables, shared by the strip and its sentinel: the collapse plays out
	   over exactly the bar-height difference (see .daystrip height below). */
	.sentinel,
	.daystrip {
		--cell-w-full: 76px;
		--cell-h-full: 140px;
		--cell-h-min: 64px;
		/* collapsed cells are square: the width follows the compact height, so the
		   docked bar reads as a row of tiles instead of narrow slivers */
		--cell-w-min: var(--cell-h-min);
		--icon-full: 44px;
		/* the compact icon carries the square tile: sized so the content fills it
		   and the leftover slack under the temps stays small */
		--icon-min: 31px;
		--pt-full: 7px;
		--pt-min: 2px;
		--gap-full: 8px;
		--gap-min: 4px;
		/* bar (strip-row) vertical padding */
		--pad-full: 8px;
		--pad-min: 5px;
		/* fonts */
		--dow-font-full: 11px;
		--dow-font-min: 11px;
		--rel-font-full: 9px;
		--rel-font-min: 9px;
		--tmax-font-full: 12px;
		--tmax-font-min: 11px;
		--tmin-font-full: 11px;
		--tmin-font-min: 10px;
		--tmax-padx-full: 6px;
		--tmax-padx-min: 4px;
		/* full state only: nudge each temp to sit under "its" icon */
		--tmax-nudge: 0px;
		--tmin-nudge: 5px;
		/* full state only: gap above the icons, and the day / night icon offsets
		   that tighten the pair around the cell centre */
		--icon-gap-full: 2px;
		--day-icon-nudge: 3px;
		--night-icon-nudge: 0px;
		/* compact only: signed shift that lands the lone icon dead centre in the
		   square tile (measured against the tile's mid-line) */
		--icon-lift: 1px;
		/* cell bottom padding (roomy when full, a little breathing room under the
		   temps when compact so they don't sit on the tile edge). The compact
		   tile is taller than its content here, so the leftover slack already
		   supplies that gap and the padding stays at zero. */
		--pb-full: 6px;
		--pb-min: 0px;
		/* extra scrub distance beyond the height difference — slows the collapse
		   down; the surplus just slides content under the (opaque) bar */
		--collapse-extra: 0px;

		--collapse: calc(
			var(--cell-h-full) + 2 * var(--pad-full) - var(--cell-h-min) - 2 * var(--pad-min) +
				var(--collapse-extra)
		);
	}

	/* md+: same collapse, but the full state keeps the old desktop day-card
	   proportions, plays out over a longer scroll distance, and the compact
	   bar docks under the topbar (slightly taller than its 56px). */
	@media (min-width: 768px) {
		.sentinel,
		.daystrip {
			--cell-w-full: 120px;
			--cell-h-full: 208px;
			--cell-h-min: 56px;
			--icon-full: 80px;
			--icon-min: 24px;
			--pt-full: 10px;
			--gap-full: 10px;
			--gap-min: 6px;
			--pad-min: 3px;
			--dow-font-full: 13px;
			--dow-font-min: 10px;
			--rel-font-full: 11px;
			--tmax-font-full: 17px;
			--tmin-font-full: 15px;
			--tmax-padx-full: 12px;
			--tmax-nudge: 0px;
			--tmin-nudge: 8px;
			--icon-gap-full: 6px;
			--day-icon-nudge: 4px;
			--night-icon-nudge: 6px;
			--pb-full: 10px;
			--pb-min: 3px;
			--icon-lift: 0px;
			--collapse-extra: 0px;
		}
		.daystrip {
			/* breathing room between the full cards and the table */
			margin-bottom: 14px;
		}
	}

	/* Desktop only: the docked tiles get roughly 1.75x bigger, with the icon and
	   type scaled to match so they stay in proportion. Phones and tablets keep
	   the compact bar - there the screen width is the scarce resource. */
	@media (min-width: 1024px) {
		.sentinel,
		.daystrip {
			--cell-h-min: 86px;
			--icon-min: 47px;
			--dow-font-min: 11px;
			--tmax-font-min: 14px;
			--tmin-font-min: 12px;
			--tmax-padx-min: 6px;
			--pt-min: 5px;
			--pb-min: 6px;
			--icon-lift: 1px;
		}
	}

	/* Invisible collapse band: the scroll distance over which the collapse
	   plays. The negative margin removes it from layout so nothing shifts. */
	.sentinel {
		height: var(--collapse);
		margin-bottom: calc(-1 * var(--collapse));
		pointer-events: none;
	}

	.daystrip {
		--strip-p: 0;
		--stuck: 0;

		/* progress-derived (--k is the "fullness": 1 when full, 0 when compact) */
		--k: calc(1 - var(--strip-p));
		--cell-w: calc(var(--cell-w-min) + (var(--cell-w-full) - var(--cell-w-min)) * var(--k));
		--cell-h: calc(var(--cell-h-min) + (var(--cell-h-full) - var(--cell-h-min)) * var(--k));
		--icon: calc(var(--icon-min) + (var(--icon-full) - var(--icon-min)) * var(--k));
		--pt: calc(var(--pt-min) + (var(--pt-full) - var(--pt-min)) * var(--k));
		--gap: calc(var(--gap-min) + (var(--gap-full) - var(--gap-min)) * var(--k));
		--pad: calc(var(--pad-min) + (var(--pad-full) - var(--pad-min)) * var(--k));
		--rel: clamp(0, calc(1 - var(--strip-p) * 2), 1);
		--detail: clamp(0, calc(1 - var(--strip-p) * 1.6), 1);
		/* bar background turns opaque the moment the strip sticks (via --stuck),
		   so content never shows through it — even while the cells are still
		   large and the collapse has barely started */
		--chrome: clamp(0, calc(var(--strip-p) * 6 + var(--stuck)), 1);

		/* The sticky box keeps a CONSTANT height — only its contents shrink.
		   The collapse therefore never resizes the document (the large table
		   below would otherwise reflow on every scroll frame: the main source
		   of scroll jank on mobile Chromium), and because the collapse distance
		   equals the height difference, the table slides up under the shrinking
		   bar in exact sync. The empty lower part is click-through. */
		height: calc(var(--cell-h-full) + 2 * var(--pad-full));
		pointer-events: none;
		contain: layout style;
		/* own compositor layer: per-frame repaints stay isolated to the strip */
		transform: translateZ(0);
	}

	/* The visible bar: hugs the (shrinking) content and carries the chrome.
	   No backdrop-filter blur or animated box-shadow — both are very expensive
	   to repaint every scroll frame on mobile. */
	.strip-row {
		pointer-events: auto;
		gap: var(--gap);
		padding-block: var(--pad);
		background: color-mix(
			in oklab,
			var(--color-background) calc(var(--chrome) * 100%),
			transparent
		);
		border-bottom: 1px solid
			color-mix(in oklab, var(--color-border) calc(var(--chrome) * 100%), transparent);
	}

	/* Scrub path: the sentinel's exit across the scrollport top maps directly to
	   --strip-p 0→1 (the page wrapper hoists the timeline name via
	   `timeline-scope` so this sibling can reference it). */
	@supports (animation-timeline: view()) and (timeline-scope: none) {
		.sentinel {
			view-timeline: --daystrip-sentinel block;
		}
		.daystrip {
			animation:
				strip-collapse linear both,
				strip-stuck linear both;
			animation-timeline: --daystrip-sentinel, --daystrip-sentinel;
			animation-range:
				exit 0% exit 100%,
				exit 0% exit 3%;
		}
	}
	@keyframes strip-collapse {
		to {
			--strip-p: 1;
		}
	}
	@keyframes strip-stuck {
		to {
			--stuck: 1;
		}
	}

	/* Snap fallback: ease between the two end states instead of scrubbing.
	   (Browsers too old to register --strip-p simply switch instantly.) */
	.daystrip.js-snap {
		transition:
			--strip-p 0.32s ease,
			--stuck 0.15s ease;
	}
	.daystrip.js-snap.compact {
		--strip-p: 1;
	}
	.daystrip.js-snap.stuck {
		--stuck: 1;
	}
	@media (min-width: 768px) {
		/* larger cards need a touch longer to feel smooth */
		.daystrip.js-snap {
			transition:
				--strip-p 0.42s ease,
				--stuck 0.15s ease;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.daystrip.js-snap {
			transition: none;
		}
	}

	.strip-days {
		gap: var(--gap);
		/* fill the row so it overflows by exactly the past button, which starts
		   scrolled out of view and is revealed by scrolling left — even when the
		   day cells alone wouldn't overflow (wide desktop viewports). content-box
		   so the parking padding below ADDS to the 100% instead of being absorbed
		   into it. */
		box-sizing: content-box;
		min-width: 100%;
	}
	/* Scroll containers clip at the PADDING edge, so a parked past button would
	   always leak a sliver across the row's left padding. Extending the days
	   group's left edge (only while the parked past button exists) moves
	   max-scroll so the button parks fully beyond the clip edge. The history
	   link that replaces it is never parked, so it keeps the normal gap. */
	.strip-park + .strip-days {
		padding-left: calc(12px - var(--gap-min));
	}
	@media (min-width: 1024px) {
		.strip-park + .strip-days {
			padding-left: calc(32px - var(--gap-min));
		}
	}
	.strip-cell,
	.strip-side {
		height: var(--cell-h);
		/* size tracks the collapse exactly; only the tap highlight eases */
		transition:
			border-color 0.15s,
			background-color 0.15s,
			translate 0.2s ease-out,
			scale 0.2s ease-out,
			box-shadow 0.2s ease-out;
	}
	/* The old day-card lift: hover raises the card slightly, the selected day a
	   touch more. Scaled by --k so the effect melts away as the strip compacts
	   (and never disturbs the slim bar); hover only where hover exists. */
	.strip-cell[aria-pressed='true'] {
		z-index: 10;
		translate: 0 calc(-4px * var(--k));
		scale: calc(1 + 0.04 * var(--k));
		box-shadow: 0 5px 14px -4px rgba(0, 0, 0, calc(0.4 * var(--k)));
	}
	@media (hover: hover) {
		.strip-cell:hover:not([aria-pressed='true']) {
			z-index: 10;
			translate: 0 calc(-3px * var(--k));
			scale: calc(1 + 0.02 * var(--k));
			box-shadow: 0 4px 10px -4px rgba(0, 0, 0, calc(0.3 * var(--k)));
		}
	}
	.strip-cell {
		width: var(--cell-w);
		padding-top: var(--pt);
		padding-bottom: calc(var(--pb-min) + (var(--pb-full) - var(--pb-min)) * var(--k));
		/* The collapsed rows that shrink to zero height still paid for their flex
		   gap, which pushed the temps onto the tile's bottom edge. Fading the gap
		   out with the collapse gives that space back as real bottom padding. */
		row-gap: calc(2px * var(--k));
	}
	/* Side buttons keep the compact width in BOTH states, so almost nothing to
	   the left of the first day changes size during the collapse — the first
	   day stays put instead of drifting off-screen. */
	.strip-side {
		width: var(--cell-w-min);
	}
	.icon-row {
		/* full: keep the icons off the weekday / date block above them.
		   compact: the icon is the only thing between the two text rows, so lift
		   it to sit optically dead centre in the square tile. */
		margin-top: calc(var(--icon-gap-full) * var(--k));
		transform: translateY(calc(-1 * var(--icon-lift) * (1 - var(--k))));
		/* the compact icon overlaps the temperature badge below it, and reads far
		   better over that colour than under it */
		position: relative;
		z-index: 1;
	}
	.icon-wrap {
		/* tuck the icon into its line box: the glyphs carry generous built-in
		   padding, so pulling the neighbours in keeps the cells tight */
		margin-block: -2px -3px;
	}
	.day-icon {
		display: block;
		width: var(--icon);
		height: var(--icon);
		/* full only: settle the pair a touch right of centre */
		transform: translateX(calc(var(--day-icon-nudge) * var(--k)));
	}
	/* The night icon sits beside the day icon (slightly low, like a companion)
	   and melts away completely when compact so the day icon re-centers. */
	.night-icon {
		display: block;
		width: calc(var(--icon) * 0.55 * var(--rel));
		height: calc(var(--icon) * 0.55 * var(--rel));
		opacity: var(--rel);
		margin-left: calc(-4px * var(--rel));
		margin-bottom: calc(-4px * var(--rel));
		transform: translateX(calc(-1 * var(--night-icon-nudge) * var(--k)));
	}
	/* weekday centered when full, pushed to the edges when compact */
	.dow-row {
		font-size: calc(var(--dow-font-min) + (var(--dow-font-full) - var(--dow-font-min)) * var(--k));
	}
	.dow-spacer {
		/* keep some outer share when compact so weekday + date sit near-centered
		   with a modest gap instead of being pushed to the cell edges */
		flex-grow: calc(0.6 + 0.4 * var(--rel));
	}
	.dow-mid {
		flex-grow: calc(1 - var(--rel));
	}
	.date-inline {
		overflow: hidden;
		/* width 0 while the cards are full so the weekday stays exactly centered */
		width: calc(14px * (1 - var(--rel)));
		opacity: calc(1 - var(--rel));
	}
	.rel-label {
		font-size: calc(var(--rel-font-min) + (var(--rel-font-full) - var(--rel-font-min)) * var(--k));
		opacity: var(--rel);
		max-height: calc(14px * var(--rel));
	}
	.detail-row {
		opacity: var(--detail);
		max-height: calc(52px * var(--detail));
	}
	.temp-max {
		font-size: calc(
			var(--tmax-font-min) + (var(--tmax-font-full) - var(--tmax-font-min)) * var(--k)
		);
		padding-inline: calc(
			var(--tmax-padx-min) + (var(--tmax-padx-full) - var(--tmax-padx-min)) * var(--k)
		);
		padding-block: calc(2px + 1px * var(--k));
		/* full: line up under the day icon */
		transform: translateX(calc(var(--tmax-nudge) * var(--k)));
	}
	.temp-min {
		font-size: calc(
			var(--tmin-font-min) + (var(--tmin-font-full) - var(--tmin-font-min)) * var(--k)
		);
		/* full: line up under the night icon */
		transform: translateX(calc(var(--tmin-nudge) * var(--k)));
	}

	.daystrip :global(.overflow-x-auto) {
		scrollbar-width: none;
	}
</style>
