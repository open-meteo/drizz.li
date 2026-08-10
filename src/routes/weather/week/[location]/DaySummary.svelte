<script lang="ts">
	import { formatZoned, getRelativeDayLabel } from '$lib/utils/date';

	import * as m from '$lib/paraglide/messages';

	import {
		buildDayNarrative,
		moonIllumination,
		moonPhaseName,
		uvColorClass,
		uvLabel
	} from './forecast-text';

	import type { FetchedDaily, FetchedHourly, WeatherUnits } from './types';

	interface Props {
		data: FetchedHourly;
		daily: FetchedDaily;
		selectedDay: Date;
		units: WeatherUnits;
	}

	let { data, daily, selectedDay, units }: Props = $props();

	const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

	let timezone = $derived(daily.timezone);
	let dayKey = $derived(formatZoned(selectedDay, timezone, 'yyyy-MM-dd'));
	let dayIndex = $derived(
		daily.dailyDates.findIndex((d) => formatZoned(d, timezone, 'yyyy-MM-dd') === dayKey)
	);
	let relLabel = $derived(getRelativeDayLabel(selectedDay, timezone));

	let sentences = $derived(
		buildDayNarrative({
			hourly: data.hourly,
			hourlyDates: data.hourlyDates,
			daily: daily.daily,
			dailyDates: daily.dailyDates,
			timezone,
			day: selectedDay,
			units
		})
	);

	const value = (arr: number[] | undefined, i: number): number | undefined =>
		arr && i >= 0 ? arr[i] : undefined;

	/** Unix seconds → local clock time; 0 means "never happens today". */
	const clock = (seconds: number | undefined): string | null =>
		finite(seconds) && seconds > 0
			? formatZoned(new Date(seconds * 1000), timezone, 'HH:mm')
			: null;

	let sunrise = $derived(clock(value(daily.daily.sunrise, dayIndex)));
	let sunset = $derived(clock(value(daily.daily.sunset, dayIndex)));
	let moonrise = $derived(clock(value(daily.daily.moonrise, dayIndex)));
	let moonset = $derived(clock(value(daily.daily.moonset, dayIndex)));
	let uv = $derived(value(daily.daily.uv_index_max, dayIndex));
	let phase = $derived(value(daily.daily.moon_phase, dayIndex));

	// Prefer the reported daylight duration; fall back to sunset − sunrise.
	let daylightSeconds = $derived.by(() => {
		const reported = value(daily.daily.daylight_duration, dayIndex);
		if (finite(reported) && reported > 0) return reported;
		const rise = value(daily.daily.sunrise, dayIndex);
		const set = value(daily.daily.sunset, dayIndex);
		return finite(rise) && finite(set) && set > rise ? set - rise : NaN;
	});
	let daylight = $derived.by(() => {
		if (!finite(daylightSeconds)) return null;
		const h = Math.floor(daylightSeconds / 3600);
		const min = Math.round((daylightSeconds % 3600) / 60);
		return m.daylight_hours({ hours: h, minutes: String(min).padStart(2, '0') });
	});

	let sunshine = $derived.by(() => {
		const s = value(daily.daily.sunshine_duration, dayIndex);
		if (!finite(s) || !finite(daylightSeconds) || daylightSeconds <= 0) return null;
		return Math.round((s / daylightSeconds) * 100);
	});

	// ─── Moon disc ──────────────────────────────────────────────────────────────
	// The terminator is an ellipse whose width tracks the phase: full circle at
	// new moon, flat at the quarters, and back out again towards full.
	const R = 9;
	let litPath = $derived.by(() => {
		if (!finite(phase)) return null;
		const p = ((phase % 1) + 1) % 1;
		const k = Math.cos(2 * Math.PI * p);
		const rx = Math.abs(k) * R;
		const waxing = p < 0.5;
		// outer edge of the lit half, then the terminator back to the top
		const outerSweep = waxing ? 1 : 0;
		const innerSweep = k >= 0 ? (waxing ? 0 : 1) : waxing ? 1 : 0;
		return `M 0 ${-R} A ${R} ${R} 0 0 ${outerSweep} 0 ${R} A ${rx} ${R} 0 0 ${innerSweep} 0 ${-R} Z`;
	});
	let illumination = $derived(finite(phase) ? Math.round(moonIllumination(phase) * 100) : null);

	// ─── Narrative clamp (phones only) ──────────────────────────────────────────
	// The narrative runs anywhere from two to nine lines depending on the day,
	// which on a phone means the whole page below it moves as soon as the data
	// lands. Below md the text is clamped to five lines and gets a toggle, and
	// the block reserves those five lines plus the toggle row whatever the
	// length - so the card is the same height before and after the fetch, and the
	// skeleton can match it exactly. From md up nothing is clamped.

	let expanded = $state(false);
	let textEl = $state<HTMLParagraphElement>();
	let overflows = $state(false);

	$effect(() => {
		void sentences; // re-measure when the day (and so the text) changes
		const el = textEl;
		if (!el || expanded) return; // measuring while open would always say "fits"

		const measure = () => {
			// only clamped below md, where the toggle is the only way to see the rest
			const clamped = window.matchMedia('(max-width: 767px)').matches;
			overflows = clamped && el.scrollHeight - el.clientHeight > 1;
		};
		measure();

		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	});
</script>

<section class="mt-6" aria-label={m.summary_heading()}>
	<!-- flush with the screen edges on phones, a contained card from md up -->
	<div
		class="-mx-3 overflow-hidden border-y border-border/70 bg-card shadow-sm md:mx-0 md:rounded-2xl md:border"
	>
		<div class="border-b border-border/70 bg-muted/40 px-4 py-2.5">
			<h3 class="text-base font-bold">
				{formatZoned(selectedDay, timezone, 'EEEE')}
				<span class="font-semibold text-muted-foreground">
					– {m.summary_heading()}{relLabel === formatZoned(selectedDay, timezone, 'EEEE')
						? ''
						: ` (${relLabel})`}
				</span>
			</h3>
		</div>

		<div class="grid gap-4 px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-6">
			<div class="narrative">
				{#if sentences.length > 0}
					<p
						bind:this={textEl}
						class="text-[15px] leading-relaxed text-foreground"
						class:clamped={!expanded}
					>
						{sentences.join(' ')}
					</p>
				{:else}
					<p class="text-[15px] leading-relaxed text-muted-foreground">
						{m.summary_no_data()}
					</p>
				{/if}

				<!-- Always occupies its row on phones, even when the text fits: a
				     toggle that appears only sometimes is itself a layout shift. -->
				<button
					type="button"
					class="toggle mt-1 cursor-pointer text-[13px] font-semibold text-primary hover:underline"
					class:invisible={!overflows && !expanded}
					aria-hidden={!overflows && !expanded}
					tabindex={!overflows && !expanded ? -1 : 0}
					aria-expanded={expanded}
					onclick={() => (expanded = !expanded)}
				>
					{expanded ? m.summary_read_less() : m.summary_read_more()}
				</button>
			</div>

			<!-- Sun, moon and UV: the numbers the sentence above deliberately leaves out -->
			<dl
				class="grid grid-cols-2 gap-x-5 gap-y-2.5 text-sm sm:grid-cols-3 lg:w-80 lg:grid-cols-2 lg:border-l lg:border-border/60 lg:pl-6"
			>
				{#if sunrise}
					<div>
						<dt class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
							{m.label_sunrise()}
						</dt>
						<dd class="font-semibold tabular-nums">{sunrise}</dd>
					</div>
				{/if}
				{#if sunset}
					<div>
						<dt class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
							{m.label_sunset()}
						</dt>
						<dd class="font-semibold tabular-nums">{sunset}</dd>
					</div>
				{/if}
				{#if daylight}
					<div>
						<dt class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
							{m.label_daylight()}
						</dt>
						<dd class="font-semibold tabular-nums">
							{daylight}
							{#if sunshine != null}
								<span class="font-medium text-muted-foreground"
									>· {m.sunshine_share({ percent: sunshine })}</span
								>
							{/if}
						</dd>
					</div>
				{/if}
				{#if finite(uv)}
					<div>
						<dt class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
							{m.label_uv_index()}
						</dt>
						<dd class="font-semibold tabular-nums">
							{uv.toFixed(1)}
							<span class="font-medium {uvColorClass(uv)}">{uvLabel(uv)}</span>
						</dd>
					</div>
				{/if}
				{#if moonrise}
					<div>
						<dt class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
							{m.label_moonrise()}
						</dt>
						<dd class="font-semibold tabular-nums">{moonrise}</dd>
					</div>
				{/if}
				{#if moonset}
					<div>
						<dt class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
							{m.label_moonset()}
						</dt>
						<dd class="font-semibold tabular-nums">{moonset}</dd>
					</div>
				{/if}
				{#if litPath}
					<div class="col-span-2 flex items-center gap-2.5 sm:col-span-3 lg:col-span-2">
						<svg
							class="h-6 w-6 shrink-0"
							viewBox="-12 -12 24 24"
							role="img"
							aria-label={moonPhaseName(phase!)}
						>
							<circle r={R} class="fill-muted-foreground/45" />
							<path d={litPath} class="fill-amber-200 dark:fill-amber-100" />
							<circle r={R} fill="none" class="stroke-border" stroke-width="0.75" />
						</svg>
						<div class="min-w-0">
							<div class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
								{m.label_moon()}
							</div>
							<div class="truncate font-semibold">
								{moonPhaseName(phase!)}
								{#if illumination != null}
									<span class="font-medium text-muted-foreground tabular-nums"
										>· {illumination}%</span
									>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</dl>
		</div>
	</div>
</section>

<style>
	/* Phones: exactly five lines, reserved whether the text is long or short, so
	   the card's height never depends on the forecast that lands. 15px text at
	   leading-relaxed (1.625) → 5 lines = 8.125em. */
	.clamped {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 5;
		line-clamp: 5;
		overflow: hidden;
	}

	.narrative p {
		min-height: 8.125em;
	}

	/* md and up: no clamp, no reserved height, no toggle. */
	@media (min-width: 768px) {
		.clamped {
			display: block;
			overflow: visible;
		}

		.narrative p {
			min-height: 0;
		}

		.toggle {
			display: none;
		}
	}
</style>
