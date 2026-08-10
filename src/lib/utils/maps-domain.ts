/**
 * Translates drizzli's model ids (Open-Meteo API model names, see
 * src/routes/weather/options.ts) into domain values understood by the maps
 * viewer (open-meteo/maps, weather-map-layer src/domains.ts).
 *
 * The map advertises the domains it actually supports in its `om-maps:ready`
 * handshake; candidates are tried in order and the first advertised one wins.
 * Seamless API models list their seamless domain first, so they upgrade
 * automatically once the maps app ships seamless support; until then they fall
 * back to their widest-coverage member (a regional member could be entirely
 * off-screen). Models without an entry are tried under their own id; models
 * the map does not serve at all (best_match, google, UKMO ensembles)
 * resolve to null.
 */
const modelDomainCandidates: Record<string, string[]> = {
	// DWD Germany
	icon_seamless: ['dwd_icon_seamless', 'dwd_icon'],
	icon_global: ['dwd_icon'],
	icon_eu: ['dwd_icon_eu'],
	icon_d2: ['dwd_icon_d2'],

	// NOAA U.S.
	gfs_seamless: ['ncep_gfs_seamless', 'ncep_gfs013'],
	gfs_global: ['ncep_gfs013'],
	gfs_hrrr: ['ncep_hrrr_conus'],
	gfs_graphcast025: ['ncep_gfs_graphcast025'],

	// Météo-France
	meteofrance_seamless: ['meteofrance_seamless', 'meteofrance_arpege_world025'],
	meteofrance_arpege_world: ['meteofrance_arpege_world025'],
	meteofrance_arome_france: ['meteofrance_arome_france0025'],

	// UK Met Office
	ukmo_seamless: ['ukmo_seamless', 'ukmo_global_deterministic_10km'],

	// KNMI Netherlands
	knmi_seamless: ['knmi_seamless', 'knmi_harmonie_arome_europe'],

	// DMI Denmark (no DMI seamless domain in the maps project)
	dmi_seamless: ['dmi_harmonie_arome_europe'],

	// MET Norway
	metno_seamless: ['metno_nordic_pp'],
	metno_nordic: ['metno_nordic_pp'],

	// MeteoSwiss (CH2 covers a wider area than CH1)
	meteoswiss_icon_seamless: ['meteoswiss_icon_ch2'],

	// CHMI Czech Republic (Central Europe is the widest native domain)
	chmi_aladin_seamless: ['chmi_aladin_seamless', 'chmi_aladin_central_europe_2km'],

	// JMA Japan
	jma_seamless: ['jma_seamless', 'jma_gsm'],

	// GEM Canada (gdps/rdps carry resolution suffixes in newer map builds;
	// older builds advertise the plain names, so try both)
	gem_seamless: ['cmc_gem_seamless', 'cmc_gem_gdps_15km', 'cmc_gem_gdps'],
	gem_global: ['cmc_gem_gdps_15km', 'cmc_gem_gdps'],
	gem_regional: ['cmc_gem_rdps_10km', 'cmc_gem_rdps'],

	// Ensemble models
	icon_seamless_eps: ['dwd_icon_eps'],
	icon_global_eps: ['dwd_icon_eps'],
	icon_eu_eps: ['dwd_icon_eu_eps'],
	icon_d2_eps: ['dwd_icon_d2_eps'],
	ncep_gefs_seamless: ['ncep_gefs025'],
	gem_global_ensemble: ['cmc_gem_geps']
};

/** Resolve a model id to a maps domain the map advertised as supported. */
export const mapsDomainForModel = (
	model: string,
	supportedDomains: ReadonlySet<string>
): string | null => {
	for (const candidate of modelDomainCandidates[model] ?? [model]) {
		if (supportedDomains.has(candidate)) return candidate;
	}
	return null;
};
