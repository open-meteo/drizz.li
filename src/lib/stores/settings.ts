import { writable } from 'svelte/store';

import { persisted } from 'svelte-persisted-store';

export interface GeoLocation {
	id: number;
	name: string;
	latitude: number;
	longitude: number;
	elevation: number;
	feature_code: string;
	country_code: string | undefined;
	admin1_id: number | undefined;
	admin3_id?: number | undefined;
	admin4_id?: number | undefined;
	timezone: string;
	population: number | undefined;
	postcodes: string[] | undefined;
	country_id: number | undefined;
	country: string | undefined;
	admin1: string | undefined;
	admin3?: string | undefined;
	admin4?: string | undefined;
}

export const defaultLocation: GeoLocation = {
	id: 2950159,
	name: 'Berlin',
	latitude: 52.52437,
	longitude: 13.41053,
	elevation: 74,
	feature_code: 'PPLC',
	country_code: 'DE',
	admin1_id: 2950157,
	admin3_id: 6547383,
	admin4_id: 6547539,
	timezone: 'Europe/Berlin',
	population: 3426354,
	postcodes: ['10967', '13347'],
	country_id: 2921044,
	country: 'Germany',
	admin1: 'Land Berlin',
	admin3: 'Berlin, Stadt',
	admin4: 'Berlin'
};

const LOCATION_KEY = 'stored_location';

export const storedLocation = persisted(LOCATION_KEY, defaultLocation as GeoLocation);

/**
 * Whether the browser has settled on a location to show.
 *
 * `storedLocation` always holds something - prerendering needs a shape to
 * render - which makes it useless for telling "this is the visitor's place"
 * apart from "nobody has looked yet". Everything that shows a location off the
 * store rather than off the URL (the topbar pill, the weather hero) renders a
 * placeholder while this is false, instead of a German flag for a visitor who
 * has never been here.
 */
export const locationKnown = writable(false);

/** True when this browser picked a location of its own at some point. */
export function hasStoredLocation(): boolean {
	try {
		return typeof localStorage !== 'undefined' && localStorage.getItem(LOCATION_KEY) !== null;
	} catch {
		// storage disabled: no persisted choice to find, which is the answer
		return false;
	}
}

/** Records the location the visitor is currently looking at. */
export function setActiveLocation(location: GeoLocation): void {
	storedLocation.set(location);
	locationKnown.set(true);
}

export type Theme = 'system' | 'light' | 'dark';

export const storedTheme = persisted<Theme>('theme', 'system');

/** Selected forecast model, shared across the whole site. */
export const storedModel = persisted<string>('selected_model', 'best_match');

/** Which variables are visible in the hourly table and the meteograms. */
export interface VariablePrefs {
	table: Record<string, boolean>;
	charts: Record<string, boolean>;
}

export const defaultVariablePrefs: VariablePrefs = {
	table: {
		icons: true,
		temperature: true,
		feels: true,
		wind: true,
		humidity: true,
		clouds: true,
		precipitation: true,
		// extra rows, off by default
		dew_point: false,
		gusts: false,
		pressure: false,
		uv: false,
		visibility: false,
		snowfall: false
	},
	charts: {
		temperature: true,
		cloud_cover: true,
		precipitation: true,
		precipitation_probability: true,
		wind: true,
		humidity: true
	}
};

export const storedVariablePrefs = persisted<VariablePrefs>('variable_prefs', defaultVariablePrefs);

/** Order of the hourly-table rows (visibility is the separate toggle above). */
export const defaultTableRowOrder: string[] = [
	'icons',
	'temperature',
	'feels',
	'dew_point',
	'wind',
	'gusts',
	'humidity',
	'clouds',
	'pressure',
	'uv',
	'visibility',
	'precipitation',
	'snowfall'
];

export const storedTableRowOrder = persisted<string[]>('table_row_order_v1', defaultTableRowOrder);

/**
 * Normalizes a stored row order against the known rows: drops keys that no
 * longer exist and appends new rows (added after the user last saved) at the
 * end, so stored orders survive app updates.
 */
export function mergeTableRowOrder(stored: string[]): string[] {
	return [
		...stored.filter((k) => defaultTableRowOrder.includes(k)),
		...defaultTableRowOrder.filter((k) => !stored.includes(k))
	];
}

/** Hourly table interval: 3-hourly (default) or 1-hourly. */
export const storedHourlyInterval = persisted<1 | 3>('hourly_interval', 3);

/**
 * Meteogram layout: an ordered list of chart panels, each holding an ordered
 * list of variable keys (see the chart variable registry). Users drag
 * variables between panels to fully customise the meteograms.
 */
export interface ChartPanel {
	id: string;
	variables: string[];
}

export const defaultChartLayout: ChartPanel[] = [
	{ id: 'panel-1', variables: ['temperature', 'weather_icons'] },
	{ id: 'panel-2', variables: ['precipitation', 'precipitation_probability', 'cloud_cover'] },
	{ id: 'panel-3', variables: ['wind', 'wind_gusts', 'wind_direction'] }
];

export const storedChartLayout = persisted<ChartPanel[]>('chart_layout_v1', defaultChartLayout);

/**
 * Time range the meteograms open on. 'auto' narrows to three days on a phone,
 * where a full week of hours is too dense to read, and shows everything on
 * roomier screens.
 */
export type ChartRangePref = 'auto' | 'today' | '3d' | '5d' | 'all';

export const storedChartRange = persisted<ChartRangePref>('chart_range_v1', 'auto');

/** Selected ensemble model for the 14-day spread forecast. */
export const storedEnsembleModel = persisted<string>('ensemble_model', 'ncep_gefs_seamless');

/** Reanalysis used on the historical page, and the seasonal model. */
export const storedArchiveModel = persisted<string>('archive_model', 'best_match');
export const storedSeasonalModel = persisted<string>('seasonal_model', 'best_match');

/** Measurement units, shared across every forecast page and persisted. */
export interface UnitPrefs {
	temperature_unit: 'celsius' | 'fahrenheit';
	wind_speed_unit: 'kmh' | 'ms' | 'mph' | 'kn';
	precipitation_unit: 'mm' | 'inch';
}

export const defaultUnits: UnitPrefs = {
	temperature_unit: 'celsius',
	wind_speed_unit: 'kmh',
	precipitation_unit: 'mm'
};

export const storedUnits = persisted<UnitPrefs>('units_v1', defaultUnits);

/**
 * Whether the "nearby cities" panel on the week page is open.
 *
 * Persisted because it decides whether the panel's data is fetched at all: it
 * costs a city-tile download plus a ten-location request, and someone who has
 * closed it should not pay for that again on the next page they open.
 */
export const storedNearbyOpen = persisted<boolean>('nearby_open_v1', true);

/** Recently visited and starred locations, shown in the search dropdown. */
export const storedRecentLocations = persisted<GeoLocation[]>('recent_locations_v1', []);
export const storedFavoriteLocations = persisted<GeoLocation[]>('favorite_locations_v1', []);

/** Stable key for de-duping locations (geocoding id, or rounded coordinates). */
export function locationKey(l: GeoLocation): string {
	return l.id && l.id !== 0 ? `id:${l.id}` : `c:${l.latitude.toFixed(3)},${l.longitude.toFixed(3)}`;
}
