import { describe, expect, it } from 'vitest';

import { defaultUnits } from '$lib/stores/settings';

import { models } from '../../routes/weather/options';
import { SOUNDING_MODELS, SURFACE_ONLY_MODELS, soundingModel } from './models';
import {
	addDays,
	clampDay,
	interpolateLevel,
	isPlottable,
	pressureAtHeight,
	temperatureDisplay,
	windDisplay
} from './profile';
import {
	buildLayout,
	fromCanvas,
	renderSelection,
	renderSounding,
	soundingChartSize,
	toCanvas
} from './renderer';
import {
	dryTemperature,
	inverseSaturationVaporPressure,
	moistAdiabat,
	saturationVaporPressure
} from './thermo';
import { soundingHours } from './time';

import type { SoundingLevel, SoundingProfile } from './profile';

const level = (pressure: number, height: number, temperature = 10): SoundingLevel => ({
	pressure,
	height,
	temperature,
	dewpoint: temperature - 5,
	windSpeed: 10,
	windDirection: 0,
	cloudCover: 50
});
const profile: SoundingProfile = {
	time: 0,
	surfacePressure: 950,
	surfaceTemperature: 15,
	surfaceDewpoint: 10,
	levels: [
		level(1000, 100),
		level(900, 1000),
		level(700, 3000, -5),
		level(500, 5600, -20),
		level(100, 16000, -65)
	]
};

describe('sounding profiles', () => {
	it('classifies every catalogue model without adding unknown IDs', () => {
		const classified = [...Object.keys(SOUNDING_MODELS), ...SURFACE_ONLY_MODELS];
		expect(classified.sort()).toEqual(models.map((model) => model.value).sort());
		expect(new Set(classified).size).toBe(classified.length);
		for (const capability of Object.values(SOUNDING_MODELS)) {
			expect(capability.forecastDays).toBeLessThanOrEqual(16);
			expect(
				capability.levels.every((p, i, levels) => p >= 100 && (i === 0 || p < levels[i - 1]))
			).toBe(true);
		}
		expect(soundingModel('__proto__')).toBe('best_match');
		expect(soundingModel('icon_d2')).toBe('icon_d2');
	});
	it('retains profiles below the model surface and tolerates missing optional fields', () => {
		expect(
			isPlottable({ ...profile, surfacePressure: 450, levels: profile.levels.slice(0, 2) })
		).toBe(true);
		expect(
			isPlottable({
				...profile,
				levels: profile.levels.map((l) => ({ ...l, windSpeed: NaN, dewpoint: NaN, height: NaN }))
			})
		).toBe(true);
		expect(isPlottable({ ...profile, levels: [profile.levels[0]] })).toBe(false);
	});
	it('interpolates in log pressure without bridging missing fields or extrapolating', () => {
		const levels = [level(900, 1000, 10), level(700, 3000, 0)];
		const p = Math.sqrt(900 * 700);
		expect(interpolateLevel(levels, p)?.temperature).toBeCloseTo(5);
		expect(interpolateLevel(levels, p)?.height).toBeCloseTo(2000);
		expect(pressureAtHeight(levels, 2000)).toBeCloseTo(p);
		expect(interpolateLevel(levels, 950)).toBeNull();
		expect(pressureAtHeight(levels, 4000)).toBeNaN();
		levels[1].dewpoint = NaN;
		expect(interpolateLevel(levels, p)?.dewpoint).toBeNaN();
	});
	it('interpolates wind across north using vector components', () => {
		const levels = [
			{ ...level(900, 1000), windDirection: 350 },
			{ ...level(700, 3000), windDirection: 10 }
		];
		const interpolated = interpolateLevel(levels, Math.sqrt(900 * 700))!;
		expect(Math.min(interpolated.windDirection, 360 - interpolated.windDirection)).toBeCloseTo(0);
		expect(interpolated.windSpeed).toBeCloseTo(10 * Math.cos(Math.PI / 18));
	});
	it('round trips full-depth skew coordinates and handles high terrain', () => {
		const layout = buildLayout(profile, 500, 100, 600, 600)!;
		for (const [t, p] of [
			[-65, 100],
			[-20, 500],
			[15, 950]
		]) {
			const [x, y] = toCanvas(layout, t, p);
			const actual = fromCanvas(layout, x, y);
			expect(actual.temperature).toBeCloseTo(t);
			expect(actual.pressure).toBeCloseTo(p);
		}
		expect(
			buildLayout({ ...profile, surfacePressure: 650 }, 4000, 700, 320, 600)?.minPressure
		).toBe(700);
	});
	it('shades below the surface while retaining trace markers and inspection there', () => {
		const sample = {
			...profile,
			surfacePressure: 650,
			surfaceTemperature: NaN,
			surfaceDewpoint: NaN,
			levels: [
				{ ...level(900, 1000, 0), dewpoint: NaN },
				{ ...level(700, 3000, NaN), dewpoint: -6 },
				level(500, 5500, -20)
			]
		};
		const arcs: number[][] = [];
		const fills: number[][] = [];
		const labels: string[] = [];
		const ctx = new Proxy(
			{},
			{
				get: (_, key) => {
					if (key === 'arc') return (...args: number[]) => arcs.push(args);
					if (key === 'fillRect') return (...args: number[]) => fills.push(args);
					if (key === 'fillText') return (text: string) => labels.push(text);
					if (key === 'measureText') return (text: string) => ({ width: text.length * 6 });
					return () => {};
				},
				set: () => true
			}
		) as CanvasRenderingContext2D;
		const layout = buildLayout(sample, 4000, 100, 600, 600)!;
		expect(layout.maxPressure).toBe(1050);
		renderSounding(
			ctx,
			sample,
			4000,
			layout,
			600,
			600,
			{ background: '#fff', foreground: '#111', grid: '#ddd', muted: '#777' },
			defaultUnits,
			{ wind: 'Wind', surface: 'Surface', temperatureUnit: '°C', windUnit: 'km/h' }
		);
		const surfaceY = toCanvas(layout, 0, 650)[1];
		expect(fills).toContainEqual([
			layout.left,
			surfaceY,
			layout.width,
			layout.top + layout.height - surfaceY
		]);
		expect(labels.some((text) => text.includes('LCL'))).toBe(false);

		expect(arcs).toHaveLength(4);
		for (const [temperature, pressure] of [
			[0, 900],
			[-6, 700],
			[-20, 500],
			[-25, 500]
		]) {
			const [x, y] = toCanvas(layout, temperature, pressure);
			expect(arcs.some((arc) => arc[0] === x && arc[1] === y && arc[2] === 2.5)).toBe(true);
		}
		renderSelection(
			ctx,
			layout,
			{ temperature: 0, pressure: 900 },
			{ background: '#fff', foreground: '#111', grid: '#ddd', muted: '#777' },
			sample,
			4000,
			defaultUnits
		);
		expect(labels).toContain('T 0.0°C');
	});

	it('keeps inset labels inside the canvas and reveals narrow-chart wind values on inspection', () => {
		const sample = {
			...profile,
			levels: profile.levels.map((level) => ({ ...level, windSpeed: 7.25 }))
		};
		const palette = { background: '#fff', foreground: '#111', grid: '#ddd', muted: '#777' };
		for (const width of [360, 600]) {
			const labels: Array<{ text: string; x: number; y: number; align: string }> = [];
			const state: Record<string | symbol, unknown> = {};
			let windArrows = 0;
			const ctx = new Proxy(
				{},
				{
					get: (_, key) =>
						key === 'translate'
							? () => {
									windArrows++;
								}
							: key === 'measureText'
								? (text: string) => ({ width: text.length * 6 })
								: key === 'fillText'
									? (text: string, x: number, y: number) =>
											labels.push({ text, x, y, align: String(state.textAlign) })
									: () => {},
					set: (_, key, value) => {
						state[key] = value;
						return true;
					}
				}
			) as CanvasRenderingContext2D;
			const layout = buildLayout(sample, 500, 100, width, 600)!;
			renderSounding(ctx, sample, 500, layout, width, 600, palette, defaultUnits, {
				wind: 'Wind',
				surface: 'Surface',
				temperatureUnit: '°C',
				windUnit: 'km/h'
			});
			expect(labels.some((label) => label.text === '26')).toBe(width >= 496);
			expect(windArrows > 0).toBe(width >= 496);
			renderSelection(
				ctx,
				layout,
				{ temperature: 0, pressure: 700 },
				palette,
				sample,
				500,
				defaultUnits
			);
			expect(labels.some((label) => label.text === '26.1 km/h')).toBe(true);
			for (const label of labels) {
				const textWidth = label.text.length * 6;
				const left =
					label.x -
					(label.align === 'right' ? textWidth : label.align === 'center' ? textWidth / 2 : 0);
				expect(left).toBeGreaterThanOrEqual(0);
				expect(left + textWidth).toBeLessThanOrEqual(width);
				expect(label.y).toBeGreaterThan(0);
				expect(label.y).toBeLessThan(600);
			}
		}
		const size = soundingChartSize(1000, 800);
		const layout = buildLayout(profile, 500, 100, size.width, size.height)!;
		expect(layout.width / layout.height).toBeCloseTo(484 / 511);
		expect(size.height).toBeCloseTo(800);
	});

	it('holds the axes steady across profiles in the selected day', () => {
		const warm = {
			...profile,
			surfacePressure: 970,
			levels: profile.levels.map((l) => ({ ...l, temperature: l.temperature + 15 }))
		};
		const day = [profile, warm];
		expect(buildLayout(profile, 500, 100, 600, 600, day)).toEqual(
			buildLayout(warm, 500, 100, 600, 600, day)
		);
	});
	it('labels actual trace intersections and omits labels across missing data', () => {
		const labels: string[] = [];
		const ctx = new Proxy(
			{},
			{
				get: (_, key) =>
					key === 'measureText'
						? (text: string) => ({ width: text.length * 6 })
						: key === 'fillText'
							? (text: string) => labels.push(text)
							: () => {},
				set: () => true
			}
		) as CanvasRenderingContext2D;
		const layout = buildLayout(profile, 500, 100, 600, 600)!;
		const selection = { temperature: 3, pressure: Math.sqrt(900 * 700) };
		const palette = { background: '#fff', foreground: '#111', grid: '#ddd', muted: '#777' };
		renderSelection(ctx, layout, selection, palette, profile, 500, defaultUnits);
		expect(labels).toContain('T 2.5°C');
		expect(labels).toContain('Td -2.5°C');
		expect(labels).toContain('2000 m');
		expect(labels.some((text) => text.includes('g/kg'))).toBe(true);
		labels.length = 0;
		const missing = { ...profile, levels: profile.levels.map((l) => ({ ...l, dewpoint: NaN })) };
		renderSelection(ctx, layout, selection, palette, missing, 500, defaultUnits);
		expect(labels.some((text) => text.startsWith('Td '))).toBe(false);
		expect(labels).toContain('T 2.5°C');
	});

	it('converts display units without changing physical inputs', () => {
		const imperial = {
			...defaultUnits,
			temperature_unit: 'fahrenheit',
			wind_speed_unit: 'kn'
		} as const;
		expect(temperatureDisplay(0, imperial)).toBe(32);
		expect(windDisplay(10, defaultUnits)).toBe(36);
		expect(windDisplay(10, imperial)).toBeCloseTo(19.438444924);
		expect(temperatureDisplay(NaN, imperial)).toBeNaN();
	});
	it('keeps actual hourly instants across short and long local days', () => {
		const spring = soundingHours('2026-03-29', 'Europe/Berlin');
		const autumn = soundingHours('2026-10-25', 'Europe/Berlin');
		expect(spring).toHaveLength(23);
		expect(autumn).toHaveLength(25);
		expect(new Set(autumn).size).toBe(25);
		expect(autumn.every((time, i) => i === 0 || time - autumn[i - 1] === 3600000)).toBe(true);
	});

	it('bounds dates and uses calendar days across DST and year boundaries', () => {
		expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
		expect(addDays('2026-10-25', -1)).toBe('2026-10-24');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(clampDay('2027-01-20', '2026-12-31', 3)).toBe('2027-01-02');
	});
});

describe('thermodynamic guides', () => {
	it('inverts saturation pressure', () => {
		for (const t of [-60, -20, 0, 30])
			expect(inverseSaturationVaporPressure(saturationVaporPressure(t))).toBeCloseTo(t);
	});
	it('preserves dry potential temperature and moist ascent warms relative to dry ascent', () => {
		const dry = dryTemperature(20, 1000, 700);
		expect(dry).toBeCloseTo(-8.42, 1);
		expect(dryTemperature(dry, 700, 1000)).toBeCloseTo(20);
		const moist = moistAdiabat(20, 1000, 100);
		expect(moist[0]).toEqual([20, 1000]);
		expect(moist.at(-1)![1]).toBe(100);
		expect(moist.every(([t]) => Number.isFinite(t))).toBe(true);
		expect(moist.find(([, p]) => p === 700)![0]).toBeGreaterThan(dry);
	});
});
