import { Variable } from '@openmeteo/sdk/variable';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchSoundingForecast } from '$lib/services/weather';

import { decodeSounding } from './data';

import type { WeatherApiResponse } from '@openmeteo/sdk/weather-api-response';

const { fetchWeatherApi } = vi.hoisted(() => ({ fetchWeatherApi: vi.fn() }));
vi.mock('openmeteo', () => ({ fetchWeatherApi }));

function variable(id: Variable, pressure: number, values: number[], altitude = 0) {
	return {
		variable: () => id,
		pressureLevel: () => pressure,
		altitude: () => altitude,
		valuesArray: () => new Float32Array(values)
	};
}
function response(variables: ReturnType<typeof variable>[], hours = 3): WeatherApiResponse {
	return {
		timezone: () => 'Europe/Berlin',
		elevation: () => 500,
		hourly: () => ({
			time: () => 1792886400n,
			timeEnd: () => 1792886400n + BigInt(hours * 3600),
			interval: () => 3600,
			variablesLength: () => variables.length,
			variables: (i: number) => variables[i]
		})
	} as unknown as WeatherApiResponse;
}

describe('sounding decoding', () => {
	it('maps reordered variables by metadata and preserves gaps and short arrays', () => {
		const result = decodeSounding(
			response([
				variable(Variable.wind_speed, 700, [5, 6]),
				variable(Variable.temperature, 500, [-20, NaN, -18]),
				variable(Variable.temperature, 0, [15, 16, 17], 2),
				variable(Variable.temperature, 700, [-5, -4, -3]),
				variable(Variable.surface_pressure, 0, [950, 949, 948])
			]),
			[900, 700, 500],
			'UTC'
		);
		expect(result.profiles).toHaveLength(3);
		expect(result.profiles[0].levels.map((l) => l.pressure)).toEqual([900, 700, 500]);
		expect(result.profiles[0].levels[0].temperature).toBeNaN();
		expect(result.profiles[0].levels[1].windSpeed).toBe(5);
		expect(result.profiles[2].levels[1].windSpeed).toBeNaN();
		expect(result.profiles[1].levels[2].temperature).toBeNaN();
		expect(result.profiles[0].surfaceTemperature).toBe(15);
		expect(result.profiles[0].surfacePressure).toBe(950);
		expect(result.profiles[0].surfaceDewpoint).toBeNaN();
	});
	it('retains UTC instants over 23- and 25-hour days', () => {
		for (const hours of [23, 25]) {
			const result = decodeSounding(response([], hours), [500], 'UTC');
			expect(result.profiles).toHaveLength(hours);
			expect(result.profiles[1].time - result.profiles[0].time).toBe(3600000);
		}
	});
	it('returns an empty profile collection when the hourly block is absent', () => {
		const empty = response([]);
		empty.hourly = () => null;
		expect(decodeSounding(empty, [500], 'UTC').profiles).toEqual([]);
	});
});

describe('single-day sounding request', () => {
	afterEach(() => vi.useRealTimers());
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-23T12:00:00Z'));
		fetchWeatherApi.mockReset();
		fetchWeatherApi.mockResolvedValue([response([])]);
	});
	it('requests only the selected local day, without a discovery call', async () => {
		await fetchSoundingForecast({
			latitude: 47,
			longitude: 8,
			model: 'icon_d2',
			date: '2026-09-24',
			timezone: 'Europe/Zurich'
		});
		expect(fetchWeatherApi).toHaveBeenCalledTimes(1);
		const params = fetchWeatherApi.mock.calls[0][1];
		expect(params).toMatchObject({
			start_date: '2026-09-24',
			end_date: '2026-09-24',
			timezone: 'Europe/Zurich',
			wind_speed_unit: 'ms',
			elevation: 'nan'
		});
		expect(params).not.toHaveProperty('forecast_days');
		expect(params.hourly).toContain('temperature_200hPa');
		expect(params.hourly).not.toContain('temperature_100hPa');
	});
	it('requests the oldest retained day on the normal forecast endpoint', async () => {
		await fetchSoundingForecast({
			latitude: 47,
			longitude: 8,
			model: 'icon_global',
			date: '2026-09-16',
			timezone: 'Europe/Zurich'
		});
		expect(fetchWeatherApi).toHaveBeenCalledTimes(1);
		expect(fetchWeatherApi.mock.calls[0][0]).toBe('https://api.open-meteo.com/v1/forecast');
		expect(fetchWeatherApi.mock.calls[0][1]).toMatchObject({
			start_date: '2026-09-16',
			end_date: '2026-09-16',
			models: 'icon_global'
		});
	});
	it('keeps recent historical days on the live forecast endpoint', async () => {
		await fetchSoundingForecast({
			latitude: 47,
			longitude: 8,
			model: 'icon_global',
			date: '2026-09-22',
			timezone: 'Europe/Zurich'
		});
		expect(fetchWeatherApi).toHaveBeenCalledTimes(1);
		expect(fetchWeatherApi.mock.calls[0][0]).toBe('https://api.open-meteo.com/v1/forecast');
		expect(fetchWeatherApi.mock.calls[0][1]).toMatchObject({
			start_date: '2026-09-22',
			end_date: '2026-09-22'
		});
	});

	it('rejects invalid dates and unsupported models before requesting data', async () => {
		await expect(
			fetchSoundingForecast({ latitude: 0, longitude: 0, model: 'icon_d2', date: '2026-02-31' })
		).rejects.toThrow('Invalid sounding date');
		await expect(
			fetchSoundingForecast({ latitude: 0, longitude: 0, model: '__proto__', date: '2026-09-24' })
		).rejects.toThrow('Invalid sounding model');
		expect(fetchWeatherApi).not.toHaveBeenCalled();
	});
});
