import type { DaylightBand, WeekDailyData, WeekHourlyData } from '$lib/services/weather';

export interface WeatherUnits {
	temperature_unit: string;
	wind_speed_unit: string;
	precipitation_unit: string;
}

export interface FetchedHourly {
	hourly: WeekHourlyData;
	utc_offset_seconds: number;
	timezone: string;
	timestamps: number[];
	hourlyDates: Date[];
	daylightBands: DaylightBand[];
}

export interface FetchedDaily {
	daily: WeekDailyData;
	timezone: string;
	dailyDates: Date[];
	/** Locally computed sunrise→sunset weather code per day (falls back to daily.weather_code). */
	dayCodes?: number[];
	/** Locally computed sunset→next-sunrise weather code per day. */
	nightCodes?: number[];
}

export const getTempUnit = (units: WeatherUnits): '°C' | '°F' => {
	return units.temperature_unit === 'celsius' ? '°C' : '°F';
};

export const getWindUnit = (units: WeatherUnits): string => {
	return units.wind_speed_unit === 'kmh' ? 'km/h' : units.wind_speed_unit;
};

export const getPrecipUnit = (units: WeatherUnits): 'mm' | 'in' => {
	return units.precipitation_unit === 'mm' ? 'mm' : 'in';
};

export const getWindArrowRotation = (deg: number): string => {
	return `rotate(${deg}deg)`;
};

export const getWindDirectionLabel = (deg: number): string => {
	const dirs = [
		'N',
		'NNE',
		'NE',
		'ENE',
		'E',
		'ESE',
		'SE',
		'SSE',
		'S',
		'SSW',
		'SW',
		'WSW',
		'W',
		'WNW',
		'NW',
		'NNW'
	];
	return dirs[Math.round(deg / 22.5) % 16];
};
