import type { UnitPrefs } from '$lib/stores/settings';

export interface SoundingLevel {
	pressure: number;
	temperature: number;
	dewpoint: number;
	height: number;
	windSpeed: number;
	windDirection: number;
	cloudCover: number;
}

export interface SoundingProfile {
	time: number;
	levels: SoundingLevel[];
	surfacePressure: number;
	surfaceTemperature: number;
	surfaceDewpoint: number;
}

export interface SoundingForecastResult {
	timezone: string;
	elevation: number;
	profiles: SoundingProfile[];
}

export function isPlottable(profile: SoundingProfile): boolean {
	return profile.levels.filter((level) => Number.isFinite(level.temperature)).length >= 2;
}

export function interpolateLevel(levels: SoundingLevel[], pressure: number): SoundingLevel | null {
	const exact = levels.find((level) => level.pressure === pressure);
	if (exact) return exact;
	const i = levels.findIndex(
		(level, index) =>
			index > 0 && level.pressure < pressure && levels[index - 1].pressure > pressure
	);
	if (i < 1) return null;
	const low = levels[i - 1];
	const high = levels[i];
	const ratio = Math.log(pressure / low.pressure) / Math.log(high.pressure / low.pressure);
	const mix = (a: number, b: number) =>
		Number.isFinite(a) && Number.isFinite(b) ? a + ratio * (b - a) : NaN;
	const radians = Math.PI / 180;
	const u = mix(
		low.windSpeed * Math.sin(low.windDirection * radians),
		high.windSpeed * Math.sin(high.windDirection * radians)
	);
	const v = mix(
		low.windSpeed * Math.cos(low.windDirection * radians),
		high.windSpeed * Math.cos(high.windDirection * radians)
	);
	return {
		pressure,
		temperature: mix(low.temperature, high.temperature),
		dewpoint: mix(low.dewpoint, high.dewpoint),
		height: mix(low.height, high.height),
		cloudCover: mix(low.cloudCover, high.cloudCover),
		windSpeed: Math.hypot(u, v),
		windDirection: (Math.atan2(u, v) / radians + 360) % 360
	};
}

export function pressureAtHeight(levels: SoundingLevel[], height: number): number {
	for (let i = 0; i < levels.length; i++) {
		const low = levels[i];
		if (low.height === height) return low.pressure;
		const high = levels[i + 1];
		if (
			high &&
			Number.isFinite(low.height) &&
			Number.isFinite(high.height) &&
			high.height > low.height &&
			height >= low.height &&
			height <= high.height
		) {
			return Math.exp(
				Math.log(low.pressure) +
					((height - low.height) / (high.height - low.height)) *
						Math.log(high.pressure / low.pressure)
			);
		}
	}
	return NaN;
}

export const temperatureDisplay = (celsius: number, units: UnitPrefs) =>
	units.temperature_unit === 'fahrenheit' ? celsius * 1.8 + 32 : celsius;
export const temperatureUnit = (units: UnitPrefs) =>
	units.temperature_unit === 'fahrenheit' ? '°F' : '°C';
export const windDisplay = (ms: number, units: UnitPrefs) =>
	ms * { ms: 1, kmh: 3.6, mph: 2.2369362921, kn: 1.9438444924 }[units.wind_speed_unit];
export const windUnit = (units: UnitPrefs) =>
	({ ms: 'm/s', kmh: 'km/h', mph: 'mph', kn: 'kn' })[units.wind_speed_unit];
export const valueText = (value: number, digits = 1) =>
	Number.isFinite(value) ? value.toFixed(digits) : '—';

/** Calendar arithmetic deliberately avoids the browser's timezone and DST. */
export function addDays(day: string, count: number): string {
	const date = new Date(`${day}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + count);
	return date.toISOString().slice(0, 10);
}

export function clampDay(day: string, today: string, forecastDays: number): string {
	const last = addDays(today, forecastDays - 1);
	return day < today ? today : day > last ? last : day;
}
