// Adapted from terraputix/meteo-fly (GPL-3.0).
// https://github.com/terraputix/meteo-fly/blob/main/src/lib/meteo/thermo.ts
// SPDX-License-Identifier: GPL-3.0-only
export const RD = 287.058;
export const CP = 1004;
export const EPS = 0.622;
const LV = 2.5e6;

export function saturationVaporPressure(t: number): number {
	return 6.112 * Math.exp((17.67 * t) / (t + 243.5));
}

export function inverseSaturationVaporPressure(e: number): number {
	return (243.5 * Math.log(e / 6.112)) / (17.67 - Math.log(e / 6.112));
}

export function moistLapseRate(t: number, p: number): number {
	const kelvin = t + 273.15;
	const e = saturationVaporPressure(t);
	const rs = (EPS * e) / Math.max(p - e, 0.1);
	const latent = (LV * rs) / (RD * kelvin);
	return (((RD * kelvin) / (CP * p)) * (1 + latent)) / (1 + (latent * EPS * LV) / (CP * kelvin));
}

export function dryTemperature(t: number, fromPressure: number, toPressure: number): number {
	return (t + 273.15) * Math.pow(toPressure / fromPressure, RD / CP) - 273.15;
}

export function moistAdiabat(
	t: number,
	fromPressure: number,
	toPressure: number
): [number, number][] {
	const points: [number, number][] = [[t, fromPressure]];
	let p = fromPressure;
	while (p > toPressure) {
		const step = -Math.min(2, p - toPressure);
		const midT = t + (moistLapseRate(t, p) * step) / 2;
		t += moistLapseRate(midT, p + step / 2) * step;
		p += step;
		points.push([t, p]);
	}
	return points;
}
