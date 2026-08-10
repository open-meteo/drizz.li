/**
 * Turns a day's hourly forecast into a short written summary - the kind of
 * sentence a person would actually say about the weather, rather than another
 * table of numbers. Everything is derived from the same data the charts plot,
 * so the wording can never disagree with them.
 *
 * Every sentence is a whole message, not a string built from glued-together
 * fragments: word order, prepositions and agreement differ per language, so
 * each locale owns its full sentence and only receives the values.
 */
import { formatZoned } from '$lib/utils/date';

import * as m from '$lib/paraglide/messages';

import {
	type WeatherUnits,
	getPrecipUnit,
	getTempUnit,
	getWindDirectionLabel,
	getWindUnit
} from './types';

import type { WeekDailyData, WeekHourlyData } from '$lib/services/weather';

/** Broad condition families, ordered from calmest to most disruptive. */
type Category = 'clear' | 'fair' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder';

const CATEGORY_RANK: Record<Category, number> = {
	clear: 0,
	fair: 1,
	cloudy: 2,
	fog: 3,
	drizzle: 4,
	rain: 5,
	snow: 6,
	thunder: 7
};

const CATEGORY_MESSAGE: Record<Category, () => string> = {
	clear: m.cond_clear,
	fair: m.cond_fair,
	cloudy: m.cond_cloudy,
	fog: m.cond_fog,
	drizzle: m.cond_drizzle,
	rain: m.cond_rain,
	snow: m.cond_snow,
	thunder: m.cond_thunder
};

/** WMO weather code → condition family. */
function categoryOf(code: number): Category {
	if (code >= 95) return 'thunder';
	if (code >= 85) return 'snow';
	if (code >= 80) return 'rain'; // rain showers
	if (code >= 71) return 'snow';
	if (code >= 66) return 'snow'; // freezing rain reads as wintry
	if (code >= 61) return 'rain';
	if (code >= 51) return 'drizzle';
	if (code >= 45) return 'fog';
	if (code === 3) return 'cloudy';
	if (code === 1 || code === 2) return 'fair';
	return 'clear';
}

interface Period {
	message: () => string;
	/** Inclusive start hour, exclusive end hour (local). */
	from: number;
	to: number;
}

const PERIODS: Period[] = [
	{ message: m.period_overnight, from: 0, to: 6 },
	{ message: m.period_morning, from: 6, to: 12 },
	{ message: m.period_afternoon, from: 12, to: 18 },
	{ message: m.period_evening, from: 18, to: 24 }
];

export interface NarrativeInput {
	hourly: WeekHourlyData;
	hourlyDates: Date[];
	daily: WeekDailyData;
	dailyDates: Date[];
	timezone: string;
	/** The day being described. */
	day: Date;
	units: WeatherUnits;
}

const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** Indices of the hourly samples that fall on `day`, in the location's zone. */
function hoursOfDay(dates: Date[], day: Date, timezone: string): number[] {
	const key = formatZoned(day, timezone, 'yyyy-MM-dd');
	const out: number[] = [];
	for (let i = 0; i < dates.length; i++) {
		if (formatZoned(dates[i], timezone, 'yyyy-MM-dd') === key) out.push(i);
	}
	return out;
}

/** The family that best characterises a stretch of hours. */
function dominantCategory(codes: number[]): Category | null {
	if (codes.length === 0) return null;
	const counts = new Map<Category, number>();
	for (const code of codes) {
		if (!finite(code)) continue;
		const cat = categoryOf(code);
		counts.set(cat, (counts.get(cat) ?? 0) + 1);
	}
	if (counts.size === 0) return null;

	// A third of the window under a disruptive sky is what the day is "about",
	// even when calmer hours outnumber it.
	let best: Category | null = null;
	for (const [cat, n] of counts) {
		if (n / codes.length < 0.34 && CATEGORY_RANK[cat] < CATEGORY_RANK.drizzle) continue;
		if (!best) best = cat;
		else if (CATEGORY_RANK[cat] > CATEGORY_RANK[best]) best = cat;
		else if (CATEGORY_RANK[cat] === CATEGORY_RANK[best] && n > (counts.get(best) ?? 0)) best = cat;
	}
	if (best) return best;

	let mode: Category = 'clear';
	let modeCount = -1;
	for (const [cat, n] of counts) {
		if (n > modeCount) {
			mode = cat;
			modeCount = n;
		}
	}
	return mode;
}

function capitalise(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Stable pseudo-random pick. The same day always reads the same way (so the
 * text doesn't churn on every re-render) while different days get different
 * phrasings - that variety is what stops the summary sounding like a template.
 */
function seedFrom(key: string): number {
	let h = 2166136261;
	for (let i = 0; i < key.length; i++) {
		h ^= key.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return Math.abs(h);
}

function pick<T>(variants: T[], seed: number, salt: number): T {
	return variants[(seed + salt) % variants.length];
}

/**
 * Builds the summary as a list of sentences (the caller renders them as one
 * paragraph). Returns an empty list when the day has no usable data.
 */
export function buildDayNarrative(input: NarrativeInput): string[] {
	const { hourly, hourlyDates, daily, dailyDates, timezone, day, units } = input;

	const idx = hoursOfDay(hourlyDates, day, timezone);
	if (idx.length === 0) return [];

	const dayIndex = dailyDates.findIndex(
		(d) => formatZoned(d, timezone, 'yyyy-MM-dd') === formatZoned(day, timezone, 'yyyy-MM-dd')
	);

	const tempUnit = getTempUnit(units);
	const windUnit = getWindUnit(units);
	const precipUnit = getPrecipUnit(units);
	const at = (arr: number[] | undefined, i: number) => (arr ? arr[i] : undefined);
	const hourOf = (i: number) => Number(formatZoned(hourlyDates[i], timezone, 'H'));
	const temp = (v: number) => `${v.toFixed(0)}${tempUnit}`;
	const speed = (v: number) => `${v.toFixed(0)} ${windUnit}`;

	// one seed per day, so the wording is stable for a given day but varies
	// from one day (and one place) to the next
	const seed = seedFrom(formatZoned(day, timezone, 'yyyy-MM-dd') + timezone);

	const SKY_ALL = [m.sky_all_1, m.sky_all_2, m.sky_all_3];
	const SKY_TWO = [m.sky_two_1, m.sky_two_2, m.sky_two_3];
	const SKY_THREE = [m.sky_three_1, m.sky_three_2, m.sky_three_3];
	const TEMP = [m.temp_1, m.temp_2, m.temp_3];
	const TEMP_FEELS = [m.temp_feels_1, m.temp_feels_2, m.temp_feels_3];
	const PRECIP_WINDOW = [m.precip_window_1, m.precip_window_2, m.precip_window_3];
	const PRECIP_SPREAD = [m.precip_spread_1, m.precip_spread_2, m.precip_spread_3];
	const PRECIP_CHANCE = [m.precip_chance_1, m.precip_chance_2, m.precip_chance_3];
	const PRECIP_DRY = [m.precip_dry_1, m.precip_dry_2, m.precip_dry_3];
	const WIND_DIR = [m.wind_dir_1, m.wind_dir_2, m.wind_dir_3];
	const WIND_DIR_GUSTS = [m.wind_dir_gusts_1, m.wind_dir_gusts_2, m.wind_dir_gusts_3];
	const WIND = [m.wind_1, m.wind_2, m.wind_3];
	const WIND_GUSTS = [m.wind_gusts_1, m.wind_gusts_2, m.wind_gusts_3];
	const CALM = [m.calm_1, m.calm_2, m.calm_3];
	const UV = [m.uv_1, m.uv_2, m.uv_3];

	// each fact becomes its own sentence; the order of the middle three varies
	let sky: string | null = null;
	let temperature: string | null = null;
	// always set by the branch below, so no initial value to overwrite
	let precipitation: string;
	let wind: string | null = null;
	let ultraviolet: string | null = null;

	// ─── How the sky behaves through the day ────────────────────────────────────
	const segments: { period: Period; category: Category }[] = [];
	for (const period of PERIODS) {
		const inPeriod = idx.filter((i) => {
			const h = hourOf(i);
			return h >= period.from && h < period.to;
		});
		if (inPeriod.length < 2) continue;
		const cat = dominantCategory(inPeriod.map((i) => hourly.weather_code?.[i]).filter(finite));
		if (cat) segments.push({ period, category: cat });
	}

	if (segments.length > 0) {
		// collapse neighbouring periods that share a description
		const runs: { period: Period; category: Category }[] = [];
		for (const seg of segments) {
			const last = runs[runs.length - 1];
			if (!last || last.category !== seg.category) runs.push(seg);
		}
		const phrase = (r: { category: Category }) => CATEGORY_MESSAGE[r.category]();

		if (runs.length === 1) {
			sky = capitalise(pick(SKY_ALL, seed, 0)({ condition: phrase(runs[0]) }));
		} else if (runs.length === 2) {
			sky = capitalise(
				pick(
					SKY_TWO,
					seed,
					1
				)({
					c1: phrase(runs[0]),
					p1: runs[0].period.message(),
					c2: phrase(runs[1]),
					p2: runs[1].period.message()
				})
			);
		} else {
			// Four clauses is a mouthful: keep the opening, the first change and
			// where the day ends up.
			const kept = [runs[0], runs[1], runs[runs.length - 1]];
			sky = capitalise(
				pick(
					SKY_THREE,
					seed,
					2
				)({
					c1: phrase(kept[0]),
					p1: kept[0].period.message(),
					c2: phrase(kept[1]),
					p2: kept[1].period.message(),
					c3: phrase(kept[2]),
					p3: kept[2].period.message()
				})
			);
		}
	}

	// ─── Temperature ────────────────────────────────────────────────────────────
	const temps = idx.map((i) => hourly.temperature_2m?.[i]).filter(finite);
	if (temps.length > 0) {
		const high = Math.max(...temps);
		const low = Math.min(...temps);
		const feels = idx.map((i) => hourly.apparent_temperature?.[i]).filter(finite);
		const feelsHigh = feels.length > 0 ? Math.max(...feels) : null;
		temperature =
			feelsHigh != null && Math.abs(feelsHigh - high) >= 3
				? pick(TEMP_FEELS, seed, 3)({ high: temp(high), low: temp(low), feels: temp(feelsHigh) })
				: pick(TEMP, seed, 4)({ high: temp(high), low: temp(low) });
	}

	// ─── Precipitation ──────────────────────────────────────────────────────────
	const total = idx
		.map((i) => hourly.precipitation?.[i])
		.filter(finite)
		.reduce((a, b) => a + b, 0);
	const probs = idx.map((i) => hourly.precipitation_probability?.[i]).filter(finite);
	const peakProb = probs.length > 0 ? Math.max(...probs) : 0;
	const wetThreshold = precipUnit === 'in' ? 0.004 : 0.1;

	if (total >= wetThreshold) {
		// name the window carrying most of the total
		let bestPeriod: Period | null = null;
		let bestAmount = 0;
		for (const period of PERIODS) {
			const amount = idx
				.filter((i) => hourOf(i) >= period.from && hourOf(i) < period.to)
				.map((i) => hourly.precipitation?.[i])
				.filter(finite)
				.reduce((a, b) => a + b, 0);
			if (amount > bestAmount) {
				bestAmount = amount;
				bestPeriod = period;
			}
		}
		const amount = `${total.toFixed(total < 10 ? 1 : 0)} ${precipUnit}`;
		precipitation =
			bestPeriod && bestAmount / total >= 0.5
				? pick(PRECIP_WINDOW, seed, 5)({ amount, when: bestPeriod.message() })
				: pick(PRECIP_SPREAD, seed, 6)({ amount });
	} else if (peakProb >= 30) {
		precipitation = pick(PRECIP_CHANCE, seed, 7)({ percent: Math.round(peakProb) });
	} else {
		precipitation = pick(PRECIP_DRY, seed, 8)();
	}

	// ─── Wind ───────────────────────────────────────────────────────────────────
	const winds = idx.map((i) => hourly.windspeed_10m?.[i]).filter(finite);
	if (winds.length > 0) {
		const maxWind = Math.max(...winds);
		const dir = dayIndex >= 0 ? at(daily.winddirection_10m_dominant, dayIndex) : undefined;
		const gusts = idx.map((i) => hourly.wind_gusts_10m?.[i]).filter(finite);
		const maxGust = gusts.length > 0 ? Math.max(...gusts) : 0;
		const gusty = maxGust > maxWind * 1.4;
		// below ~5 km/h (or the equivalent in other units) there is nothing to say
		const calm = maxWind < (windUnit === 'm/s' ? 1.5 : windUnit === 'kn' ? 3 : 5);

		if (calm && !gusty) {
			wind = pick(CALM, seed, 9)();
		} else if (finite(dir)) {
			const direction = getWindDirectionLabel(dir);
			wind = gusty
				? pick(
						WIND_DIR_GUSTS,
						seed,
						10
					)({
						direction,
						speed: speed(maxWind),
						gust: speed(maxGust)
					})
				: pick(WIND_DIR, seed, 11)({ direction, speed: speed(maxWind) });
		} else {
			wind = gusty
				? pick(WIND_GUSTS, seed, 12)({ speed: speed(maxWind), gust: speed(maxGust) })
				: pick(WIND, seed, 13)({ speed: speed(maxWind) });
		}
	}

	// ─── UV ─────────────────────────────────────────────────────────────────────
	const uv = dayIndex >= 0 ? at(daily.uv_index_max, dayIndex) : undefined;
	if (finite(uv) && uv >= 6) {
		ultraviolet = pick(UV, seed, 14)({ value: uv.toFixed(0), label: uvLabel(uv).toLowerCase() });
	}

	// Position varies too: the sky always opens and any UV warning always closes,
	// but which of temperature, rain and wind comes next rotates per day.
	const ORDERS = [
		[temperature, precipitation, wind],
		[precipitation, temperature, wind],
		[temperature, wind, precipitation],
		[wind, temperature, precipitation]
	];
	const middle = pick(ORDERS, seed, 15);

	return [sky, ...middle, ultraviolet].filter((s): s is string => s != null && s.length > 0);
}

/** WHO exposure category for a UV index value. */
export function uvLabel(uv: number): string {
	if (uv < 3) return m.uv_low();
	if (uv < 6) return m.uv_moderate();
	if (uv < 8) return m.uv_high();
	if (uv < 11) return m.uv_very_high();
	return m.uv_extreme();
}

/** Tailwind text colour matching the WHO UV bands. */
export function uvColorClass(uv: number): string {
	if (uv < 3) return 'text-emerald-600 dark:text-emerald-400';
	if (uv < 6) return 'text-amber-600 dark:text-amber-400';
	if (uv < 8) return 'text-orange-600 dark:text-orange-400';
	if (uv < 11) return 'text-red-600 dark:text-red-400';
	return 'text-fuchsia-600 dark:text-fuchsia-400';
}

/** Name of the lunar phase for a 0-1 fraction (0 and 1 are new moon). */
export function moonPhaseName(phase: number): string {
	const p = ((phase % 1) + 1) % 1;
	if (p < 0.03 || p >= 0.97) return m.moon_new();
	if (p < 0.22) return m.moon_waxing_crescent();
	if (p < 0.28) return m.moon_first_quarter();
	if (p < 0.47) return m.moon_waxing_gibbous();
	if (p < 0.53) return m.moon_full();
	if (p < 0.72) return m.moon_waning_gibbous();
	if (p < 0.78) return m.moon_last_quarter();
	return m.moon_waning_crescent();
}

/** Illuminated fraction of the disc, 0 at new moon and 1 at full. */
export function moonIllumination(phase: number): number {
	const p = ((phase % 1) + 1) % 1;
	return (1 - Math.cos(2 * Math.PI * p)) / 2;
}
