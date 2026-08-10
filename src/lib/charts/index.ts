/**
 * Canvas Charts — Barrel Export
 *
 * Usage:
 *   import { CanvasChart, buildDaylightBands, SERIES_COLORS } from '$lib/charts';
 */

export {
	default as CanvasChart,
	setGroupHover,
	setGroupRange,
	registerGroupMember,
	groupRange,
	groupHover
} from './CanvasChart.svelte';
export type {
	ChartAgreementPoint,
	ChartAgreementStrip,
	ChartSeries
} from './CanvasChart.svelte';

export { buildDaylightBands } from './bands';
export type { DaylightBand } from './bands';

export { CHART_COLORS, SERIES_COLORS, calculateAverage, findUnit, isColumnUnit } from './data';
export type { AverageResult } from './data';
