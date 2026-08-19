import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	computeDayNightWeatherCodes,
	describedWeatherCodes,
	getWeatherDescription,
	getWeatherIconName,
	iconWeatherCodes
} from './weather-codes';

const ICON_DIR = join(process.cwd(), 'static/images/weather-icons');

// The codes open-meteo actually emits (WMO 4677 subset), with the family each
// one belongs to. The icon mapping used to be built for a different code table,
// which is how fog ended up showing hail and a hail thunderstorm a tornado -
// mismatches nothing in the type system could catch.
const OPEN_METEO_CODES: Record<number, { meaning: string; family: RegExp }> = {
	0: { meaning: 'Clear sky', family: /clear/ },
	1: { meaning: 'Mainly clear', family: /clear|cloudy/ },
	2: { meaning: 'Partly cloudy', family: /cloudy/ },
	3: { meaning: 'Overcast', family: /cloudy/ },
	45: { meaning: 'Fog', family: /fog/ },
	48: { meaning: 'Depositing rime fog', family: /fog/ },
	51: { meaning: 'Light drizzle', family: /sprinkle|showers/ },
	53: { meaning: 'Moderate drizzle', family: /sprinkle|rain/ },
	55: { meaning: 'Dense drizzle', family: /sprinkle|rain/ },
	56: { meaning: 'Light freezing drizzle', family: /rain-mix|sleet/ },
	57: { meaning: 'Dense freezing drizzle', family: /rain-mix|sleet/ },
	61: { meaning: 'Slight rain', family: /rain|sprinkle|showers/ },
	63: { meaning: 'Moderate rain', family: /rain/ },
	65: { meaning: 'Heavy rain', family: /rain/ },
	66: { meaning: 'Light freezing rain', family: /rain-mix|sleet/ },
	67: { meaning: 'Heavy freezing rain', family: /rain-mix|sleet/ },
	71: { meaning: 'Slight snowfall', family: /snow/ },
	73: { meaning: 'Moderate snowfall', family: /snow/ },
	75: { meaning: 'Heavy snowfall', family: /snow/ },
	77: { meaning: 'Snow grains', family: /snow/ },
	80: { meaning: 'Slight rain showers', family: /showers|rain/ },
	81: { meaning: 'Moderate rain showers', family: /showers|rain/ },
	82: { meaning: 'Violent rain showers', family: /showers|rain/ },
	85: { meaning: 'Slight snow showers', family: /snow/ },
	86: { meaning: 'Heavy snow showers', family: /snow/ },
	95: { meaning: 'Thunderstorm', family: /thunderstorm|storm-showers|lightning/ },
	96: { meaning: 'Thunderstorm with slight hail', family: /thunderstorm|storm-showers|hail/ },
	97: { meaning: 'Heavy thunderstorm', family: /thunderstorm|storm-showers|lightning/ },
	99: { meaning: 'Thunderstorm with heavy hail', family: /thunderstorm|storm-showers|hail/ }
};

const codes = Object.keys(OPEN_METEO_CODES).map(Number);

// Pin both maps to exactly the emitted set, in both directions: a code the API
// gains but we miss fails here, and so does a stale entry for a code it never
// emits (the full-4677 leftovers that caused the original glyph bugs).
describe('code coverage', () => {
	it('maps icons for exactly the codes open-meteo emits', () => {
		expect([...iconWeatherCodes].sort((a, b) => a - b)).toEqual(codes);
	});

	it('describes exactly the codes open-meteo emits', () => {
		expect([...describedWeatherCodes].sort((a, b) => a - b)).toEqual(codes);
	});
});

describe('getWeatherIconName', () => {
	it.each(codes)('code %i resolves to icon files that exist', (code) => {
		for (const daytime of [true, false]) {
			const name = getWeatherIconName(code, daytime);
			expect(existsSync(join(ICON_DIR, `${name}.svg`)), `${name}.svg missing`).toBe(true);
		}
	});

	it.each(codes)('code %i uses a glyph that matches its meaning', (code) => {
		const { meaning, family } = OPEN_METEO_CODES[code];
		for (const daytime of [true, false]) {
			const name = getWeatherIconName(code, daytime);
			expect(name, `${code} (${meaning}) → ${name}`).toMatch(family);
		}
	});

	it('never shows a tornado: open-meteo has no tornado code', () => {
		const names = codes.flatMap((c) => [getWeatherIconName(c, true), getWeatherIconName(c, false)]);
		expect(names.some((n) => n.includes('tornado'))).toBe(false);
	});

	it('distinguishes overcast from partly cloudy', () => {
		expect(getWeatherIconName(3, true)).not.toBe(getWeatherIconName(2, true));
	});

	it('falls back to a clear glyph for codes it does not know', () => {
		expect(getWeatherIconName(12345, true)).toBe('wi-day-clear');
	});
});

describe('getWeatherDescription', () => {
	it.each(codes)('code %i has a description', (code) => {
		expect(getWeatherDescription(code).length).toBeGreaterThan(0);
	});

	it('returns nothing for unknown or missing codes', () => {
		expect(getWeatherDescription(12345)).toBe('');
		expect(getWeatherDescription(null)).toBe('');
		expect(getWeatherDescription(undefined)).toBe('');
		expect(getWeatherDescription(NaN)).toBe('');
	});
});

describe('daily aggregation', () => {
	const DAY = 24 * 3600;
	// One synthetic day: sunrise 06:00, sunset 20:00, hourly codes from 00:00.
	const hourly = (codes: number[]) => codes.map((_, i) => i * 3600 * 1000);
	const run = (hourCodes: number[]) =>
		computeDayNightWeatherCodes(hourly(hourCodes), hourCodes, [6 * 3600], [20 * 3600]).day[0];

	const mostlyClear = (overrides: Record<number, number>) =>
		Array.from({ length: DAY / 3600 }, (_, h) => overrides[h] ?? 0);

	it('lets a single thundery hour lead the day, as before', () => {
		expect(run(mostlyClear({ 18: 95 }))).toBe(95);
	});

	it('picks the plain thunderstorm when a lone 99 ties with a 95', () => {
		// the reported case: one hour of 99 next to one hour of 95 used to escalate
		// the whole day card to the most extreme code on the scale
		expect(run(mostlyClear({ 18: 99, 19: 95 }))).toBe(95);
	});

	it('still shows 99 when it is the only thunder code', () => {
		expect(run(mostlyClear({ 18: 99 }))).toBe(99);
	});

	it('follows frequency before severity within thunder', () => {
		expect(run(mostlyClear({ 15: 99, 16: 99, 17: 95 }))).toBe(99);
	});

	it('keeps preferring the heavier code on a tie outside thunder', () => {
		// 65 (heavy rain) over 80 (slight showers) - the open-meteo max-code flaw
		expect(run(mostlyClear({ 12: 65, 13: 80 }))).toBe(65);
	});

	it('does not let one foggy hour brand the day', () => {
		expect(run(mostlyClear({ 7: 45 }))).toBe(0);
	});
});
