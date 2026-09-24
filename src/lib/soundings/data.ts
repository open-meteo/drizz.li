import { Variable } from '@openmeteo/sdk/variable';

import type { SoundingForecastResult, SoundingLevel } from './profile';
import type { WeatherApiResponse } from '@openmeteo/sdk/weather-api-response';

const FIELDS: Partial<Record<Variable, keyof Omit<SoundingLevel, 'pressure'>>> = {
	[Variable.temperature]: 'temperature',
	[Variable.dew_point]: 'dewpoint',
	[Variable.wind_speed]: 'windSpeed',
	[Variable.wind_direction]: 'windDirection',
	[Variable.cloud_cover]: 'cloudCover',
	[Variable.geopotential_height]: 'height'
};

export function decodeSounding(
	response: WeatherApiResponse,
	requestedLevels: readonly number[],
	timezone: string
): SoundingForecastResult {
	const hourly = response.hourly();
	const result: SoundingForecastResult = {
		timezone: response.timezone() || timezone,
		elevation: response.elevation(),
		profiles: []
	};
	if (!hourly || hourly.interval() <= 0) return result;
	const start = Number(hourly.time());
	const end = Number(hourly.timeEnd());
	const count = Math.max(0, Math.ceil((end - start) / hourly.interval()));
	const levels = new Map<number, Partial<Record<keyof SoundingLevel, Float32Array>>>();
	let surfacePressure: Float32Array | null = null;
	let surfaceTemperature: Float32Array | null = null;
	let surfaceDewpoint: Float32Array | null = null;
	for (let i = 0; i < hourly.variablesLength(); i++) {
		const variable = hourly.variables(i);
		if (!variable) continue;
		const values = variable.valuesArray();
		if (!values) continue;
		const pressure = variable.pressureLevel();
		if (pressure > 0) {
			const field = FIELDS[variable.variable()];
			if (!field) continue;
			const fields = levels.get(pressure) ?? {};
			fields[field] = values;
			levels.set(pressure, fields);
		} else if (variable.variable() === Variable.surface_pressure) {
			surfacePressure = values;
		} else if (variable.altitude() === 2) {
			if (variable.variable() === Variable.temperature) surfaceTemperature = values;
			if (variable.variable() === Variable.dew_point) surfaceDewpoint = values;
		}
	}
	const pressureLevels = [...new Set([...requestedLevels, ...levels.keys()])].sort((a, b) => b - a);
	const at = (values: Float32Array | null | undefined, index: number) => {
		const value = values?.[index];
		return value != null && Number.isFinite(value) ? value : NaN;
	};
	result.profiles = Array.from({ length: count }, (_, i) => ({
		time: (start + i * hourly.interval()) * 1000,
		surfacePressure: at(surfacePressure, i),
		surfaceTemperature: at(surfaceTemperature, i),
		surfaceDewpoint: at(surfaceDewpoint, i),
		levels: pressureLevels.map((pressure) => {
			const fields = levels.get(pressure);
			return {
				pressure,
				temperature: at(fields?.temperature, i),
				dewpoint: at(fields?.dewpoint, i),
				height: at(fields?.height, i),
				windSpeed: at(fields?.windSpeed, i),
				windDirection: at(fields?.windDirection, i),
				cloudCover: at(fields?.cloudCover, i)
			};
		})
	}));
	return result;
}
