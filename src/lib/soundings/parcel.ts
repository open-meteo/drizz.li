import { interpolateLevel } from './profile';
import { EPS, RD, dryTemperature, moistLapseRate, saturationVaporPressure } from './thermo';

import type { SoundingProfile } from './profile';

export interface ParcelPoint {
	pressure: number;
	/** Temperatures in Celsius; virtual for diagnostics, actual for display. */
	environment: number;
	parcel: number;
}
export interface ParcelArea {
	kind: 'cape' | 'cin';
	bottom: ParcelPoint;
	top: ParcelPoint;
}
export type ParcelDisplayArea = Omit<ParcelArea, 'kind'> & { kind: 'cape' | 'cin' | 'subcloud' };
export interface ParcelDiagnostics {
	status: 'complete' | 'incomplete' | 'unavailable';
	cape: number | null;
	/** Negative inhibition energy; undefined if there is no LFC. */
	cin: number | null;
	lfc: number | null;
	points: ParcelPoint[];
	areas: ParcelArea[];
	display: { points: ParcelPoint[]; areas: ParcelDisplayArea[] };
}

function mixingRatio(dewpoint: number, pressure: number) {
	const e = saturationVaporPressure(dewpoint);
	return e > 0 && e < pressure ? (EPS * e) / (pressure - e) : NaN;
}

function virtualTemperature(temperature: number, ratio: number) {
	return ((temperature + 273.15) * (1 + ratio / EPS)) / (1 + ratio) - 273.15;
}

function valid(temperature: number, dewpoint: number, pressure: number) {
	return (
		Number.isFinite(temperature) &&
		temperature > -273.15 &&
		Number.isFinite(dewpoint) &&
		dewpoint > -273.15 &&
		dewpoint <= temperature &&
		Number.isFinite(mixingRatio(dewpoint, pressure))
	);
}

/**
 * Surface-based, pseudoadiabatic liquid-water parcel. Below saturation conserve
 * mixing ratio and potential temperature; above saturation remove condensate.
 * Integrate Rd ΔTv d ln(p), splitting sign changes in log pressure.
 * https://unidata.github.io/MetPy/latest/api/generated/metpy.calc.cape_cin.html
 * CAPE includes positive areas above the first LFC at/above saturation; CIN
 * includes negative areas below it. Stable layers above the LFC are not CIN.
 * Require a contiguous profile through 100 hPa with closed buoyancy aloft for
 * complete totals. Never bridge a missing T/Td sample or extrapolate above data.
 */
export function surfaceParcel(profile: SoundingProfile, elevation: number): ParcelDiagnostics {
	const empty: ParcelDiagnostics = {
		status: 'unavailable',
		cape: null,
		cin: null,
		lfc: null,
		points: [],
		areas: [],
		display: { points: [], areas: [] }
	};
	const p0 = profile.surfacePressure,
		t0 = profile.surfaceTemperature,
		td0 = profile.surfaceDewpoint;
	if (!(p0 > 0) || !Number.isFinite(p0) || !valid(t0, td0, p0)) return empty;
	const ratio = mixingRatio(td0, p0);
	// Find saturation along the dry adiabat, using the same vapour-pressure law
	// as the ascent. A saturated starting parcel has its LCL at the surface.
	let low = 1,
		high = p0;
	for (let i = 0; i < 60; i++) {
		const p = (low + high) / 2;
		if (mixingRatio(dryTemperature(t0, p0, p), p) > ratio) high = p;
		else low = p;
	}
	const lcl = td0 === t0 ? p0 : (low + high) / 2;
	const levels = profile.levels
		.filter(
			(level) =>
				level.pressure > 0 &&
				level.pressure < p0 &&
				!(Number.isFinite(elevation) && Number.isFinite(level.height) && level.height < elevation)
		)
		.toSorted((a, b) => b.pressure - a.pressure);
	const points: ParcelPoint[] = [
		{
			pressure: p0,
			environment: virtualTemperature(t0, ratio),
			parcel: virtualTemperature(t0, ratio)
		}
	];
	// Match the rendered pressure-level trace, which does not pass through the
	// separate 2 m surface marker. Interpolation may use its below-ground segment
	// to locate the boundary at p0, but no shaded point is below p0. Missing trace
	// coverage stays NaN so we never invent an environmental line to shade against.
	const plottedTemperature = (pressure: number) =>
		interpolateLevel(profile.levels, pressure)?.temperature ?? NaN;
	const actual: ParcelPoint[] = [{ pressure: p0, environment: plottedTemperature(p0), parcel: t0 }];
	let previous = { pressure: p0, temperature: t0, dewpoint: td0 };
	let parcelT = t0;
	let broken = false;
	for (const level of levels) {
		if (level.pressure === previous.pressure) continue;
		if (!valid(level.temperature, level.dewpoint, level.pressure)) {
			broken = true;
			break;
		}
		let p = previous.pressure;
		while (p > level.pressure) {
			const nextP = Math.max(level.pressure, p - 2, p > lcl ? lcl : 0);
			if (p > lcl) parcelT = dryTemperature(t0, p0, nextP);
			else {
				const step = nextP - p;
				const mid = parcelT + (moistLapseRate(parcelT, p) * step) / 2;
				parcelT += moistLapseRate(mid, p + step / 2) * step;
			}
			const fraction =
				Math.log(nextP / previous.pressure) / Math.log(level.pressure / previous.pressure);
			const t = previous.temperature + fraction * (level.temperature - previous.temperature);
			const td = previous.dewpoint + fraction * (level.dewpoint - previous.dewpoint);
			const point = {
				pressure: nextP,
				environment: virtualTemperature(t, mixingRatio(td, nextP)),
				parcel: virtualTemperature(parcelT, nextP >= lcl ? ratio : mixingRatio(parcelT, nextP))
			};
			if (!Number.isFinite(point.environment) || !Number.isFinite(point.parcel))
				return { ...empty, status: 'incomplete', points, display: { points: actual, areas: [] } };
			actual.push({ pressure: nextP, environment: plottedTemperature(nextP), parcel: parcelT });
			points.push(point);
			p = nextP;
		}
		previous = level;
	}
	if (points.length < 2)
		return { ...empty, status: 'incomplete', points, display: { points: actual, areas: [] } };
	const { split, lfc, cape, cin, areas } = integrateAreas(points, lcl);
	const display = integrateAreas(actual, lcl);
	// The integration steps include the LCL exactly. Classify only the positive
	// actual-temperature segments below it, independently of any moist LFC.
	const displayAreas: ParcelDisplayArea[] = [...display.areas];
	for (let i = 1; i < display.split.length; i++) {
		const bottom = display.split[i - 1],
			top = display.split[i];
		if (
			top.pressure >= lcl &&
			(bottom.parcel - bottom.environment + top.parcel - top.environment) / 2 > 1e-8
		)
			displayAreas.push({ kind: 'subcloud', bottom, top });
	}
	const top = split[split.length - 1];
	const complete = !broken && top.pressure <= 100 && top.parcel <= top.environment + 1e-8;
	return {
		status: complete ? 'complete' : 'incomplete',
		cape: complete ? cape : null,
		cin: complete && lfc !== null ? cin : null,
		lfc,
		points: split,
		display: { points: display.split, areas: displayAreas },
		areas
	};
}

/** Split and classify each temperature representation independently. */
function integrateAreas(points: ParcelPoint[], lcl: number) {
	// Insert exact linear-in-log-pressure intersections before integrating and
	// shading, so narrow sign changes cannot be painted with the wrong sign.
	const split: ParcelPoint[] = [points[0]];
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1],
			b = points[i];
		const da = a.parcel - a.environment,
			db = b.parcel - b.environment;
		if (da * db < 0) {
			const f = da / (da - db);
			const t = a.environment + f * (b.environment - a.environment);
			split.push({
				pressure: Math.exp(Math.log(a.pressure) + f * Math.log(b.pressure / a.pressure)),
				environment: t,
				parcel: t
			});
		}
		split.push(b);
	}
	let lfc: number | null = null;
	for (let i = 1; i < split.length; i++) {
		const a = split[i - 1],
			b = split[i];
		if (
			a.pressure <= lcl + 1e-6 &&
			(a.parcel - a.environment + b.parcel - b.environment) / 2 > 1e-8
		) {
			lfc = a.pressure;
			break;
		}
	}
	const areas: ParcelArea[] = [];
	let cape = 0,
		cin = 0;
	for (let i = 1; i < split.length; i++) {
		const a = split[i - 1],
			b = split[i];
		const delta = (a.parcel - a.environment + b.parcel - b.environment) / 2;
		const energy = RD * delta * Math.log(a.pressure / b.pressure);
		if (lfc !== null && a.pressure <= lfc && energy > 1e-8) {
			cape += energy;
			areas.push({ kind: 'cape', bottom: a, top: b });
		} else if (lfc !== null && b.pressure >= lfc && energy < -1e-8) {
			cin += energy;
			areas.push({ kind: 'cin', bottom: a, top: b });
		}
	}
	return { split, lfc, cape, cin, areas };
}
