import { modelGroups } from '../../routes/weather/options';

export interface SoundingCapability {
	levels: readonly number[];
	forecastDays: number;
}

// Pressure-level sets from Open-Meteo's provider documentation and downloaders.
// These are API sampling levels, not a claim about native model resolution.
// https://open-meteo.com/en/docs#pressure_level_variables
const ICON = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200, 150, 100];
const ICON_D2 = [1000, 975, 950, 850, 700, 600, 500, 400, 300, 250, 200];
const ECMWF = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100];
const GFS = Array.from({ length: 37 }, (_, i) => 1000 - i * 25);
const MF = [
	1000, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 275, 250, 225,
	200, 175, 150, 125, 100
];
const UKMO = [
	1000, 975, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 375, 350, 325, 300,
	275, 250, 225, 200, 175, 150, 125, 100
];
const KNMI = [925, 850, 700, 500, 300];
const GEM = [
	1015, 1000, 985, 970, 950, 925, 900, 875, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350,
	300, 275, 250, 225, 200, 175, 150, 100
];
const CHMI = [1000, 950, 925, 850, 800, 700, 600, 500, 450, 400, 350, 300, 275, 250, 200, 150, 100];

const capability = (levels: readonly number[], forecastDays: number): SoundingCapability => ({
	levels,
	forecastDays
});

export const SOUNDING_MODELS: Record<string, SoundingCapability> = {
	best_match: capability(ICON, 16),
	icon_seamless: capability(ICON, 8),
	icon_global: capability(ICON, 8),
	icon_eu: capability(ICON, 5),
	icon_d2: capability(ICON_D2, 3),
	gfs_seamless: capability(GFS, 16),
	gfs_global: capability(GFS, 16),
	gfs_hrrr: capability(GFS, 3),
	gfs_graphcast025: capability(ECMWF, 16),
	ncep_aigfs025: capability(ECMWF, 16),
	ncep_hgefs025_ensemble_mean: capability(ECMWF, 11),
	ecmwf_ifs025: capability(ECMWF, 16),
	ecmwf_aifs025_single: capability(ECMWF, 16),
	meteofrance_seamless: capability(MF, 5),
	meteofrance_arpege_world: capability(MF, 5),
	meteofrance_arpege_europe: capability(MF, 5),
	meteofrance_arome_france: capability(MF, 3),
	ukmo_seamless: capability(UKMO, 8),
	ukmo_global_deterministic_10km: capability(UKMO, 8),
	ukmo_uk_deterministic_2km: capability(UKMO, 3),
	knmi_seamless: capability(
		[...new Set([...KNMI, ...ECMWF])].sort((a, b) => b - a),
		16
	),
	knmi_harmonie_arome_europe: capability(KNMI, 3),
	knmi_harmonie_arome_netherlands: capability(KNMI, 3),
	dmi_seamless: capability(ECMWF, 16),
	metno_seamless: capability(ECMWF, 16),
	chmi_aladin_seamless: capability(
		[...new Set([...CHMI, ...ECMWF])].sort((a, b) => b - a),
		16
	),
	chmi_aladin_central_europe_2km: capability(CHMI, 4),
	jma_seamless: capability(ICON, 12),
	jma_gsm: capability(ICON, 12),
	jma_msm: capability(ICON, 4),
	cma_grapes_global: capability(
		[...new Set([...MF, 975])].sort((a, b) => b - a),
		11
	),
	gem_seamless: capability(GEM, 11),
	gem_global: capability(GEM, 11),
	gem_regional: capability(GEM, 4),
	gem_hrdps_west: capability(
		GEM.filter((p) => p !== 875),
		3
	),
	italia_meteo_arpae_icon_2i: capability([1000, 925, 850, 700, 500, 250], 4)
};

// Surface-only products; keep this explicit so new catalogue entries get reviewed.
export const SURFACE_ONLY_MODELS = [
	'ecmwf_ifs',
	'ncep_nbm_conus',
	'ncep_nam_conus',
	'meteofrance_arome_france_hd',
	'dmi_harmonie_arome_europe',
	'metno_nordic',
	'meteoswiss_icon_ch1',
	'meteoswiss_icon_ch2',
	'meteoswiss_icon_seamless',
	'chmi_aladin_cz_1km'
];

export const soundingModelGroups = modelGroups
	.map((group) => ({
		...group,
		models: group.models.filter((model) => Object.hasOwn(SOUNDING_MODELS, model.value))
	}))
	.filter((group) => group.models.length > 0);

export function soundingModel(value: string | null | undefined): string {
	return value && Object.hasOwn(SOUNDING_MODELS, value) ? value : 'best_match';
}

export const TOP_PRESSURES = [100, 200, 300, 500, 700] as const;

// Offer the preceding seven days from the normal forecast endpoint.
export const SOUNDING_PAST_DAYS = 7;
