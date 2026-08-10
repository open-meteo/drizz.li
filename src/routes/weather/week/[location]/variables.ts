/**
 * Registry of every variable that can be plotted on the customizable
 * meteograms. Each entry carries the metadata needed to build a chart series
 * (data field, render style, colour, unit family) so the panels can be
 * assembled dynamically from a user-defined layout.
 */
import { defaultVariablePrefs } from '$lib/stores/settings';

import * as m from '$lib/paraglide/messages';

import { getColor } from '../../utils/colors';
import {
	type WeatherUnits,
	getPrecipUnit,
	getTempUnit,
	getWindDirectionLabel,
	getWindUnit
} from './types';

import type { ChartSeries } from '$lib/charts';
import type { WeekHourlyData } from '$lib/services/weather';

/** Families of variables that share a y-axis and unit. */
export type UnitKind =
	'temp' | 'precip' | 'snow' | 'wind' | 'percent' | 'pressure' | 'uv' | 'distance' | 'energy';

export interface ChartVariableDef {
	/** Stable id used in the persisted layout */
	key: string;
	label: string;
	/** Short label for the tooltip / legend */
	short: string;
	/** Data array on the hourly response */
	field: keyof WeekHourlyData;
	/** Open-Meteo API variable name (defaults to `field` when identical) */
	api?: string;
	type: 'line' | 'bar';
	kind: UnitKind;
	color: string;
	dashed?: boolean;
	fill?: boolean;
	fillOpacity?: number;
	/** Area fill coloured by the value scale, fading out below the minimum */
	gradientFill?: boolean;
	width?: number;
	/** Stroke the line coloured by the temperature scale */
	colorScale?: boolean;
	/** Draw the line in the theme foreground (black/white), while colorScale still
	 *  drives the gradient fill */
	foregroundLine?: boolean;
	/** Draw a contrasting halo under the line */
	outline?: boolean;
	/** Annotate local minima / maxima with their value */
	extrema?: boolean;
	/** Draw weather-code pictograms across the top of the chart */
	pictograms?: boolean;
	/** Draw wind-direction arrows across the top of the chart */
	windArrows?: boolean;
	/** Marker-only variable (icons / arrows): contributes no plotted series */
	marker?: boolean;
	/** Render as a soft cloud band instead of a line */
	cloudBand?: boolean;
	/** Which slot the band occupies; omitted hangs from the top (total cover) */
	cloudLayer?: 'high' | 'mid' | 'low';
	/** Transform raw values before plotting (e.g. m → km) */
	transform?: (v: number) => number;
	/** Preset range to use when this variable lands on a shared right axis */
	rightPreset?: { min: number; max: number; invert?: boolean };
}

export const CHART_VARIABLES: ChartVariableDef[] = [
	{
		key: 'temperature',
		label: m.var_temperature(),
		short: m.var_temperature_short(),
		field: 'temperature_2m',
		type: 'line',
		kind: 'temp',
		color: '#ef6c00',
		width: 5.6,
		colorScale: true,
		foregroundLine: true,
		gradientFill: true,
		extrema: true
	},
	{
		key: 'weather_icons',
		label: m.var_icons(),
		short: m.var_icons_short(),
		field: 'weather_code',
		type: 'line',
		kind: 'temp',
		color: '#94a3b8',
		pictograms: true,
		marker: true
	},
	{
		key: 'apparent_temperature',
		label: m.var_apparent(),
		short: m.var_apparent_short(),
		field: 'apparent_temperature',
		type: 'line',
		kind: 'temp',
		color: '#c2410c',
		width: 2,
		dashed: true
	},
	{
		key: 'dew_point',
		label: m.var_dew_point(),
		short: m.var_dew_point_short(),
		field: 'dew_point_2m',
		type: 'line',
		kind: 'temp',
		color: '#0e7490',
		width: 2
	},
	{
		key: 'cloud_cover',
		label: m.var_cloud(),
		short: m.var_cloud_short(),
		field: 'cloud_cover',
		type: 'line',
		kind: 'percent',
		color: 'rgb(150, 155, 165)',
		cloudBand: true
	},
	// The three layers stack in their real vertical order (high at the top of the
	// plot, low at the bottom of the band group) and darken towards the ground,
	// the way the layers actually look from below.
	{
		key: 'cloud_cover_low',
		label: m.var_cloud_low(),
		short: m.var_cloud_low_short(),
		field: 'cloud_cover_low',
		type: 'line',
		kind: 'percent',
		color: 'rgb(110, 118, 132)',
		cloudBand: true,
		cloudLayer: 'low'
	},
	{
		key: 'cloud_cover_mid',
		label: m.var_cloud_mid(),
		short: m.var_cloud_mid_short(),
		field: 'cloud_cover_mid',
		type: 'line',
		kind: 'percent',
		color: 'rgb(148, 156, 170)',
		cloudBand: true,
		cloudLayer: 'mid'
	},
	{
		key: 'cloud_cover_high',
		label: m.var_cloud_high(),
		short: m.var_cloud_high_short(),
		field: 'cloud_cover_high',
		type: 'line',
		kind: 'percent',
		color: 'rgb(186, 194, 208)',
		cloudBand: true,
		cloudLayer: 'high'
	},
	{
		key: 'precipitation',
		label: m.var_precipitation(),
		short: m.var_precipitation_short(),
		field: 'precipitation',
		type: 'bar',
		kind: 'precip',
		color: 'rgba(30, 136, 229, 0.8)'
	},
	{
		key: 'precipitation_probability',
		label: m.var_pop(),
		short: m.var_pop_short(),
		field: 'precipitation_probability',
		type: 'line',
		kind: 'percent',
		color: '#5c6bc0',
		width: 2,
		dashed: true
	},
	{
		key: 'rain',
		label: m.var_rain(),
		short: m.var_rain_short(),
		field: 'rain',
		type: 'bar',
		kind: 'precip',
		color: 'rgba(37, 99, 235, 0.75)'
	},
	{
		key: 'showers',
		label: m.var_showers(),
		short: m.var_showers_short(),
		field: 'showers',
		type: 'bar',
		kind: 'precip',
		color: 'rgba(6, 182, 212, 0.75)'
	},
	{
		key: 'snowfall',
		label: m.var_snowfall(),
		short: m.var_snowfall_short(),
		field: 'snowfall',
		type: 'bar',
		kind: 'snow',
		color: 'rgba(147, 197, 253, 0.9)'
	},
	{
		key: 'wind',
		label: m.var_wind(),
		short: m.var_wind_short(),
		field: 'windspeed_10m',
		api: 'wind_speed_10m',
		type: 'line',
		kind: 'wind',
		color: '#26a69a',
		width: 2,
		fill: true,
		fillOpacity: 0.15
	},
	{
		key: 'wind_direction',
		label: m.var_wind_dir(),
		short: m.var_wind_dir_short(),
		field: 'winddirection_10m',
		api: 'wind_direction_10m',
		type: 'line',
		kind: 'wind',
		color: '#14b8a6',
		windArrows: true,
		marker: true
	},
	{
		key: 'wind_gusts',
		label: m.var_gusts(),
		short: m.var_gusts_short(),
		field: 'wind_gusts_10m',
		type: 'line',
		kind: 'wind',
		color: '#0d9488',
		width: 2,
		dashed: true
	},
	{
		key: 'humidity',
		label: m.var_humidity(),
		short: m.var_humidity_short(),
		field: 'relative_humidity_2m',
		type: 'line',
		kind: 'percent',
		color: '#8d6e63',
		width: 2,
		dashed: true
	},
	{
		key: 'pressure_msl',
		label: m.var_pressure(),
		short: m.var_pressure_short(),
		field: 'pressure_msl',
		type: 'line',
		kind: 'pressure',
		color: '#7c3aed',
		width: 2
	},
	{
		key: 'surface_pressure',
		label: m.var_surface_pressure(),
		short: m.var_surface_pressure_short(),
		field: 'surface_pressure',
		type: 'line',
		kind: 'pressure',
		color: '#a855f7',
		width: 2,
		dashed: true
	},
	{
		key: 'uv_index',
		label: m.var_uv(),
		short: m.var_uv_short(),
		field: 'uv_index',
		type: 'line',
		kind: 'uv',
		color: '#eab308',
		width: 2,
		fill: true,
		fillOpacity: 0.15
	},
	{
		key: 'visibility',
		label: m.var_visibility(),
		short: m.var_visibility_short(),
		field: 'visibility',
		type: 'line',
		kind: 'distance',
		color: '#0891b2',
		width: 2,
		transform: (v) => v / 1000
	},
	{
		key: 'cape',
		label: m.var_cape(),
		short: m.var_cape_short(),
		field: 'cape',
		type: 'line',
		kind: 'energy',
		color: '#dc2626',
		width: 2,
		fill: true,
		fillOpacity: 0.12
	}
];

export const VARIABLE_BY_KEY: Map<string, ChartVariableDef> = new Map(
	CHART_VARIABLES.map((v) => [v.key, v])
);

/** Open-Meteo API variable name for a registry entry. */
export function apiNameOf(def: ChartVariableDef): string {
	return def.api ?? def.field;
}

/**
 * The set of API hourly variables needed to render the current table rows and
 * chart layout, so the fetch requests only what is actually shown.
 */
export function neededHourlyApiVars(
	tablePrefs: Record<string, boolean> | undefined,
	layoutKeys: string[]
): string[] {
	const on = (key: string): boolean => tablePrefs?.[key] ?? defaultVariablePrefs.table[key] ?? true;
	const s = new Set<string>();

	// Hourly table rows
	if (on('icons')) s.add('weather_code');
	if (on('temperature')) s.add('temperature_2m');
	if (on('feels')) s.add('apparent_temperature');
	if (on('dew_point')) s.add('dew_point_2m');
	if (on('wind')) {
		s.add('wind_speed_10m');
		s.add('wind_direction_10m');
	}
	if (on('gusts')) s.add('wind_gusts_10m');
	if (on('humidity')) s.add('relative_humidity_2m');
	if (on('clouds')) s.add('cloud_cover');
	if (on('pressure')) s.add('pressure_msl');
	if (on('uv')) s.add('uv_index');
	if (on('visibility')) s.add('visibility');
	if (on('precipitation')) {
		s.add('precipitation');
		s.add('precipitation_probability');
	}
	if (on('snowfall')) s.add('snowfall');

	// Meteogram variables
	for (const key of layoutKeys) {
		const def = VARIABLE_BY_KEY.get(key);
		if (!def) continue;
		s.add(apiNameOf(def));
		if (def.pictograms) s.add('weather_code');
		if (def.windArrows || def.key === 'wind') s.add('wind_direction_10m');
	}

	return [...s];
}

/** Unit label for a variable family, honouring the user's unit settings. */
export function unitForKind(kind: UnitKind, units: WeatherUnits): string {
	switch (kind) {
		case 'temp':
			return getTempUnit(units);
		case 'precip':
			return getPrecipUnit(units);
		case 'snow':
			return 'cm';
		case 'wind':
			return getWindUnit(units);
		case 'percent':
			return '%';
		case 'pressure':
			return 'hPa';
		case 'uv':
			return '';
		case 'distance':
			return 'km';
		case 'energy':
			return 'J/kg';
	}
}

/** Families whose axis should always start at zero. */
export function isZeroBased(kind: UnitKind): boolean {
	return kind !== 'temp' && kind !== 'pressure';
}

/** Decimal places for on-chart extrema labels (kept coarse, like the cards). */
export function decimalsForKind(kind: UnitKind): number {
	switch (kind) {
		case 'precip':
		case 'snow':
		case 'uv':
		case 'distance':
			return 1;
		default:
			return 0;
	}
}

/**
 * Decimal places for the hover tooltip — finer than the cards / extrema labels
 * so the meteogram reveals more detail. Percentages stay whole numbers.
 */
export function tooltipDecimalsForKind(kind: UnitKind): number {
	switch (kind) {
		case 'percent':
		case 'energy':
			return 0;
		default:
			return 1;
	}
}

export interface PanelDef {
	series: ChartSeries[];
	unit: string;
	unitRight?: string;
	yMin?: number;
	yMinRight?: number;
	yMaxRight?: number;
	/** Breathing room (in axis units) above / below the left-axis data range. */
	yPadTop?: number;
	yPadBottom?: number;
	/** Whether the left axis should include zero (false for pressure) */
	zeroBaseLeft: boolean;
	hasPictograms: boolean;
	hasWindArrows: boolean;
}

/**
 * Builds a chart definition for one panel: turns its ordered variable keys into
 * series and works out the left / right axis units. The first variable's family
 * owns the left axis; the first differing family gets the right axis.
 */
export function buildPanelDef(
	variableKeys: string[],
	hourly: WeekHourlyData,
	units: WeatherUnits
): PanelDef {
	const allDefs = variableKeys
		.map((k) => VARIABLE_BY_KEY.get(k))
		.filter((d): d is ChartVariableDef => d != null);

	// Marker-only variables (weather icons) render no series, just a top row.
	const defs = allDefs.filter((d) => !d.marker);

	// Cloud-band variables float above the plot and don't claim an axis.
	const axisDefs = defs.filter((d) => !d.cloudBand);
	const kinds: UnitKind[] = [];
	for (const d of axisDefs) if (!kinds.includes(d.kind)) kinds.push(d.kind);
	const leftKind = kinds[0];
	const rightKind = kinds.find((k) => k !== leftKind);

	const series: ChartSeries[] = defs.map((d) => {
		const raw = (hourly[d.field] as number[]) ?? [];
		const data: (number | null)[] = d.transform
			? raw.map((v) => (v == null || !isFinite(v) ? null : d.transform!(v)))
			: raw;
		const kindUnit = unitForKind(d.kind, units);
		const dec = decimalsForKind(d.kind);
		const tipDec = tooltipDecimalsForKind(d.kind);
		const axis: 'left' | 'right' = d.cloudBand || d.kind === leftKind ? 'left' : 'right';

		return {
			name: d.label,
			shortName: d.short,
			type: d.type,
			color: d.color,
			data,
			width: d.width,
			fill: d.fill,
			fillOpacity: d.fillOpacity,
			gradientFill: d.gradientFill,
			dashed: d.dashed,
			axis,
			cloudBand: d.cloudBand,
			cloudLayer: d.cloudLayer,
			segmentColor: d.colorScale ? (v: number) => getColor(v, units.temperature_unit) : undefined,
			foregroundLine: d.foregroundLine,
			outline: d.outline,
			labelExtrema: d.extrema,
			labelFormat: d.extrema
				? (v: number) => (d.kind === 'temp' ? `${v.toFixed(0)}°` : `${v.toFixed(dec)}${kindUnit}`)
				: undefined,
			format:
				d.key === 'wind'
					? (v: number, i: number) => {
							const dir = hourly.winddirection_10m?.[i];
							const dl = dir != null && !isNaN(dir) ? ` (${getWindDirectionLabel(dir)})` : '';
							return `${v.toFixed(tipDec)} ${kindUnit}${dl}`;
						}
					: (v: number) => `${v.toFixed(tipDec)}${kindUnit ? ' ' + kindUnit : ''}`
		} satisfies ChartSeries;
	});

	const rightZero = rightKind ? isZeroBased(rightKind) : false;
	return {
		series,
		unit: leftKind ? unitForKind(leftKind, units) : '',
		unitRight: rightKind ? unitForKind(rightKind, units) : undefined,
		yMin: leftKind && isZeroBased(leftKind) ? 0 : undefined,
		// temperature curves shouldn't touch the frame: guarantee headroom above
		// the max and extra space below the min (extrema labels live there too)
		yPadTop: leftKind === 'temp' ? 3 : undefined,
		yPadBottom: leftKind === 'temp' ? 5 : undefined,
		// temperature and pressure sit far from zero, so their axis is derived from
		// the data range (a forced 0 baseline just wastes vertical space)
		zeroBaseLeft: leftKind ? isZeroBased(leftKind) : true,
		yMinRight: rightKind && rightZero ? 0 : undefined,
		yMaxRight: rightKind === 'percent' ? 100 : undefined,
		hasPictograms: allDefs.some((d) => d.pictograms),
		hasWindArrows: allDefs.some((d) => d.windArrows)
	};
}
