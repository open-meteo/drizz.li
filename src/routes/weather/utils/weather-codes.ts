import * as m from '$lib/paraglide/messages';

const weatherCodes: Record<number, string> = {
	0: 'clear',
	1: 'clear',
	2: 'cloudy',
	3: 'overcast',
	4: 'fog',
	5: 'fog',
	10: 'fog',
	11: 'fog',
	12: 'lightning',
	18: 'strong-wind',
	20: 'fog',
	21: 'rain-mix',
	22: 'rain-mix',
	23: 'rain',
	24: 'snow',
	25: 'hail',
	26: 'thunderstorm',
	27: 'dust',
	28: 'dust',
	29: 'dust',
	30: 'fog',
	31: 'fog',
	32: 'fog',
	33: 'fog',
	34: 'fog',
	35: 'fog',
	40: 'rain-mix',
	41: 'sprinkle',
	42: 'rain',
	43: 'sprinkle',
	44: 'rain',
	45: 'fog',
	46: 'hail',
	47: 'snow',
	48: 'fog',
	50: 'sprinkle',
	51: 'sprinkle',
	52: 'rain',
	53: 'sprinkle',
	54: 'sprinkle',
	55: 'rain',
	56: 'rain-mix',
	57: 'rain-mix',
	58: 'rain',
	60: 'sprinkle',
	61: 'sprinkle',
	62: 'rain',
	63: 'rain',
	64: 'hail',
	65: 'rain',
	66: 'rain-mix',
	67: 'rain-mix',
	68: 'rain-mix',
	70: 'snow',
	71: 'snow',
	72: 'snow',
	73: 'snow',
	74: 'snow',
	75: 'snow',
	76: 'snow',
	77: 'snow',
	78: 'snow',
	80: 'showers',
	81: 'showers',
	82: 'rain',
	83: 'rain',
	84: 'storm-showers',
	85: 'snow',
	86: 'snow',
	87: 'rain-mix',
	89: 'hail',
	90: 'lightning',
	91: 'storm-showers',
	92: 'thunderstorm',
	93: 'thunderstorm',
	94: 'lightning',
	95: 'thunderstorm',
	96: 'thunderstorm',
	99: 'storm-showers'
};

// Conditions that ship as a single neutral glyph (no day/night variant). The
// file is not always wi-<name>: 'overcast' uses the flat cloud, which keeps it
// distinct from 'cloudy' (code 2), whose glyph carries a sun or moon.
const NEUTRAL_ICONS: Record<string, string> = {
	'snowflake-cold': 'wi-snowflake-cold',
	'strong-wind': 'wi-strong-wind',
	dust: 'wi-dust',
	tornado: 'wi-tornado',
	overcast: 'wi-cloudy'
};

export function hasWeatherIcon(code: unknown): code is number {
	return (
		typeof code === 'number' &&
		Number.isFinite(code) &&
		Object.prototype.hasOwnProperty.call(weatherCodes, code)
	);
}

export function getWeatherIconName(code: number, daytime: boolean): string {
	const name = weatherCodes[code as keyof typeof weatherCodes] ?? 'clear';
	const neutral = NEUTRAL_ICONS[name];
	if (neutral) return neutral;
	return `wi-${daytime ? 'day' : 'night'}-${name}`;
}

// Plain-language name for each code open-meteo actually emits (WMO 4677 subset),
// used as the hover title on the pictograms. A glyph alone is ambiguous - the
// hail-thunderstorm swirl in particular reads as something far more dramatic
// than "thunderstorm with heavy hail".
const WMO_DESCRIPTIONS: Record<number, () => string> = {
	0: m.wmo_0,
	1: m.wmo_1,
	2: m.wmo_2,
	3: m.wmo_3,
	45: m.wmo_45,
	48: m.wmo_48,
	51: m.wmo_51,
	53: m.wmo_53,
	55: m.wmo_55,
	56: m.wmo_56,
	57: m.wmo_57,
	61: m.wmo_61,
	63: m.wmo_63,
	65: m.wmo_65,
	66: m.wmo_66,
	67: m.wmo_67,
	71: m.wmo_71,
	73: m.wmo_73,
	75: m.wmo_75,
	77: m.wmo_77,
	80: m.wmo_80,
	81: m.wmo_81,
	82: m.wmo_82,
	85: m.wmo_85,
	86: m.wmo_86,
	95: m.wmo_95,
	96: m.wmo_96,
	99: m.wmo_99
};

/** Localized condition text for a weather code; '' for codes we have no name for. */
export function getWeatherDescription(code: number | null | undefined): string {
	if (code == null || !Number.isFinite(code)) return '';
	return WMO_DESCRIPTIONS[code]?.() ?? '';
}

// ─── Local day/night weather codes ──────────────────────────────────────────
// Open-meteo's daily weather_code is a plain numeric max over all 24 hourly
// codes (VariableDaily.swift: `.max(.weathercode)`) — there is no day/night
// split in the API, and numeric max has known flaws: one foggy hour wins the
// whole day (open-meteo issue #228), "slight showers" (80) outranks "heavy
// rain" (65), one overcast hour beats a mostly-clear day. The aggregation
// below derives a separate code for the daylight hours (sunrise→sunset) and
// the following night (sunset→next sunrise), ranking hazards by group first
// (thunder > freezing > snow > rain > drizzle) and picking the most frequent
// intensity within the winning group, with a persistence rule for fog and a
// mean (not max) for plain sky states.

// Only the code subset open-meteo actually emits (WeatherCode.swift) matters here.
const THUNDER = new Set([95, 96, 99]);
const FREEZING = new Set([56, 57, 66, 67]);
const SNOW = new Set([71, 73, 75, 77, 85, 86]);
const RAIN = new Set([61, 63, 65, 80, 81, 82]);
const DRIZZLE = new Set([51, 53, 55]);
const FOG = new Set([45, 48]);

// Showers / snow grains count as the same intensity as their steady
// counterparts when breaking frequency ties (fixes 80 "outranking" 65).
const INTENSITY_EQUIV: Record<number, number> = { 80: 61, 81: 63, 82: 65, 77: 71, 85: 71, 86: 75 };

/**
 * Most frequent code; ties go to the more intense (then higher) code, or with
 * `preferLower` to the least intense one.
 *
 * Thunder is the one group that ties downwards. Within it the code only
 * describes how much hail comes with the storm, and letting the worst of them
 * win a coin-flip tie is how a single hour of 99 used to brand a whole day as
 * the most extreme thing on the scale. Elsewhere the heavier code winning a tie
 * is the point (heavy rain over slight showers).
 */
function modeWithHighTiebreak(codes: number[], preferLower = false): number {
	const counts = new Map<number, number>();
	for (const c of codes) counts.set(c, (counts.get(c) ?? 0) + 1);
	let best = codes[0];
	let bestCount = -1;
	for (const [code, count] of counts) {
		const intensity = INTENSITY_EQUIV[code] ?? code;
		const bestIntensity = INTENSITY_EQUIV[best] ?? best;
		const winsTie = preferLower
			? intensity < bestIntensity || (intensity === bestIntensity && code < best)
			: intensity > bestIntensity || (intensity === bestIntensity && code > best);
		if (count > bestCount || (count === bestCount && winsTie)) {
			best = code;
			bestCount = count;
		}
	}
	return best;
}

/** Aggregates one daypart's hourly codes into a single representative code. */
function daypartCode(codes: number[]): number | null {
	const hours = codes.filter((c) => Number.isFinite(c));
	const n = hours.length;
	if (n === 0) return null;

	// Hazards, worst group first: a single hour is enough to lead the icon
	// (open-meteo's "don't hide hazards" philosophy, kept per-group).
	for (const group of [THUNDER, FREEZING, SNOW, RAIN, DRIZZLE]) {
		const hits = hours.filter((c) => group.has(c));
		if (hits.length > 0) return modeWithHighTiebreak(hits, group === THUNDER);
	}

	// Fog needs persistence (≥2h and ≥¼ of the daypart) so one misty hour at
	// dawn doesn't brand the whole day — the issue #228 complaint.
	const fogHits = hours.filter((c) => FOG.has(c));
	if (fogHits.length >= Math.max(2, Math.ceil(n / 4))) return modeWithHighTiebreak(fogHits);

	// Sky states: mean, not max — one overcast hour shouldn't win. Short fog
	// spells below the threshold count as overcast (3).
	const sky = hours.map((c) => (FOG.has(c) ? 3 : c)).filter((c) => c >= 0 && c <= 3);
	if (sky.length === 0) return null;
	const mean = sky.reduce((a, b) => a + b, 0) / sky.length;
	return Math.min(3, Math.max(0, Math.round(mean)));
}

export interface DayNightWeatherCodes {
	/** Per daily index: code for sunrise→sunset, or null if no hourly data fell in the window. */
	day: (number | null)[];
	/** Per daily index: code for sunset→next sunrise (the night following that day). */
	night: (number | null)[];
}

/**
 * Splits hourly weather codes into per-day daylight and following-night
 * buckets using the API's own sunrise/sunset timestamps, and aggregates each
 * bucket. Timestamps share the response's epoch basis (hourly in ms, daily
 * sunrise/sunset in seconds).
 */
export function computeDayNightWeatherCodes(
	hourlyTimestampsMs: number[],
	hourlyWeatherCodes: number[],
	sunriseSec: number[],
	sunsetSec: number[]
): DayNightWeatherCodes {
	const days = sunriseSec.length;
	const day: (number | null)[] = new Array(days).fill(null);
	const night: (number | null)[] = new Array(days).fill(null);
	if (hourlyWeatherCodes.length === 0) return { day, night };

	for (let i = 0; i < days; i++) {
		const rise = sunriseSec[i];
		const set = sunsetSec[i];
		if (!rise || !set || set <= rise) continue; // missing / polar edge cases
		const nightEnd = sunriseSec[i + 1] || Infinity; // last day: whatever hours remain

		const dayCodes: number[] = [];
		const nightCodes: number[] = [];
		for (let h = 0; h < hourlyTimestampsMs.length; h++) {
			const t = hourlyTimestampsMs[h] / 1000;
			if (t >= rise && t < set) dayCodes.push(hourlyWeatherCodes[h]);
			else if (t >= set && t < nightEnd) nightCodes.push(hourlyWeatherCodes[h]);
		}
		day[i] = daypartCode(dayCodes);
		night[i] = daypartCode(nightCodes);
	}
	return { day, night };
}

export default weatherCodes;
