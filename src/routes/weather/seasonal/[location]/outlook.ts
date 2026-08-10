/**
 * Turns the raw seasonal ensemble into the per-calendar-month outlook the page
 * shows. Seasonal models carry no day-to-day skill, so everything here is an
 * aggregate: monthly means, the departure from the climate normal, and how much
 * of the ensemble actually agrees on that departure.
 */
import {
	type ClimateNormals,
	type SeasonalForecastResult,
	monthDayToOrdinal
} from '$lib/services/weather';

export interface MonthOutlook {
	/** `YYYY-MM` in the location's local calendar. */
	key: string;
	/** Month name and year, e.g. "August 2026". */
	label: string;
	/** Forecast days covered (a leading/trailing month is usually incomplete). */
	days: number;
	partial: boolean;
	tMean: number;
	tMax: number;
	tMin: number;
	/** Mean temperature minus the climate normal, or null without normals. */
	anomaly: number | null;
	precip: number;
	precipNormal: number | null;
	/** Forecast precipitation as a share of normal (1 = exactly normal). */
	precipShare: number | null;
	wetDays: number;
	/** Share of ensemble members whose monthly mean is above the normal. */
	warmerShare: number;
}

const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

// The month key already carries the local calendar month, so the label is
// formatted in UTC - anything zone-aware would just reintroduce the shift.
const MONTH_LABEL = new Intl.DateTimeFormat(undefined, {
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC'
});

const mean = (xs: number[]): number =>
	xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

/** Days in a calendar month; `month` is 1-based. */
function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

interface BuildOptions {
	/** Daily total counted as a wet day, in the active precipitation unit. */
	wetDayThreshold: number;
}

export function buildMonthOutlooks(
	result: SeasonalForecastResult,
	normals: ClimateNormals | null,
	{ wetDayThreshold }: BuildOptions
): MonthOutlook[] {
	const tMeanVar = result.variables['temperature_2m_mean'];
	const tMaxVar = result.variables['temperature_2m_max'];
	const tMinVar = result.variables['temperature_2m_min'];
	const precipVar = result.variables['precipitation_sum'];
	if (!tMeanVar) return [];

	const { dateKeys } = result;

	// Day indices grouped by calendar month, plus the normals lookup per day.
	// Both read the API's own local dates: deriving them from the instants would
	// double-count the day a DST change falls on.
	const groups = new Map<string, number[]>();
	const ordinals = dateKeys.map((key) =>
		monthDayToOrdinal(Number(key.slice(5, 7)), Number(key.slice(8, 10)))
	);

	for (let i = 0; i < dateKeys.length; i++) {
		const key = dateKeys[i].slice(0, 7);
		const bucket = groups.get(key);
		if (bucket) bucket.push(i);
		else groups.set(key, [i]);
	}

	const months: MonthOutlook[] = [];

	for (const [key, indices] of groups) {
		const pick = (values: number[] | undefined): number =>
			values ? mean(indices.map((i) => values[i]).filter(finite)) : NaN;

		const [year, month] = key.split('-').map(Number);

		// Normals are per day-of-year, so the comparison uses exactly the days the
		// forecast covers - a half month is never compared against a full one.
		let normalMean = NaN;
		let normalPrecip = NaN;
		if (normals) {
			normalMean = mean(indices.map((i) => normals.tmean[ordinals[i]]).filter(finite));
			const np = indices.map((i) => normals.precip[ordinals[i]]).filter(finite);
			if (np.length) normalPrecip = np.reduce((a, b) => a + b, 0);
		}

		const tMean = pick(tMeanVar.mean);

		// Per-member monthly means decide the agreement share: a member counts as
		// warmer only if it beats the same normal the anomaly is measured against.
		let warmer = 0;
		let counted = 0;
		if (finite(normalMean)) {
			for (const member of tMeanVar.members) {
				const memberMean = mean(indices.map((i) => member[i]).filter(finite));
				if (!finite(memberMean)) continue;
				counted++;
				if (memberMean > normalMean) warmer++;
			}
		}

		const precipDays = precipVar ? indices.map((i) => precipVar.mean[i]).filter(finite) : [];
		const precip = precipDays.reduce((a, b) => a + b, 0);

		months.push({
			key,
			label: MONTH_LABEL.format(Date.UTC(year, month - 1, 1)),
			days: indices.length,
			partial: indices.length < daysInMonth(year, month),
			tMean,
			tMax: pick(tMaxVar?.mean),
			tMin: pick(tMinVar?.mean),
			anomaly: finite(normalMean) && finite(tMean) ? tMean - normalMean : null,
			precip,
			precipNormal: finite(normalPrecip) ? normalPrecip : null,
			precipShare: finite(normalPrecip) && normalPrecip > 0 ? precip / normalPrecip : null,
			wetDays: precipDays.filter((p) => p >= wetDayThreshold).length,
			warmerShare: counted > 0 ? warmer / counted : 0.5
		});
	}

	return months;
}

/**
 * Narrows an outlook to its first `days` days. The fetch always asks for the
 * model's full horizon, so the range buttons only reslice what is already in
 * memory instead of issuing another (large) request.
 */
export function sliceSeasonal(
	result: SeasonalForecastResult,
	days: number
): SeasonalForecastResult {
	if (days >= result.timestamps.length) return result;

	const variables: SeasonalForecastResult['variables'] = {};
	for (const [name, data] of Object.entries(result.variables)) {
		variables[name] = {
			members: data.members.map((m) => m.slice(0, days)),
			mean: data.mean.slice(0, days),
			min: data.min.slice(0, days),
			max: data.max.slice(0, days),
			p25: data.p25.slice(0, days),
			p75: data.p75.slice(0, days),
			unit: data.unit
		};
	}

	return {
		...result,
		variables,
		timestamps: result.timestamps.slice(0, days),
		dailyDates: result.dailyDates.slice(0, days),
		dateKeys: result.dateKeys.slice(0, days)
	};
}

/**
 * Centered rolling mean. Seasonal ensembles are far too noisy to read day by
 * day; smoothing shows the trend the model actually claims to resolve. Windows
 * shrink at the edges instead of dropping data.
 */
export function rollingMean(values: number[], window: number): number[] {
	const half = Math.floor(window / 2);
	return values.map((_, i) => {
		let sum = 0;
		let count = 0;
		for (let k = i - half; k <= i + half; k++) {
			const v = values[k];
			if (finite(v)) {
				sum += v;
				count++;
			}
		}
		return count > 0 ? sum / count : NaN;
	});
}

/** Rolling total over the same window (used for precipitation). */
export function rollingSum(values: number[], window: number): number[] {
	return rollingMean(values, window).map((v) => (finite(v) ? v * window : NaN));
}
