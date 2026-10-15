import { describe, expect, it } from 'vitest';

import { surfaceParcel } from './parcel';
import { interpolateLevel } from './profile';
import { inverseSaturationVaporPressure, saturationVaporPressure } from './thermo';

import type { SoundingProfile } from './profile';

// Published example sounding and reference CAPE (4830.746 J/kg):
// https://unidata.github.io/MetPy/latest/api/generated/metpy.calc.cape_cin.html
const pressures = [
	1008, 1000, 950, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200, 175,
	150, 125, 100, 80, 70, 60, 50, 40, 30, 25, 20
];
const temperatures = [
	29.3, 28.1, 23.5, 20.9, 18.4, 15.9, 13.1, 10.1, 6.7, 3.1, -0.5, -4.5, -9, -14.8, -21.5, -29.7,
	-40, -52.4, -59.2, -66.5, -74.1, -78.5, -76, -71.6, -66.7, -61.3, -56.3, -51.7, -50.7, -47.5
];
const humidity = [
	0.85, 0.65, 0.36, 0.39, 0.82, 0.72, 0.75, 0.86, 0.65, 0.22, 0.52, 0.66, 0.64, 0.2, 0.05, 0.75,
	0.76, 0.45, 0.25, 0.48, 0.76, 0.88, 0.56, 0.88, 0.39, 0.67, 0.15, 0.04, 0.94, 0.35
];
function sounding(): SoundingProfile {
	const levels = pressures.map((pressure, i) => ({
		pressure,
		temperature: temperatures[i],
		dewpoint: inverseSaturationVaporPressure(
			saturationVaporPressure(temperatures[i]) * humidity[i]
		),
		height: NaN,
		windSpeed: NaN,
		windDirection: NaN,
		cloudCover: NaN
	}));
	return {
		time: 0,
		surfacePressure: pressures[0],
		surfaceTemperature: levels[0].temperature,
		surfaceDewpoint: levels[0].dewpoint,
		levels
	};
}

describe('surface parcel buoyancy', () => {
	it('bounds the surface fill by the plotted model trace, not a synthetic 2 m anchor', () => {
		const profile = sounding();
		profile.surfacePressure = 975;
		profile.surfaceTemperature = 30;
		profile.surfaceDewpoint = 10;
		const result = surfaceParcel(profile, NaN);
		expect(result.display.points[0].parcel).toBe(30);
		expect(result.display.points[0].environment).toBeCloseTo(
			interpolateLevel(profile.levels, 975)!.temperature,
			9
		);
		const surfaceArea = result.display.areas.find((area) => area.bottom.pressure === 975);
		expect(surfaceArea?.kind).toBe('subcloud');
		for (const area of result.display.areas) {
			for (const point of [area.bottom, area.top]) {
				expect(point.pressure).toBeLessThanOrEqual(975);
				expect(point.environment).toBeCloseTo(
					interpolateLevel(profile.levels, point.pressure)!.temperature,
					8
				);
			}
		}
	});
	it('does not invent a shaded boundary when the temperature trace does not reach the surface', () => {
		const profile = sounding();
		profile.levels = profile.levels.filter((level) => level.pressure <= 950);
		const result = surfaceParcel(profile, NaN);
		expect(result.display.points[0].parcel).toBe(profile.surfaceTemperature);
		expect(result.display.points[0].environment).toBeNaN();
		for (const area of result.display.areas) expect(area.bottom.pressure).toBeLessThanOrEqual(950);
	});
	it('shades dry thermals without a moist LFC or adding to CAPE', () => {
		const profile = sounding();
		profile.surfaceTemperature = 30;
		profile.surfaceDewpoint = -10;
		profile.levels = profile.levels.map((level) => ({
			...level,
			temperature: level.pressure === 950 ? 20 : 30,
			dewpoint: -20
		}));
		const result = surfaceParcel(profile, NaN);
		expect(result.lfc).toBeNull();
		expect(result.cape).toBe(0);
		expect(result.cin).toBeNull();
		expect(result.areas).toEqual([]);
		const shaded = result.display.areas.filter((area) => area.kind === 'subcloud');
		expect(shaded.length).toBeGreaterThan(0);
		for (const area of shaded) {
			expect(area.bottom.pressure).toBeLessThanOrEqual(profile.surfacePressure);
			for (const point of [area.bottom, area.top])
				expect(point.parcel - point.environment).toBeGreaterThanOrEqual(-1e-9);
		}
	});
	it('ends sub-cloud shading at saturation, with none for a saturated surface', () => {
		const profile = sounding();
		const result = surfaceParcel(profile, NaN);
		const subcloud = result.display.areas.filter((area) => area.kind === 'subcloud');
		expect(subcloud.length).toBeGreaterThan(0);
		const cape = result.display.areas.filter((area) => area.kind === 'cape');
		expect(cape.length).toBeGreaterThan(0);
		expect(Math.min(...subcloud.map((area) => area.top.pressure))).toBeGreaterThanOrEqual(
			Math.max(...cape.map((area) => area.bottom.pressure))
		);
		profile.surfaceDewpoint = profile.surfaceTemperature;
		expect(surfaceParcel(profile, NaN).display.areas.some((area) => area.kind === 'subcloud')).toBe(
			false
		);
	});
	it('starts the traditional path at actual surface temperature and shades its own crossings', () => {
		const profile = sounding();
		profile.levels[1].temperature = 32;
		profile.levels[2].temperature = 30;
		const result = surfaceParcel(profile, NaN);
		expect(result.display.points[0].parcel).toBe(profile.surfaceTemperature);
		expect(result.display.points[0].environment).toBe(profile.surfaceTemperature);
		expect(result.points[0].parcel).toBeGreaterThan(result.display.points[0].parcel);
		expect(result.display.areas.some((area) => area.kind === 'cape')).toBe(true);
		expect(result.display.areas.some((area) => area.kind === 'cin')).toBe(true);
		for (const area of result.display.areas) {
			for (const point of [area.bottom, area.top]) {
				const difference = point.parcel - point.environment;
				expect(area.kind !== 'cin' ? difference >= -1e-9 : difference <= 1e-9).toBe(true);
			}
		}
	});
	it('agrees with the published reference within 5% for the liquid-water approximation', () => {
		const result = surfaceParcel(sounding(), NaN);
		expect(result.status).toBe('complete');
		expect(result.cape).toBeGreaterThan(4830.746 * 0.95);
		expect(result.cape).toBeLessThan(4830.746 * 1.05);
		expect(result.cin).toBeCloseTo(0);
		expect(result.areas.some((area) => area.kind === 'cape')).toBe(true);
	});
	it('calculates negative CIN beneath a capped parcel and splits crossings', () => {
		const profile = sounding();
		profile.levels[1].temperature = 32;
		profile.levels[2].temperature = 30;
		const result = surfaceParcel(profile, NaN);
		expect(result.status).toBe('complete');
		expect(result.cin).toBeLessThan(0);
		expect(result.cape).toBeGreaterThan(0);
		for (const area of result.areas) {
			const differences = [area.bottom, area.top].map((point) => point.parcel - point.environment);
			expect(
				differences.every((delta) => (area.kind === 'cape' ? delta >= -1e-9 : delta <= 1e-9))
			).toBe(true);
			if (area.kind === 'cin') expect(area.top.pressure).toBeGreaterThanOrEqual(result.lfc!);
		}
	});
	it('does not let below-ground samples affect the parcel or shade below its origin', () => {
		const profile = sounding();
		const original = surfaceParcel(profile, 500);
		profile.levels.unshift({
			...profile.levels[0],
			pressure: 1050,
			temperature: 100,
			dewpoint: 80,
			height: 100
		});
		expect(surfaceParcel(profile, 500)).toEqual(original);
		expect(original.points.every((point) => point.pressure <= profile.surfacePressure)).toBe(true);
	});
	it('reports missing surface data and internal gaps without bridging them', () => {
		const profile = sounding();
		expect(surfaceParcel({ ...profile, surfaceDewpoint: NaN }, NaN).status).toBe('unavailable');
		profile.levels[10].dewpoint = NaN;
		const partial = surfaceParcel(profile, NaN);
		expect(partial.status).toBe('incomplete');
		expect(partial.cape).toBeNull();
		expect(partial.cin).toBeNull();
		expect(partial.points.at(-1)!.pressure).toBe(600);
	});
	it('does not present truncated profiles as zero energy', () => {
		const profile = sounding();
		profile.levels = profile.levels.filter((level) => level.pressure >= 300);
		const partial = surfaceParcel(profile, NaN);
		expect(partial.status).toBe('incomplete');
		expect(partial.cape).toBeNull();
		expect(partial.areas.length).toBeGreaterThan(0);
	});
	it('distinguishes a stable column from unavailable data and undefined CIN', () => {
		const profile = sounding();
		profile.surfaceTemperature = 15;
		profile.surfaceDewpoint = 5;
		profile.levels = profile.levels.map((level) => ({ ...level, temperature: 15, dewpoint: 5 }));
		const stable = surfaceParcel(profile, NaN);
		expect(stable.status).toBe('complete');
		expect(stable.cape).toBe(0);
		expect(stable.cin).toBeNull();
		expect(stable.lfc).toBeNull();
		expect(stable.areas).toEqual([]);
	});
});
