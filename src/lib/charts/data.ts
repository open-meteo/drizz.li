/**
 * Chart Data Helpers
 *
 * Shared color palette and data-processing helpers used by the chart pages.
 * Ported from the previous ECharts utilities so the visual identity and
 * calculations stay identical.
 */

// ─── Color Palette ───────────────────────────────────────────────────────────

/** Default series color palette matching the application's design system */
export const SERIES_COLORS = [
	'#5470c6',
	'#91cc75',
	'#fac858',
	'#ee6666',
	'#73c0de',
	'#3ba272',
	'#fc8452',
	'#9a60b4',
	'#ea7ccc',
	'#4dc9f6'
] as const;

/** Semantic colors used for specific chart elements */
export const CHART_COLORS = {
	average: '#5e5e5e',
	currentTimeLine: '#ef4444',
	daylight: 'rgba(255, 255, 194, 0.3)',
	memberLine: 'rgba(115, 192, 222, 0.45)'
} as const;

// ─── Utility: Detect column-type variables ───────────────────────────────────

/** Units that should be rendered as bar/column charts instead of lines. */
const COLUMN_UNITS = new Set(['mm', 'cm', 'in', 'inch', 'MJ/m²']);

/**
 * Returns true if the given unit should be rendered as a bar chart.
 */
export function isColumnUnit(unit: string): boolean {
	return COLUMN_UNITS.has(unit.trim());
}

// ─── Data Processing Helpers ─────────────────────────────────────────────────

export interface AverageResult {
	average: (number | null)[];
	averageCount: number[];
}

/**
 * Calculates per-timestep average and count from hourly model data.
 *
 * @param hourlyData - The `data.hourly` object from the API response
 * @param variable   - The variable prefix to filter on (e.g. 'temperature_2m')
 * @param timeLength - Number of timesteps
 * @returns Object containing running average and count arrays
 */
export function calculateAverage(
	hourlyData: Record<string, unknown>,
	variable: string,
	timeLength: number
): AverageResult {
	const totals = new Array<number>(timeLength).fill(0);
	const averageCount = new Array<number>(timeLength).fill(0);

	for (const [model, values] of Object.entries(hourlyData)) {
		if (model === 'time') continue;
		if (!model.startsWith(variable)) continue;

		for (const [index, val] of (values as number[]).entries()) {
			if (val !== null && val !== undefined && isFinite(val)) {
				if (index >= timeLength) continue;
				totals[index] += val;
				averageCount[index]++;
			}
		}
	}

	// Finalize average values
	const average = totals.map((total, i) =>
		averageCount[i] > 0 ? Math.round((total / averageCount[i]) * 10) / 10 : null
	);

	return { average, averageCount };
}

/**
 * Finds the unit string for a given variable from the hourly_units map.
 * Returns an empty string if the variable is not found.
 */
export function findUnit(
	hourlyUnits: Record<string, string>,
	hourlyData: Record<string, unknown>,
	variable: string
): string {
	for (const model of Object.keys(hourlyData)) {
		if (model === 'time') continue;
		if (model.startsWith(variable) && hourlyUnits[model]) {
			return hourlyUnits[model];
		}
	}
	return '';
}
