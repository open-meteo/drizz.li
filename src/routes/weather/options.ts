export const defaultParameters = {
	timeformat: 'iso8601',
	wind_speed_unit: 'kmh',
	temperature_unit: 'celsius',
	precipitation_unit: 'mm'
};

export interface WeatherModel {
	value: string;
	label: string;
	/** Native grid resolution, from open-meteo/weather-map-layer domains.ts */
	resolution?: string;
	/** Model-run cadence (model_interval), from domains.ts */
	update?: string;
}

export interface WeatherModelGroup {
	value: string;
	label: string;
	models: WeatherModel[];
}

/**
 * Forecast models grouped by provider. Labels, grid resolutions and update
 * cadences are synced from the open-meteo/weather-map-layer project
 * (src/domains.ts: domainGroups + domainOptions grid/model_interval data).
 */
export const modelGroups: WeatherModelGroup[] = [
	{
		value: 'automatic_seamless',
		label: 'Automatic & seamless',
		models: [
			{ value: 'best_match', label: 'Best match', resolution: 'varies', update: 'varies' },
			{
				value: 'icon_seamless',
				label: 'DWD ICON Seamless',
				resolution: '2-13 km',
				update: 'every 3 h'
			},
			{ value: 'gfs_seamless', label: 'GFS Seamless', resolution: '3-25 km', update: 'every hour' },
			{
				value: 'meteofrance_seamless',
				label: 'MF Seamless',
				resolution: '1-25 km',
				update: 'every 3 h'
			},
			{
				value: 'ukmo_seamless',
				label: 'UKMO Seamless',
				resolution: '2-10 km',
				update: 'every 3 h'
			},
			{
				value: 'knmi_seamless',
				label: 'KNMI Seamless',
				resolution: '2-3 km',
				update: 'every hour'
			},
			{ value: 'dmi_seamless', label: 'DMI Seamless', resolution: '2 km', update: 'every 3 h' },
			{
				value: 'metno_seamless',
				label: 'MET Norway Seamless',
				resolution: '1 km',
				update: 'every 3 h'
			},
			{
				value: 'meteoswiss_icon_seamless',
				label: 'MeteoSwiss ICON Seamless',
				resolution: '1-2 km',
				update: 'every 3 h'
			},
			{
				value: 'chmi_aladin_seamless',
				label: 'CHMI Aladin Seamless',
				resolution: '1-2.3 km',
				update: 'every 6 h'
			},
			{ value: 'jma_seamless', label: 'JMA Seamless', resolution: '5-55 km', update: 'every 3 h' },
			{ value: 'gem_seamless', label: 'GEM Seamless', resolution: '1-15 km', update: 'every 6 h' }
		]
	},
	{
		value: 'ecmwf',
		label: 'ECMWF',
		models: [
			{ value: 'ecmwf_ifs', label: 'ECMWF IFS HRES', resolution: '9 km', update: 'every 6 h' },
			{ value: 'ecmwf_ifs025', label: 'ECMWF IFS 0.25°', resolution: '25 km', update: 'every 6 h' },
			{
				value: 'ecmwf_aifs025_single',
				label: 'ECMWF AIFS 0.25° Single',
				resolution: '25 km',
				update: 'every 6 h'
			}
		]
	},
	{
		value: 'dwd',
		label: 'DWD Germany',
		models: [
			{ value: 'icon_global', label: 'DWD ICON', resolution: '13 km', update: 'every 6 h' },
			{ value: 'icon_eu', label: 'DWD ICON EU', resolution: '7 km', update: 'every 3 h' },
			{ value: 'icon_d2', label: 'DWD ICON D2', resolution: '2 km', update: 'every 3 h' }
		]
	},
	{
		value: 'ncep',
		label: 'NOAA U.S.',
		models: [
			{ value: 'gfs_global', label: 'GFS Global', resolution: '13 km', update: 'every 6 h' },
			{ value: 'gfs_hrrr', label: 'GFS HRRR Conus', resolution: '3 km', update: 'every hour' },
			{
				value: 'gfs_graphcast025',
				label: 'GFS GraphCast 0.25°',
				resolution: '25 km',
				update: 'every 6 h'
			},
			{
				value: 'ncep_aigfs025',
				label: 'GFS AIGFS 0.25°',
				resolution: '25 km',
				update: 'every 6 h'
			},
			{
				value: 'ncep_hgefs025_ensemble_mean',
				label: 'GFS HGEFS 0.25° Ensemble Mean',
				resolution: '25 km',
				update: 'every 6 h'
			},
			{
				value: 'ncep_nbm_conus',
				label: 'GFS NBM Conus',
				resolution: '2.5 km',
				update: 'every hour'
			},
			{ value: 'ncep_nam_conus', label: 'GFS NAM Conus', resolution: '12 km', update: 'every 6 h' }
		]
	},
	{
		value: 'meteofrance',
		label: 'Météo-France',
		models: [
			{
				value: 'meteofrance_arpege_world',
				label: 'MF ARPEGE World',
				resolution: '25 km',
				update: 'every 3 h'
			},
			{
				value: 'meteofrance_arpege_europe',
				label: 'MF ARPEGE Europe',
				resolution: '10 km',
				update: 'every 3 h'
			},
			{
				value: 'meteofrance_arome_france',
				label: 'MF AROME France',
				resolution: '2.5 km',
				update: 'every 3 h'
			},
			{
				value: 'meteofrance_arome_france_hd',
				label: 'MF AROME France HD',
				resolution: '1 km',
				update: 'every 3 h'
			}
		]
	},
	{
		value: 'ukmo',
		label: 'UK Met Office',
		models: [
			{
				value: 'ukmo_global_deterministic_10km',
				label: 'UK Met Office 10km',
				resolution: '10 km',
				update: 'every 3 h'
			},
			{
				value: 'ukmo_uk_deterministic_2km',
				label: 'UK Met Office 2km',
				resolution: '2 km',
				update: 'every 3 h'
			}
		]
	},
	{
		value: 'knmi',
		label: 'KNMI Netherlands',
		models: [
			{
				value: 'knmi_harmonie_arome_europe',
				label: 'KNMI Harmonie Arome Europe',
				resolution: '5.5 km',
				update: 'every hour'
			},
			{
				value: 'knmi_harmonie_arome_netherlands',
				label: 'KNMI Harmonie Arome Netherlands',
				resolution: '2 km',
				update: 'every hour'
			}
		]
	},
	{
		value: 'dmi',
		label: 'DMI Denmark',
		models: [
			{
				value: 'dmi_harmonie_arome_europe',
				label: 'DMI Harmonie Arome Europe',
				resolution: '2 km',
				update: 'every 3 h'
			}
		]
	},
	{
		value: 'metno',
		label: 'MET Norway',
		models: [
			{ value: 'metno_nordic', label: 'MET Norway Nordic', resolution: '1 km', update: 'every 3 h' }
		]
	},
	{
		value: 'meteoswiss',
		label: 'MeteoSwiss',
		models: [
			{
				value: 'meteoswiss_icon_ch1',
				label: 'MeteoSwiss ICON CH1',
				resolution: '1 km',
				update: 'every 3 h'
			},
			{
				value: 'meteoswiss_icon_ch2',
				label: 'MeteoSwiss ICON CH2',
				resolution: '2 km',
				update: 'every 3 h'
			}
		]
	},
	{
		value: 'jma',
		label: 'JMA Japan',
		models: [
			{ value: 'jma_msm', label: 'JMA MSM', resolution: '5 km', update: 'every 3 h' },
			{ value: 'jma_gsm', label: 'JMA GSM', resolution: '55 km', update: 'every 6 h' }
		]
	},
	{
		value: 'cma',
		label: 'CMA China',
		models: [
			{
				value: 'cma_grapes_global',
				label: 'CMA GRAPES Global',
				resolution: '14 km',
				update: 'every 6 h'
			}
		]
	},
	{
		value: 'chmi',
		label: 'CHMI Czech Republic',
		models: [
			{
				value: 'chmi_aladin_central_europe_2km',
				label: 'CHMI Aladin Central Europe 2km',
				resolution: '2.3 km',
				update: 'every 6 h'
			},
			{
				value: 'chmi_aladin_cz_1km',
				label: 'CHMI Aladin CZ 1km',
				resolution: '1 km',
				update: 'every 6 h'
			}
		]
	},
	{
		value: 'cmc_gem',
		label: 'GEM Canada',
		models: [
			{ value: 'gem_global', label: 'GEM Global', resolution: '15 km', update: 'every 12 h' },
			{ value: 'gem_regional', label: 'GEM Regional', resolution: '10 km', update: 'every 6 h' },
			{
				value: 'gem_hrdps_west',
				label: 'GEM HRDPS West',
				resolution: '1 km',
				update: 'every 12 h'
			}
		]
	},
	{
		value: 'italia_meteo',
		label: 'ItaliaMeteo',
		models: [
			{
				value: 'italia_meteo_arpae_icon_2i',
				label: 'IM ARPAE ICON 2i',
				resolution: '2.5 km',
				update: 'every 3 h'
			}
		]
	}
];

export const models: WeatherModel[] = modelGroups.flatMap((group) => group.models);

export const findModel = (value: string): WeatherModel | undefined =>
	models.find((model) => model.value === value);

export const hourly = [
	[
		{ value: 'temperature_2m', label: 'Temperature 2m' },
		{ value: 'relative_humidity_2m', label: 'Relative Humidity 2m' },
		{ value: 'dew_point_2m', label: 'Dew Point 2m' },
		{ value: 'apparent_temperature', label: 'Apparent Temperature' },
		{ value: 'precipitation_probability', label: 'Precipitation Probability' }
	],
	[
		{ value: 'precipitation', label: 'Precipitation' },
		{ value: 'rain', label: 'Rain' },
		{ value: 'showers', label: 'Showers' },
		{ value: 'snowfall', label: 'Snowfall' },
		{ value: 'weather_code', label: 'Weather Code' }
	],
	[
		{ value: 'pressure_msl', label: 'Pressure MSL' },
		{ value: 'surface_pressure', label: 'Surface Pressure' },
		{ value: 'cloud_cover', label: 'Cloud Cover' },
		{ value: 'cloud_cover_low', label: 'Cloud Cover Low' },
		{ value: 'cloud_cover_mid', label: 'Cloud Cover Mid' },
		{ value: 'cloud_cover_high', label: 'Cloud Cover High' }
	],
	[
		{ value: 'et0_fao_evapotranspiration', label: 'Evapotranspiration' },
		{ value: 'vapor_pressure_deficit', label: 'Vapour Pressure Deficit' },
		{ value: 'wind_speed_10m', label: 'Wind Speed 10m' },
		{ value: 'wind_speed_80m', label: 'Wind Speed 80m' },
		{ value: 'wind_speed_120m', label: 'Wind Speed 120m' },
		{ value: 'wind_speed_180m', label: 'Wind Speed 180m' },
		{ value: 'wind_direction_10m', label: 'Wind Direction 10m' },
		{ value: 'wind_direction_80m', label: 'Wind Direction 80m' },
		{ value: 'wind_direction_120m', label: 'Wind Direction 120m' },
		{ value: 'wind_direction_180m', label: 'Wind Direction 180m' },
		{ value: 'wind_gusts_10m', label: 'Wind Gusts 10m' }
	],
	[
		{ value: 'temperature_80m', label: 'Temperature 80m' },
		{ value: 'temperature_120m', label: 'Temperature 120m' },
		{ value: 'temperature_180m', label: 'Temperature 180m' }
	]
];

/**
 * Ensemble models for the 14-day spread forecast, synced from the
 * open-meteo/website project (src/routes/en/docs/ensemble-api/options.ts).
 * Resolutions/update cadences from weather-map-layer domains.ts where known.
 */
export const ensembleModelGroups: WeatherModelGroup[] = [
	{
		value: 'dwd',
		label: 'DWD Germany',
		models: [
			{
				value: 'icon_seamless_eps',
				label: 'DWD ICON EPS Seamless',
				resolution: '2-25 km',
				update: 'every 6 h'
			},
			{
				value: 'icon_global_eps',
				label: 'DWD ICON EPS Global',
				resolution: '25 km',
				update: 'every 12 h'
			},
			{ value: 'icon_eu_eps', label: 'DWD ICON EPS EU', resolution: '13 km', update: 'every 6 h' },
			{ value: 'icon_d2_eps', label: 'DWD ICON EPS D2', resolution: '2 km', update: 'every 6 h' }
		]
	},
	{
		value: 'ncep',
		label: 'NOAA U.S.',
		models: [
			{
				value: 'ncep_gefs_seamless',
				label: 'GFS Ensemble Seamless',
				resolution: '25-50 km',
				update: 'every 6 h'
			},
			{
				value: 'ncep_gefs025',
				label: 'GFS Ensemble 0.25°',
				resolution: '25 km',
				update: 'every 6 h'
			},
			{
				value: 'ncep_gefs05',
				label: 'GFS Ensemble 0.5°',
				resolution: '50 km',
				update: 'every 6 h'
			},
			{ value: 'ncep_aigefs025', label: 'AIGEFS 0.25°', resolution: '25 km', update: 'every 6 h' }
		]
	},
	{
		value: 'ecmwf',
		label: 'ECMWF',
		models: [
			{
				value: 'ecmwf_ifs025_ensemble',
				label: 'ECMWF IFS 0.25° Ensemble',
				resolution: '25 km',
				update: 'every 6 h'
			},
			{
				value: 'ecmwf_aifs025_ensemble',
				label: 'ECMWF AIFS 0.25° Ensemble',
				resolution: '25 km',
				update: 'every 6 h'
			}
		]
	},
	{
		value: 'cmc_gem',
		label: 'GEM Canada',
		models: [
			{
				value: 'gem_global_ensemble',
				label: 'GEM Global Ensemble',
				resolution: '50 km',
				update: 'every 12 h'
			}
		]
	},
	{
		value: 'ukmo',
		label: 'UK Met Office',
		models: [
			{
				value: 'ukmo_global_ensemble_20km',
				label: 'UK MetOffice Global 20km',
				resolution: '20 km'
			},
			{ value: 'ukmo_uk_ensemble_2km', label: 'UK MetOffice UK 2km', resolution: '2 km' }
		]
	},
	{
		value: 'meteoswiss',
		label: 'MeteoSwiss',
		models: [
			{
				value: 'meteoswiss_icon_ch1_ensemble',
				label: 'MeteoSwiss ICON CH1',
				resolution: '1 km',
				update: 'every 12 h'
			},
			{
				value: 'meteoswiss_icon_ch2_ensemble',
				label: 'MeteoSwiss ICON CH2',
				resolution: '2 km',
				update: 'every 12 h'
			}
		]
	},
	{
		value: 'google',
		label: 'Google',
		models: [{ value: 'google_weathernext2_ensemble', label: 'Google WeatherNext 2 Ensemble' }]
	}
];

export const ensembleModels: WeatherModel[] = ensembleModelGroups.flatMap((group) => group.models);

export const findEnsembleModel = (value: string): WeatherModel | undefined =>
	ensembleModels.find((model) => model.value === value);

/**
 * A city inside each regional model's domain, used to offer a way out when the
 * chosen model has no data for the current place. Keyed by the model-id prefix
 * so new variants of a domain are covered without another entry.
 */
const IN_DOMAIN_CITY: [string, { slug: string; label: string }][] = [
	['meteoswiss', { slug: 'zurich', label: 'Zürich' }],
	['italia_meteo', { slug: 'rome', label: 'Rome' }],
	['icon', { slug: 'berlin', label: 'Berlin' }],
	['dwd', { slug: 'berlin', label: 'Berlin' }],
	['meteofrance', { slug: 'paris', label: 'Paris' }],
	['arpege', { slug: 'paris', label: 'Paris' }],
	['arome', { slug: 'paris', label: 'Paris' }],
	['ukmo', { slug: 'london', label: 'London' }],
	['knmi', { slug: 'amsterdam', label: 'Amsterdam' }],
	['dmi', { slug: 'copenhagen', label: 'Copenhagen' }],
	['metno', { slug: 'oslo', label: 'Oslo' }],
	['ncep', { slug: 'new-york', label: 'New York' }],
	['gfs', { slug: 'new-york', label: 'New York' }],
	['hrrr', { slug: 'new-york', label: 'New York' }],
	['nbm', { slug: 'new-york', label: 'New York' }],
	['gem', { slug: 'toronto', label: 'Toronto' }],
	['jma', { slug: 'tokyo', label: 'Tokyo' }],
	['cma', { slug: 'beijing', label: 'Beijing' }]
];

/** Where this model definitely has data, or null for a global model. */
export function inDomainCity(model: string): { slug: string; label: string } | null {
	const hit = IN_DOMAIN_CITY.find(([prefix]) => model.startsWith(prefix));
	return hit ? hit[1] : null;
}

/** Reanalyses the archive API accepts (verified against archive-api.open-meteo.com). */
export const archiveModelGroups: WeatherModelGroup[] = [
	{
		value: 'auto',
		label: 'Automatic',
		models: [{ value: 'best_match', label: 'Best match', resolution: 'varies', update: 'daily' }]
	},
	{
		value: 'era5',
		label: 'ECMWF reanalysis',
		models: [
			{ value: 'era5_seamless', label: 'ERA5 seamless', resolution: '9-25 km', update: 'daily' },
			{ value: 'era5', label: 'ERA5', resolution: '25 km', update: 'daily' },
			{ value: 'era5_land', label: 'ERA5-Land', resolution: '9 km', update: 'daily' },
			{ value: 'ecmwf_ifs', label: 'ECMWF IFS', resolution: '9 km', update: 'daily' }
		]
	},
	{
		value: 'regional',
		label: 'Regional reanalysis',
		models: [{ value: 'cerra', label: 'CERRA (Europe)', resolution: '5 km', update: 'daily' }]
	}
];

/** Seasonal models the seasonal API accepts. */
export const seasonalModelGroups: WeatherModelGroup[] = [
	{
		value: 'auto',
		label: 'Automatic',
		models: [{ value: 'best_match', label: 'Best match', resolution: 'varies', update: 'monthly' }]
	},
	{
		value: 'ecmwf',
		label: 'ECMWF',
		models: [
			{
				value: 'ecmwf_seasonal_seamless',
				label: 'ECMWF SEAS5',
				resolution: '36 km',
				update: 'monthly'
			}
		]
	}
];
