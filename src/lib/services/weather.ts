/**
 * Weather Data Service
 *
 * Centralized, type-safe weather data fetching using the Open-Meteo SDK
 * with protobuf (FlatBuffers) transport for efficient data transfer.
 *
 * All weather data fetching flows through this service, providing:
 * - Type-safe request parameters and response structures
 * - Automatic retries with exponential backoff (via the SDK)
 * - Efficient binary protobuf transport instead of JSON
 * - Consistent timestamp and unit handling
 */
import { Model } from '@openmeteo/sdk/model';
import { Unit } from '@openmeteo/sdk/unit';
import { fetchWeatherApi } from 'openmeteo';

import { type DaylightBand, buildDaylightBands } from '$lib/charts/bands';
import * as m from '$lib/paraglide/messages';

import type { VariableWithValues } from '@openmeteo/sdk/variable-with-values';
import type { VariablesWithTime } from '@openmeteo/sdk/variables-with-time';

// ─── Constants ──────────────────────────────────────────────────────────────────

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const SEASONAL_URL = 'https://seasonal-api.open-meteo.com/v1/seasonal';

// ─── Core Helpers ───────────────────────────────────────────────────────────────

/**
 * Generates an array of numbers from start (inclusive) to stop (exclusive) with the given step.
 * Used to reconstruct timestamp arrays from the protobuf time/timeEnd/interval fields.
 */
export function range(start: number, stop: number, step: number): number[] {
	return Array.from(
		{ length: Math.max(0, Math.ceil((stop - start) / step)) },
		(_, i) => start + i * step
	);
}

/**
 * Extracts timestamp array (in milliseconds, with UTC offset applied) from a VariablesWithTime block.
 */
export function getTimestamps(timeBlock: VariablesWithTime): number[] {
	const start = Number(timeBlock.time());
	const end = Number(timeBlock.timeEnd());
	const interval = timeBlock.interval();
	return range(start, end, interval).map((t) => t * 1000);
}

/**
 * Extracts Date array (with UTC offset applied) from a VariablesWithTime block.
 */
export function getDates(timeBlock: VariablesWithTime): Date[] {
	return getTimestamps(timeBlock).map((t) => new Date(t));
}

/**
 * Extracts a Float32Array of values from a VariableWithValues, returning a regular number[].
 * Falls back to an empty array if no values are present.
 */
export function getValues(variable: VariableWithValues): number[] {
	const arr = variable.valuesArray();
	if (!arr) return [];
	return Array.from(arr);
}

/**
 * Extracts Int64 (BigInt) values from a VariableWithValues, converting to number[].
 * Used for variables stored as unix timestamps (e.g. sunrise, sunset).
 */
export function getInt64Values(variable: VariableWithValues): number[] {
	const len = variable.valuesInt64Length();
	const result: number[] = [];
	for (let i = 0; i < len; i++) {
		const val = variable.valuesInt64(i);
		result.push(val !== null ? Number(val) : 0);
	}
	return result;
}

/**
 * Converts the SDK Unit enum to a human-readable display string.
 */
export function unitToDisplayString(unit: Unit): string {
	switch (unit) {
		case Unit.celsius:
			return '°C';
		case Unit.fahrenheit:
			return '°F';
		case Unit.millimetre:
			return 'mm';
		case Unit.inch:
			return 'in';
		case Unit.kilometres_per_hour:
			return 'km/h';
		case Unit.metre_per_second:
			return 'm/s';
		case Unit.miles_per_hour:
			return 'mph';
		case Unit.knots:
			return 'kn';
		case Unit.percentage:
			return '%';
		case Unit.hectopascal:
			return 'hPa';
		case Unit.degree_direction:
			return '°';
		case Unit.wmo_code:
			return 'wmo code';
		case Unit.seconds:
			return 's';
		case Unit.hours:
			return 'h';
		case Unit.watt_per_square_metre:
			return 'W/m²';
		case Unit.megajoule_per_square_metre:
			return 'MJ/m²';
		case Unit.joule_per_kilogram:
			return 'J/kg';
		case Unit.metre:
			return 'm';
		case Unit.centimetre:
			return 'cm';
		case Unit.kilogram_per_square_metre:
			return 'kg/m²';
		case Unit.kilopascal:
			return 'kPa';
		case Unit.pascal:
			return 'Pa';
		case Unit.fraction:
			return '';
		case Unit.dimensionless:
			return '';
		case Unit.dimensionless_integer:
			return '';
		case Unit.unix_time:
			return 'unixtime';
		case Unit.grains_per_cubic_metre:
			return 'grains/m³';
		case Unit.micrograms_per_cubic_metre:
			return 'µg/m³';
		default:
			return '';
	}
}

// ─── Shared Types ───────────────────────────────────────────────────────────────

export interface WeatherLocation {
	latitude: number;
	longitude: number;
	timezone?: string;
}

export interface WeatherUnitParams {
	temperature_unit?: 'celsius' | 'fahrenheit';
	wind_speed_unit?: 'kmh' | 'ms' | 'mph' | 'kn';
	precipitation_unit?: 'mm' | 'inch';
}

export type { DaylightBand };

// ─── Week Forecast Types ────────────────────────────────────────────────────────

export interface WeekForecastParams extends WeatherLocation, WeatherUnitParams {
	model?: string;
	forecast_days?: number;
	past_days?: number;
	/** Hourly API variables to request; defaults to the full core set */
	hourlyVariables?: string[];
}

export interface WeekHourlyData {
	temperature_2m: number[];
	precipitation: number[];
	precipitation_probability: number[];
	weather_code: number[];
	windspeed_10m: number[];
	winddirection_10m: number[];
	cloud_cover: number[];
	relative_humidity_2m: number[];
	apparent_temperature: number[];
	dew_point_2m: number[];
	// Additional popular variables available for the customizable meteograms
	wind_gusts_10m: number[];
	pressure_msl: number[];
	surface_pressure: number[];
	rain: number[];
	showers: number[];
	snowfall: number[];
	cloud_cover_low: number[];
	cloud_cover_mid: number[];
	cloud_cover_high: number[];
	uv_index: number[];
	visibility: number[];
	cape: number[];
}

export interface WeekDailyData {
	weather_code: number[];
	temperature_2m_max: number[];
	temperature_2m_min: number[];
	sunrise: number[];
	sunset: number[];
	sunshine_duration: number[];
	precipitation_sum: number[];
	windspeed_10m_max: number[];
	windgusts_10m_max: number[];
	winddirection_10m_dominant: number[];
	// Only the live forecast carries these; the archive-backed views reuse this
	// shape without them, so they stay optional.
	/** Seconds between sunrise and sunset. */
	daylight_duration?: number[];
	uv_index_max?: number[];
	precipitation_probability_max?: number[];
	/** Unix seconds; 0 on the days the moon doesn't rise / set at all. */
	moonrise?: number[];
	moonset?: number[];
	/** 0 and 1 are new moon, 0.5 is full moon. */
	moon_phase?: number[];
}

export interface WeekForecastResult {
	hourly: WeekHourlyData;
	daily: WeekDailyData;
	utcOffsetSeconds: number;
	timezone: string;
	hourlyTimestamps: number[];
	hourlyDates: Date[];
	dailyDates: Date[];
	daylightBands: DaylightBand[];
}

// ─── Model Comparison Types ─────────────────────────────────────────────────────

export interface ModelCompareParams extends WeatherLocation, WeatherUnitParams {
	hourlyVariables: string[];
	models: string[];
}

export interface ModelSeriesData {
	/** Stable identifier requested by the UI. */
	modelId: string;
	/** Concrete model identifier reported by the API (useful for seamless/best-match requests). */
	resolvedModelId: string;
	variables: Record<string, number[]>;
}

export interface ModelCompareResult {
	models: ModelSeriesData[];
	timestamps: number[];
	utcOffsetSeconds: number;
	timezone: string;
	daylightBands: DaylightBand[];
	sunrise: number[];
	sunset: number[];
	units: Record<string, string>;
	/** Flat record compatible with the existing chart utilities (keys like "temperature_2m_icon_seamless") */
	hourlyFlat: Record<string, number[]>;
	hourlyUnitsFlat: Record<string, string>;
}

// ─── Ensemble Forecast Types ────────────────────────────────────────────────────

export interface EnsembleForecastParams extends WeatherLocation, WeatherUnitParams {
	hourlyVariables: string[];
	models: string[];
	forecast_days?: number;
}

export interface EnsembleVariableData {
	members: number[][];
	/** Percentiles across members per timestep (p50 is the median; p0/p100 are
	 *  the member extremes). */
	p0: number[];
	p10: number[];
	p25: number[];
	p50: number[];
	p75: number[];
	p90: number[];
	p100: number[];
	unit: string;
}

export interface EnsembleForecastResult {
	variables: Record<string, EnsembleVariableData>;
	timestamps: number[];
	utcOffsetSeconds: number;
	timezone: string;
	daylightBands: DaylightBand[];
	/** Flat record compatible with existing chart utilities (keys like "temperature_2m_member00") */
	hourlyFlat: Record<string, number[]>;
	hourlyUnitsFlat: Record<string, string>;
}

// ─── Error Humanizing ───────────────────────────────────────────────────────────

export interface FriendlyWeatherError {
	/** Short, plain-language headline. */
	title: string;
	/** What the user can actually do about it. */
	hint?: string;
	/** The raw underlying message, for a collapsed "technical details" block. */
	detail?: string;
}

/**
 * Turns a fetch/API error into something a person can act on. The raw message
 * (often API-speak like "No data is available for this location") is kept as
 * `detail` so it can be shown collapsed.
 */
export function humanizeWeatherError(err: unknown): FriendlyWeatherError {
	const raw = err instanceof Error ? err.message : String(err);
	const msg = raw.toLowerCase();

	if (
		err instanceof TypeError ||
		msg.includes('failed to fetch') ||
		msg.includes('networkerror') ||
		msg.includes('load failed') ||
		msg.includes('network request failed')
	) {
		return {
			title: m.err_network_title(),
			hint: m.err_network_hint(),
			detail: raw
		};
	}
	if (
		msg.includes('no data is available') ||
		msg.includes('not available for this location') ||
		msg.includes('out of allowed range') ||
		msg.includes('coordinates')
	) {
		return {
			title: m.err_nodata_title(),
			hint: m.err_nodata_hint(),
			detail: raw
		};
	}
	if (msg.includes('invalid') || msg.includes('cannot be') || msg.includes('bad request')) {
		return {
			title: m.err_rejected_title(),
			hint: m.err_rejected_hint(),
			detail: raw
		};
	}
	return {
		title: m.err_generic_title(),
		hint: m.err_generic_hint(),
		detail: raw
	};
}

// ─── Week Forecast Fetch ────────────────────────────────────────────────────────

// Fallback set when the caller does not specify which hourly variables it
// needs. Callers normally pass an explicit list so only shown variables are
// requested.
const WEEK_HOURLY_VARS = [
	'temperature_2m',
	'precipitation',
	'precipitation_probability',
	'weather_code',
	'wind_speed_10m',
	'wind_direction_10m',
	'cloud_cover',
	'relative_humidity_2m',
	'apparent_temperature',
	'dew_point_2m'
] as const;

const WEEK_DAILY_VARS = [
	'weather_code',
	'temperature_2m_max',
	'temperature_2m_min',
	'sunrise',
	'sunset',
	'sunshine_duration',
	'precipitation_sum',
	'wind_speed_10m_max',
	'wind_gusts_10m_max',
	'wind_direction_10m_dominant',
	'daylight_duration',
	'uv_index_max',
	'precipitation_probability_max',
	'moonrise',
	'moonset',
	'moon_phase'
] as const;

/**
 * Assembles a WeekHourlyData structure from a name→values map, so variables that
 * were not requested resolve to empty arrays. Shared by the week and historical
 * fetchers (both return the same hourly shape, which the meteograms and hourly
 * table consume).
 */
function weekHourlyFromByName(byName: Record<string, number[]>): WeekHourlyData {
	const g = (name: string): number[] => byName[name] ?? [];
	return {
		temperature_2m: g('temperature_2m'),
		precipitation: g('precipitation'),
		precipitation_probability: g('precipitation_probability'),
		weather_code: g('weather_code'),
		windspeed_10m: g('wind_speed_10m'),
		winddirection_10m: g('wind_direction_10m'),
		cloud_cover: g('cloud_cover'),
		relative_humidity_2m: g('relative_humidity_2m'),
		apparent_temperature: g('apparent_temperature'),
		dew_point_2m: g('dew_point_2m'),
		wind_gusts_10m: g('wind_gusts_10m'),
		pressure_msl: g('pressure_msl'),
		surface_pressure: g('surface_pressure'),
		rain: g('rain'),
		showers: g('showers'),
		snowfall: g('snowfall'),
		cloud_cover_low: g('cloud_cover_low'),
		cloud_cover_mid: g('cloud_cover_mid'),
		cloud_cover_high: g('cloud_cover_high'),
		uv_index: g('uv_index'),
		visibility: g('visibility'),
		cape: g('cape')
	};
}

/**
 * Fetches the 7-day (week) weather forecast for a single location and model.
 * Returns typed hourly and daily data structures.
 */
export async function fetchWeekForecast(params: WeekForecastParams): Promise<WeekForecastResult> {
	const forecastDays = params.forecast_days ?? 6;
	const pastDays = params.past_days ?? 0;
	const modelParam = params.model && params.model !== 'best_match' ? params.model : undefined;

	// Request only the variables the caller needs; fall back to the core set.
	const hourlyVars =
		params.hourlyVariables && params.hourlyVariables.length > 0
			? [...new Set(params.hourlyVariables)]
			: [...WEEK_HOURLY_VARS];

	const apiParams: Record<string, string | number | undefined> = {
		latitude: params.latitude,
		longitude: params.longitude,
		hourly: hourlyVars.join(','),
		daily: WEEK_DAILY_VARS.join(','),
		temperature_unit: params.temperature_unit ?? 'celsius',
		wind_speed_unit: params.wind_speed_unit ?? 'kmh',
		precipitation_unit: params.precipitation_unit ?? 'mm',
		forecast_days: forecastDays,
		past_days: pastDays,
		models: modelParam,
		timezone: params.timezone
	};

	// Remove undefined values
	const cleanParams: Record<string, string> = {};
	for (const [key, value] of Object.entries(apiParams)) {
		if (value !== undefined) {
			cleanParams[key] = String(value);
		}
	}

	const responses = await fetchWeatherApi(FORECAST_URL, cleanParams);
	const response = responses[0];
	const utcOffsetSeconds = response.utcOffsetSeconds();
	const timezone = response.timezone() ?? params.timezone ?? 'UTC';

	const hourlyBlock = response.hourly()!;
	const dailyBlock = response.daily()!;

	// Hourly: variables are in the same order as WEEK_HOURLY_VARS
	const hourlyTimestamps = getTimestamps(hourlyBlock);
	const hourlyDates = hourlyTimestamps.map((t) => new Date(t));

	// Values come back in the requested order; index them by API name so
	// variables that were not requested resolve to empty arrays.
	const byName: Record<string, number[]> = {};
	hourlyVars.forEach((name, i) => {
		const variable = hourlyBlock.variables(i);
		byName[name] = variable ? getValues(variable) : [];
	});

	const hourly = weekHourlyFromByName(byName);

	// Daily: variables are in the same order as WEEK_DAILY_VARS
	const dailyDates = getDates(dailyBlock);

	const sunriseVar = dailyBlock.variables(3)!;
	const sunsetVar = dailyBlock.variables(4)!;

	// Optional tail variables: a model that doesn't carry them yields fewer
	// entries, so read them defensively instead of asserting.
	const dailyAt = (i: number): number[] => {
		const v = dailyBlock.variables(i);
		return v ? getValues(v) : [];
	};
	const dailyInt64At = (i: number): number[] => {
		const v = dailyBlock.variables(i);
		return v ? getInt64Values(v) : [];
	};

	const daily: WeekDailyData = {
		weather_code: getValues(dailyBlock.variables(0)!),
		temperature_2m_max: getValues(dailyBlock.variables(1)!),
		temperature_2m_min: getValues(dailyBlock.variables(2)!),
		sunrise: getInt64Values(sunriseVar),
		sunset: getInt64Values(sunsetVar),
		sunshine_duration: getValues(dailyBlock.variables(5)!),
		precipitation_sum: getValues(dailyBlock.variables(6)!),
		windspeed_10m_max: getValues(dailyBlock.variables(7)!),
		windgusts_10m_max: getValues(dailyBlock.variables(8)!),
		winddirection_10m_dominant: getValues(dailyBlock.variables(9)!),
		daylight_duration: dailyAt(10),
		uv_index_max: dailyAt(11),
		precipitation_probability_max: dailyAt(12),
		moonrise: dailyInt64At(13),
		moonset: dailyInt64At(14),
		moon_phase: dailyAt(15)
	};

	const daylightBands = buildDaylightBands(daily.sunrise, daily.sunset);

	return {
		hourly,
		daily,
		utcOffsetSeconds,
		timezone,
		hourlyTimestamps,
		hourlyDates,
		dailyDates,
		daylightBands
	};
}

// ─── Model Comparison Fetch ─────────────────────────────────────────────────────

/**
 * Fetches forecast data for multiple models for comparison.
 * Also fetches daily sunrise/sunset for daylight mark areas.
 *
 * Returns both a typed model array structure and a flat record structure
 * compatible with existing chart utilities.
 */
export async function fetchModelComparison(
	params: ModelCompareParams,
	options: { signal?: AbortSignal } = {}
): Promise<ModelCompareResult> {
	const forecastApiParams: Record<string, string | number | undefined> = {
		latitude: String(params.latitude),
		longitude: String(params.longitude),
		hourly: params.hourlyVariables.join(','),
		models: params.models.join(','),
		daily: 'sunrise,sunset',
		temperature_unit: params.temperature_unit ?? 'celsius',
		wind_speed_unit: params.wind_speed_unit ?? 'kmh',
		precipitation_unit: params.precipitation_unit ?? 'mm',
		timezone: params.timezone
	};

	const responses = await fetchWeatherApi(
		FORECAST_URL,
		forecastApiParams,
		undefined,
		undefined,
		undefined,
		{ signal: options.signal }
	);
	if (responses.length === 0) throw new Error('The weather service returned no model data.');
	if (responses.length !== params.models.length) {
		throw new Error(
			`The weather service returned ${responses.length} model responses for ${params.models.length} requested models.`
		);
	}

	// With multiple models, we get one response per model
	const firstResponse = responses[0];
	const utcOffsetSeconds = firstResponse.utcOffsetSeconds();
	const timezone = firstResponse.timezone() ?? params.timezone ?? 'UTC';

	const hourlyBlock = firstResponse.hourly();
	if (!hourlyBlock) throw new Error('The weather service returned no hourly model data.');
	const timestamps = getTimestamps(hourlyBlock);

	// Extract sunrise/sunset from the first response's daily block
	let daylightBands: DaylightBand[] = [];
	let sunrise: number[] = [];
	let sunset: number[] = [];
	const dailyBlock = firstResponse.daily();
	if (dailyBlock) {
		const sunriseVar = dailyBlock.variables(0)!;
		const sunsetVar = dailyBlock.variables(1)!;
		sunrise = getInt64Values(sunriseVar);
		sunset = getInt64Values(sunsetVar);
		daylightBands = buildDaylightBands(sunrise, sunset);
	}

	// Process each model's response
	const models: ModelSeriesData[] = [];
	const hourlyFlat: Record<string, number[]> = {};
	const hourlyUnitsFlat: Record<string, string> = {};
	const units: Record<string, string> = {};

	// Add time to flat record
	const timeInUnixSeconds = range(
		Number(hourlyBlock.time()),
		Number(hourlyBlock.timeEnd()),
		hourlyBlock.interval()
	);
	hourlyFlat['time'] = timeInUnixSeconds;

	for (const [responseIndex, response] of responses.entries()) {
		const modelHourly = response.hourly();
		if (!modelHourly) continue;

		// The multi-model endpoint preserves request order and returns one response
		// per requested model, including unavailable regional models. Keep that
		// requested id as the stable UI key. The concrete id reported by Open-Meteo
		// is metadata only: seamless and best-match requests may resolve to a
		// different underlying domain.
		const modelEnum = response.model();
		const resolvedModelId = Model[modelEnum] ?? `model_${modelEnum}`;
		const modelId = params.models[responseIndex] ?? resolvedModelId;

		const modelData: ModelSeriesData = {
			modelId,
			resolvedModelId,
			variables: {}
		};

		for (let vi = 0; vi < params.hourlyVariables.length; vi++) {
			const varName = params.hourlyVariables[vi];
			const variable = modelHourly.variables(vi);
			if (!variable) continue;

			const values = getValues(variable);
			modelData.variables[varName] = values;

			// Build flat key like "temperature_2m_icon_seamless"
			const flatKey = `${varName}_${modelId}`;
			hourlyFlat[flatKey] = values;

			// Record unit
			const unitStr = unitToDisplayString(variable.unit());
			units[varName] = unitStr;
			hourlyUnitsFlat[flatKey] = unitStr;
		}

		models.push(modelData);
	}

	return {
		models,
		timestamps,
		utcOffsetSeconds,
		timezone,
		daylightBands,
		sunrise,
		sunset,
		units,
		hourlyFlat,
		hourlyUnitsFlat
	};
}

// ─── Ensemble Forecast Fetch ────────────────────────────────────────────────────

/**
 * Fetches ensemble forecast data from the ensemble API.
 * Separately fetches daily sunrise/sunset from the standard forecast API.
 *
 * Returns typed ensemble data with per-variable member arrays and percentile
 * spreads (p0-p100 - the API offers no server-side aggregation, so
 * they are computed here from the members), plus a flat record structure for
 * compatibility with existing chart utilities.
 */
export async function fetchEnsembleForecast(
	params: EnsembleForecastParams
): Promise<EnsembleForecastResult> {
	const forecastDays = params.forecast_days ?? 14;

	const ensembleParams: Record<string, string | number | undefined> = {
		latitude: String(params.latitude),
		longitude: String(params.longitude),
		hourly: params.hourlyVariables.join(','),
		models: params.models.join(','),
		forecast_days: String(forecastDays),
		temperature_unit: params.temperature_unit ?? 'celsius',
		wind_speed_unit: params.wind_speed_unit ?? 'kmh',
		precipitation_unit: params.precipitation_unit ?? 'mm',
		timezone: params.timezone
	};

	const dailyParams: Record<string, string> = {
		latitude: String(params.latitude),
		longitude: String(params.longitude),
		daily: 'sunrise,sunset',
		forecast_days: String(forecastDays),
		temperature_unit: params.temperature_unit ?? 'celsius'
	};

	// Fetch ensemble and daily data in parallel
	const [ensembleResponses, dailyResponses] = await Promise.all([
		fetchWeatherApi(ENSEMBLE_URL, ensembleParams),
		fetchWeatherApi(FORECAST_URL, dailyParams)
	]);

	const ensembleResponse = ensembleResponses[0];
	const utcOffsetSeconds = ensembleResponse.utcOffsetSeconds();
	const timezone = ensembleResponse.timezone() ?? params.timezone ?? 'UTC';

	const hourlyBlock = ensembleResponse.hourly()!;
	const timestamps = getTimestamps(hourlyBlock);
	const timeLength = timestamps.length;

	// Extract sunrise/sunset for daylight bands
	let daylightBands: DaylightBand[] = [];
	if (dailyResponses.length > 0) {
		const dailyResponse = dailyResponses[0];
		const dailyBlock = dailyResponse.daily();
		if (dailyBlock) {
			const sunrise = getInt64Values(dailyBlock.variables(0)!);
			const sunset = getInt64Values(dailyBlock.variables(1)!);
			daylightBands = buildDaylightBands(sunrise, sunset);
		}
	}

	// Process ensemble variables
	// Each requested variable will have multiple entries in the variables list (one per ensemble member)
	const variables: Record<string, EnsembleVariableData> = {};
	const hourlyFlat: Record<string, number[]> = {};
	const hourlyUnitsFlat: Record<string, string> = {};

	// Add time to flat record
	const timeInUnixSeconds = range(
		Number(hourlyBlock.time()),
		Number(hourlyBlock.timeEnd()),
		hourlyBlock.interval()
	);
	hourlyFlat['time'] = timeInUnixSeconds;

	// Group variables by their requested variable name
	// The SDK provides variables indexed sequentially:
	// For N requested variables and M ensemble members, we get N*M variables
	// ordered as: var0_member0, var0_member1, ..., var0_memberM-1, var1_member0, ...
	const totalVariables = hourlyBlock.variablesLength();
	const numRequestedVars = params.hourlyVariables.length;

	if (totalVariables > 0 && numRequestedVars > 0) {
		const membersPerVar = Math.floor(totalVariables / numRequestedVars);

		for (let vi = 0; vi < numRequestedVars; vi++) {
			const varName = params.hourlyVariables[vi];
			const members: number[][] = [];
			let unitStr = '';

			for (let mi = 0; mi < membersPerVar; mi++) {
				const varIdx = vi * membersPerVar + mi;
				const variable = hourlyBlock.variables(varIdx);
				if (!variable) continue;

				const values = getValues(variable);
				members.push(values);

				if (mi === 0) {
					unitStr = unitToDisplayString(variable.unit());
				}

				// Build flat key compatible with JSON API format
				const memberStr = String(mi).padStart(2, '0');
				const flatKey = `${varName}_member${memberStr}`;
				hourlyFlat[flatKey] = values;
				hourlyUnitsFlat[flatKey] = unitStr;
			}

			// Calculate percentiles across members. Timesteps without any member
			// value stay 0, matching the padding past a model's horizon (the pages
			// trim the axis on that sentinel).
			const p0 = new Array<number>(timeLength).fill(0);
			const p10 = new Array<number>(timeLength).fill(0);
			const p25 = new Array<number>(timeLength).fill(0);
			const p50 = new Array<number>(timeLength).fill(0);
			const p75 = new Array<number>(timeLength).fill(0);
			const p90 = new Array<number>(timeLength).fill(0);
			const p100 = new Array<number>(timeLength).fill(0);

			for (let t = 0; t < timeLength; t++) {
				const values: number[] = [];
				for (const memberValues of members) {
					const val = memberValues[t];
					if (val !== null && val !== undefined && !isNaN(val)) values.push(val);
				}
				if (values.length === 0) continue;
				values.sort((a, b) => a - b);
				p0[t] = values[0];
				p10[t] = percentileSorted(values, 0.1);
				p25[t] = percentileSorted(values, 0.25);
				p50[t] = percentileSorted(values, 0.5);
				p75[t] = percentileSorted(values, 0.75);
				p90[t] = percentileSorted(values, 0.9);
				p100[t] = values[values.length - 1];
			}

			variables[varName] = {
				members,
				p0,
				p10,
				p25,
				p50,
				p75,
				p90,
				p100,
				unit: unitStr
			};
		}
	}

	return {
		variables,
		timestamps,
		utcOffsetSeconds,
		timezone,
		daylightBands,
		hourlyFlat,
		hourlyUnitsFlat
	};
}

// ─── Historical (Archive) Types ─────────────────────────────────────────────

export interface HistoricalDailyData {
	weather_code: number[];
	temperature_2m_max: number[];
	temperature_2m_min: number[];
	temperature_2m_mean: number[];
	apparent_temperature_max: number[];
	apparent_temperature_min: number[];
	sunrise: number[];
	sunset: number[];
	sunshine_duration: number[];
	precipitation_sum: number[];
	rain_sum: number[];
	snowfall_sum: number[];
	precipitation_hours: number[];
	windspeed_10m_max: number[];
	windgusts_10m_max: number[];
	winddirection_10m_dominant: number[];
}

export interface HistoricalForecastParams extends WeatherLocation, WeatherUnitParams {
	/** Inclusive range, YYYY-MM-DD (location-local dates). */
	start_date: string;
	end_date: string;
	/** Hourly API variables to request; defaults to the core week set. */
	hourlyVariables?: string[];
	/** Reanalysis to read from; omitted lets the API pick. */
	model?: string;
}

export interface HistoricalForecastResult {
	hourly: WeekHourlyData;
	daily: HistoricalDailyData;
	utcOffsetSeconds: number;
	timezone: string;
	hourlyTimestamps: number[];
	hourlyDates: Date[];
	dailyDates: Date[];
	daylightBands: DaylightBand[];
}

// Requested in this exact order; the daily block returns variables positionally.
const HISTORICAL_DAILY_VARS = [
	'weather_code',
	'temperature_2m_max',
	'temperature_2m_min',
	'temperature_2m_mean',
	'apparent_temperature_max',
	'apparent_temperature_min',
	'sunrise',
	'sunset',
	'sunshine_duration',
	'precipitation_sum',
	'rain_sum',
	'snowfall_sum',
	'precipitation_hours',
	'wind_speed_10m_max',
	'wind_gusts_10m_max',
	'wind_direction_10m_dominant'
] as const;

// ─── Historical (Archive) Fetch ─────────────────────────────────────────────

/**
 * Fetches reanalysis (ERA5) weather for a past date range from the Open-Meteo
 * archive API. Returns the same hourly shape as the week forecast (so the
 * existing meteograms and hourly table render it unchanged) plus a richer daily
 * block for the climate/statistics view.
 */
export async function fetchHistoricalWeather(
	params: HistoricalForecastParams
): Promise<HistoricalForecastResult> {
	const hourlyVars =
		params.hourlyVariables && params.hourlyVariables.length > 0
			? [...new Set(params.hourlyVariables)]
			: [...WEEK_HOURLY_VARS];

	const apiParams: Record<string, string | number | undefined> = {
		latitude: params.latitude,
		longitude: params.longitude,
		start_date: params.start_date,
		end_date: params.end_date,
		hourly: hourlyVars.join(','),
		daily: HISTORICAL_DAILY_VARS.join(','),
		temperature_unit: params.temperature_unit ?? 'celsius',
		wind_speed_unit: params.wind_speed_unit ?? 'kmh',
		precipitation_unit: params.precipitation_unit ?? 'mm',
		timezone: params.timezone,
		models: params.model && params.model !== 'best_match' ? params.model : undefined
	};

	const cleanParams: Record<string, string> = {};
	for (const [key, value] of Object.entries(apiParams)) {
		if (value !== undefined) cleanParams[key] = String(value);
	}

	const responses = await fetchWeatherApi(ARCHIVE_URL, cleanParams);
	const response = responses[0];
	const utcOffsetSeconds = response.utcOffsetSeconds();
	const timezone = response.timezone() ?? params.timezone ?? 'UTC';

	const hourlyBlock = response.hourly()!;
	const dailyBlock = response.daily()!;

	const hourlyTimestamps = getTimestamps(hourlyBlock);
	const hourlyDates = hourlyTimestamps.map((t) => new Date(t));

	const byName: Record<string, number[]> = {};
	hourlyVars.forEach((name, i) => {
		const variable = hourlyBlock.variables(i);
		byName[name] = variable ? getValues(variable) : [];
	});
	const hourly = weekHourlyFromByName(byName);

	// Daily variables come back in HISTORICAL_DAILY_VARS order.
	const dailyDates = getDates(dailyBlock);
	const d = (i: number): number[] => {
		const v = dailyBlock.variables(i);
		return v ? getValues(v) : [];
	};
	const sunrise = getInt64Values(dailyBlock.variables(6)!);
	const sunset = getInt64Values(dailyBlock.variables(7)!);

	const daily: HistoricalDailyData = {
		weather_code: d(0),
		temperature_2m_max: d(1),
		temperature_2m_min: d(2),
		temperature_2m_mean: d(3),
		apparent_temperature_max: d(4),
		apparent_temperature_min: d(5),
		sunrise,
		sunset,
		sunshine_duration: d(8),
		precipitation_sum: d(9),
		rain_sum: d(10),
		snowfall_sum: d(11),
		precipitation_hours: d(12),
		windspeed_10m_max: d(13),
		windgusts_10m_max: d(14),
		winddirection_10m_dominant: d(15)
	};

	const daylightBands = buildDaylightBands(sunrise, sunset);

	return {
		hourly,
		daily,
		utcOffsetSeconds,
		timezone,
		hourlyTimestamps,
		hourlyDates,
		dailyDates,
		daylightBands
	};
}

// ─── Climate Normals ────────────────────────────────────────────────────────

export interface ClimateNormals {
	/** Indexed by day-of-year ordinal 1..366 (index 0 unused); NaN where no data. */
	tmax: number[];
	tmin: number[];
	tmean: number[];
	/** Mean daily precipitation (per calendar day). */
	precip: number[];
	baseStart: string;
	baseEnd: string;
	temperature_unit: string;
	precipitation_unit: string;
}

export interface ClimateNormalsParams extends WeatherLocation, WeatherUnitParams {
	/** Baseline period; defaults to the 1991-2020 WMO normal period. */
	baseStart?: string;
	baseEnd?: string;
}

// Days before the first of each month in a leap reference year, so that a
// (month, day) pair maps to a stable 1..366 ordinal regardless of leap years.
const CUM_DAYS_LEAP = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

/** Day-of-year ordinal (1..366) from month (1-12) and day-of-month (1-31). */
export function monthDayToOrdinal(month: number, day: number): number {
	const m = Math.min(12, Math.max(1, Math.round(month)));
	return CUM_DAYS_LEAP[m - 1] + day;
}

/**
 * Computes daily climate normals for a location by averaging a multi-decade
 * archive across years, per day-of-year, with a ±7-day smoothing window so the
 * curve is stable. One archive request; used for the "vs normal" comparison.
 */
export async function fetchClimateNormals(params: ClimateNormalsParams): Promise<ClimateNormals> {
	const baseStart = params.baseStart ?? '1991-01-01';
	const baseEnd = params.baseEnd ?? '2020-12-31';

	// UTC keeps the day-of-year bucketing exact (no offset spill across midnight);
	// timezone is irrelevant to a per-calendar-day normal.
	const apiParams: Record<string, string> = {
		latitude: String(params.latitude),
		longitude: String(params.longitude),
		start_date: baseStart,
		end_date: baseEnd,
		daily: 'temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum',
		temperature_unit: params.temperature_unit ?? 'celsius',
		precipitation_unit: params.precipitation_unit ?? 'mm',
		timezone: 'UTC'
	};

	const responses = await fetchWeatherApi(ARCHIVE_URL, apiParams);
	const response = responses[0];
	const dailyBlock = response.daily()!;
	const dates = getDates(dailyBlock);
	const tmaxV = getValues(dailyBlock.variables(0)!);
	const tminV = getValues(dailyBlock.variables(1)!);
	const tmeanV = getValues(dailyBlock.variables(2)!);
	const precipV = getValues(dailyBlock.variables(3)!);

	const N = 367; // ordinals 1..366
	const mk = () => ({ sum: new Array<number>(N).fill(0), cnt: new Array<number>(N).fill(0) });
	const acc = { tmax: mk(), tmin: mk(), tmean: mk(), precip: mk() };

	const add = (bucket: { sum: number[]; cnt: number[] }, ord: number, val: number) => {
		if (Number.isFinite(val)) {
			bucket.sum[ord] += val;
			bucket.cnt[ord] += 1;
		}
	};

	for (let i = 0; i < dates.length; i++) {
		const dt = dates[i];
		const ord = monthDayToOrdinal(dt.getUTCMonth() + 1, dt.getUTCDate());
		add(acc.tmax, ord, tmaxV[i]);
		add(acc.tmin, ord, tminV[i]);
		add(acc.tmean, ord, tmeanV[i]);
		add(acc.precip, ord, precipV[i]);
	}

	const mean = (bucket: { sum: number[]; cnt: number[] }): number[] =>
		bucket.sum.map((s, i) => (bucket.cnt[i] > 0 ? s / bucket.cnt[i] : NaN));

	// Circular ±window smoothing across the 366 ordinals (skips empty days).
	const smooth = (arr: number[], window = 7): number[] => {
		const out = new Array<number>(N).fill(NaN);
		for (let o = 1; o <= 366; o++) {
			let s = 0;
			let c = 0;
			for (let k = -window; k <= window; k++) {
				const idx = ((o - 1 + k + 366) % 366) + 1;
				const v = arr[idx];
				if (Number.isFinite(v)) {
					s += v;
					c++;
				}
			}
			out[o] = c > 0 ? s / c : NaN;
		}
		return out;
	};

	return {
		tmax: smooth(mean(acc.tmax)),
		tmin: smooth(mean(acc.tmin)),
		tmean: smooth(mean(acc.tmean)),
		precip: smooth(mean(acc.precip)),
		baseStart,
		baseEnd,
		temperature_unit: params.temperature_unit ?? 'celsius',
		precipitation_unit: params.precipitation_unit ?? 'mm'
	};
}

// ─── Seasonal (Long-Range) Types ────────────────────────────────────────────

/**
 * One daily variable of the seasonal ensemble: every member plus the spread
 * statistics the outlook renders (percentile band, mean, extremes).
 */
export interface SeasonalVariableData {
	/** Raw members, `members[m][t]`. */
	members: number[][];
	mean: number[];
	min: number[];
	max: number[];
	p25: number[];
	p75: number[];
	unit: string;
}

export interface SeasonalForecastParams extends WeatherLocation, WeatherUnitParams {
	/** Daily API variables to request; defaults to SEASONAL_DAILY_VARS. */
	dailyVariables?: string[];
	/** Lead time in days; the API allows at most 216. */
	forecast_days?: number;
	/** Seasonal model; omitted lets the API pick. */
	model?: string;
}

export interface SeasonalForecastResult {
	variables: Record<string, SeasonalVariableData>;
	/** Milliseconds, one entry per day (already trimmed to the model's horizon). */
	timestamps: number[];
	/**
	 * Local wall time (local midnight) expressed as a UTC instant - read these
	 * with the UTC getters, never with the location's IANA zone. The seasonal API
	 * keeps ONE offset for the whole series, so a half-year range that crosses a
	 * DST change would otherwise land two days on the same local date.
	 */
	dailyDates: Date[];
	/** `YYYY-MM-DD` local calendar date per day, matching the API's own labels. */
	dateKeys: string[];
	memberCount: number;
	utcOffsetSeconds: number;
	timezone: string;
}

/** The API caps the lead time here; the model itself usually stops earlier. */
export const SEASONAL_MAX_DAYS = 216;

/** Requested in this order; the daily block returns variables positionally. */
export const SEASONAL_DAILY_VARS = [
	'temperature_2m_max',
	'temperature_2m_min',
	'temperature_2m_mean',
	'precipitation_sum',
	'wind_speed_10m_mean',
	'cloud_cover_mean'
] as const;

// ─── Seasonal (Long-Range) Fetch ────────────────────────────────────────────

/** Linear-interpolated percentile over an already ascending array. */
function percentileSorted(sorted: number[], p: number): number {
	if (sorted.length === 0) return NaN;
	if (sorted.length === 1) return sorted[0];
	const pos = (sorted.length - 1) * p;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	if (lo === hi) return sorted[lo];
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Fetches the seasonal (multi-month) ensemble outlook from Open-Meteo's
 * seasonal API. Unlike the medium-range ensemble this is daily data: each
 * requested variable comes back once per member, so the members are collapsed
 * into the spread statistics the outlook page plots.
 *
 * The requested lead time is only an upper bound - the model's own horizon is
 * shorter, and every day past it comes back empty. Those trailing days are
 * trimmed here so callers never plot a flat-lined tail.
 */
export async function fetchSeasonalForecast(
	params: SeasonalForecastParams
): Promise<SeasonalForecastResult> {
	const dailyVars =
		params.dailyVariables && params.dailyVariables.length > 0
			? [...new Set(params.dailyVariables)]
			: [...SEASONAL_DAILY_VARS];

	const apiParams: Record<string, string | number | undefined> = {
		latitude: params.latitude,
		longitude: params.longitude,
		daily: dailyVars.join(','),
		forecast_days: Math.min(params.forecast_days ?? SEASONAL_MAX_DAYS, SEASONAL_MAX_DAYS),
		temperature_unit: params.temperature_unit ?? 'celsius',
		wind_speed_unit: params.wind_speed_unit ?? 'kmh',
		precipitation_unit: params.precipitation_unit ?? 'mm',
		timezone: params.timezone,
		models: params.model && params.model !== 'best_match' ? params.model : undefined
	};

	const cleanParams: Record<string, string> = {};
	for (const [key, value] of Object.entries(apiParams)) {
		if (value !== undefined) cleanParams[key] = String(value);
	}

	const responses = await fetchWeatherApi(SEASONAL_URL, cleanParams);
	const response = responses[0];
	const utcOffsetSeconds = response.utcOffsetSeconds();
	const timezone = response.timezone() ?? params.timezone ?? 'UTC';

	const dailyBlock = response.daily()!;
	const allTimestamps = getTimestamps(dailyBlock);
	const timeLength = allTimestamps.length;

	// Members are laid out like the ensemble API: var0_member0 … var0_memberM-1,
	// var1_member0 …, so the count follows from the totals instead of being
	// hard-coded (it differs per seasonal model).
	const totalVariables = dailyBlock.variablesLength();
	const memberCount = dailyVars.length > 0 ? Math.floor(totalVariables / dailyVars.length) : 0;

	const variables: Record<string, SeasonalVariableData> = {};

	for (let vi = 0; vi < dailyVars.length; vi++) {
		const members: number[][] = [];
		let unitStr = '';

		for (let mi = 0; mi < memberCount; mi++) {
			const variable = dailyBlock.variables(vi * memberCount + mi);
			if (!variable) continue;
			members.push(getValues(variable));
			if (mi === 0) unitStr = unitToDisplayString(variable.unit());
		}

		const mean = new Array<number>(timeLength).fill(NaN);
		const min = new Array<number>(timeLength).fill(NaN);
		const max = new Array<number>(timeLength).fill(NaN);
		const p25 = new Array<number>(timeLength).fill(NaN);
		const p75 = new Array<number>(timeLength).fill(NaN);

		for (let t = 0; t < timeLength; t++) {
			const values: number[] = [];
			for (const memberValues of members) {
				const val = memberValues[t];
				if (val != null && Number.isFinite(val)) values.push(val);
			}
			if (values.length === 0) continue;
			values.sort((a, b) => a - b);
			mean[t] = values.reduce((a, b) => a + b, 0) / values.length;
			min[t] = values[0];
			max[t] = values[values.length - 1];
			p25[t] = percentileSorted(values, 0.25);
			p75[t] = percentileSorted(values, 0.75);
		}

		variables[dailyVars[vi]] = { members, mean, min, max, p25, p75, unit: unitStr };
	}

	// Past the model's horizon every member is empty (or padded to a constant
	// zero); cut the axis at the last day that carries real spread.
	const sentinel = variables[dailyVars[0]];
	let validLength = timeLength;
	if (sentinel) {
		let last = 0;
		for (let t = 0; t < timeLength; t++) {
			const hasSpread = !(sentinel.min[t] === 0 && sentinel.max[t] === 0);
			if (Number.isFinite(sentinel.mean[t]) && hasSpread) last = t + 1;
		}
		validLength = last || timeLength;
	}

	if (validLength < timeLength) {
		for (const data of Object.values(variables)) {
			data.members = data.members.map((m) => m.slice(0, validLength));
			data.mean = data.mean.slice(0, validLength);
			data.min = data.min.slice(0, validLength);
			data.max = data.max.slice(0, validLength);
			data.p25 = data.p25.slice(0, validLength);
			data.p75 = data.p75.slice(0, validLength);
		}
	}

	const timestamps = allTimestamps.slice(0, validLength);
	// Shifted by the response's single offset (not the IANA zone) so each day
	// carries the exact local date the API labelled it with.
	const dailyDates = timestamps.map((t) => new Date(t + utcOffsetSeconds * 1000));

	return {
		variables,
		timestamps,
		dailyDates,
		dateKeys: dailyDates.map((d) => d.toISOString().slice(0, 10)),
		memberCount,
		utcOffsetSeconds,
		timezone
	};
}

// ─── Nearby cities snapshot ─────────────────────────────────────────────────────

export interface NearbyDaily {
	/** local calendar date ("yyyy-MM-dd") -> that day's summary for this city */
	byDate: Record<string, { weatherCode: number; max: number; min: number; precipitation: number }>;
}

export interface NearbySnapshotParams extends WeatherUnitParams {
	points: { latitude: number; longitude: number }[];
	past_days?: number;
	forecast_days?: number;
}

/**
 * Fetches a daily summary for several locations in one request - the forecast
 * API takes comma-separated coordinates and answers with one response per
 * point, in order.
 *
 * Deliberately runs on best_match: the nearby list can reach well past the
 * domain of whatever regional model the page is showing, and a row of dashes
 * is worse than a row from a model that covers everywhere.
 */
export async function fetchNearbyDaily(
	params: NearbySnapshotParams
): Promise<(NearbyDaily | null)[]> {
	if (params.points.length === 0) return [];

	const apiParams: Record<string, string> = {
		latitude: params.points.map((p) => p.latitude).join(','),
		longitude: params.points.map((p) => p.longitude).join(','),
		daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
		temperature_unit: params.temperature_unit ?? 'celsius',
		wind_speed_unit: params.wind_speed_unit ?? 'kmh',
		precipitation_unit: params.precipitation_unit ?? 'mm',
		past_days: String(params.past_days ?? 3),
		forecast_days: String(params.forecast_days ?? 16),
		timezone: 'auto'
	};

	const responses = await fetchWeatherApi(FORECAST_URL, apiParams);

	return params.points.map((_, i) => {
		const response = responses[i];
		const dailyBlock = response?.daily();
		if (!dailyBlock) return null;

		const utcOffsetSeconds = response.utcOffsetSeconds();
		const codes = getValues(dailyBlock.variables(0)!);
		const max = getValues(dailyBlock.variables(1)!);
		const min = getValues(dailyBlock.variables(2)!);
		const precip = getValues(dailyBlock.variables(3)!);

		// Same convention as the seasonal fetch: shift by the response's own
		// offset, then read the calendar date off the ISO string.
		const byDate: NearbyDaily['byDate'] = {};
		getTimestamps(dailyBlock).forEach((t, d) => {
			const key = new Date(t + utcOffsetSeconds * 1000).toISOString().slice(0, 10);
			byDate[key] = {
				weatherCode: codes[d],
				max: max[d],
				min: min[d],
				precipitation: precip[d]
			};
		});
		return { byDate };
	});
}
