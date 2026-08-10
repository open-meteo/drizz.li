import { findModel, models as modelOptions } from '../../options';

import type { ModelSeriesData } from '$lib/services/weather';

const MODEL_COLORS = [
	'#0072b2',
	'#d55e00',
	'#009e73',
	'#cc79a7',
	'#e69f00',
	'#56b4e9',
	'#6f4ead',
	'#8c564b',
	'#e11d48',
	'#65a30d',
	'#0891b2',
	'#c026d3',
	'#2563eb',
	'#ea580c',
	'#059669',
	'#9333ea'
] as const;

/**
 * High-contrast categorical colour. Within a comparison, selection order owns
 * the palette slot so adjacent series never receive accidentally similar hues.
 */
export function modelColor(modelId: string, modelOrder?: readonly string[]): string {
	const selectedIndex = modelOrder?.indexOf(modelId) ?? -1;
	if (selectedIndex >= 0) return MODEL_COLORS[selectedIndex % MODEL_COLORS.length]!;

	const canonicalIndex = modelOptions.findIndex((model) => model.value === modelId);
	if (canonicalIndex >= 0) return MODEL_COLORS[canonicalIndex % MODEL_COLORS.length]!;

	let hash = 2166136261;
	for (let i = 0; i < modelId.length; i++) {
		hash ^= modelId.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return MODEL_COLORS[Math.abs(hash) % MODEL_COLORS.length]!;
}

export function modelLabel(modelId: string): string {
	return findModel(modelId)?.label ?? modelId.replace(/_/g, ' ');
}

export function sanitizeList(
	values: string[] | null,
	allowed: ReadonlySet<string>
): string[] | null {
	if (!values) return null;
	const clean = [...new Set(values.filter((value) => allowed.has(value)))];
	return clean.length > 0 ? clean : null;
}

export function isWindDirection(variable: string): boolean {
	return variable.startsWith('wind_direction_');
}

export function validDirectionValues(values: number[] | undefined): (number | null)[] {
	return (values ?? []).map((value) =>
		Number.isFinite(value) && value >= 0 && value <= 360 ? value : null
	);
}

export interface PrecipitationAgreementPoint {
	wetCount: number;
	availableCount: number;
	median: number;
	min: number;
	max: number;
}

/** Per-timestamp precipitation occurrence agreement and amount spread. */
export function precipitationAgreement(
	models: ModelSeriesData[],
	variable: string,
	timeLength: number,
	wetThreshold: number
): (PrecipitationAgreementPoint | null)[] {
	const points: (PrecipitationAgreementPoint | null)[] = new Array(timeLength).fill(null);
	for (let index = 0; index < timeLength; index++) {
		const values: number[] = [];
		for (const model of models) {
			const value = model.variables[variable]?.[index];
			if (value === undefined || !Number.isFinite(value) || value < 0) continue;
			values.push(value);
		}
		if (values.length === 0) continue;
		values.sort((left, right) => left - right);
		const middle = Math.floor(values.length / 2);
		const median =
			values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
		points[index] = {
			wetCount: values.filter((value) => value > wetThreshold).length,
			availableCount: values.length,
			median,
			min: values[0],
			max: values[values.length - 1]
		};
	}
	return points;
}

export function cardinalDirection(value: number): string {
	const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
	return directions[Math.round((((value % 360) + 360) % 360) / 45) % 8];
}

/** Arithmetic model mean for scalar variables; missing consensus stays missing. */
export function modelMean(
	models: ModelSeriesData[],
	variable: string,
	timeLength: number
): (number | null)[] {
	const totals = new Array<number>(timeLength).fill(0);
	const counts = new Array<number>(timeLength).fill(0);
	for (const model of models) {
		const values = model.variables[variable] ?? [];
		for (let i = 0; i < Math.min(values.length, timeLength); i++) {
			const value = values[i];
			if (!Number.isFinite(value)) continue;
			totals[i] += value;
			counts[i]++;
		}
	}
	return totals.map((total, i) =>
		counts[i] > 0 ? Math.round((total / counts[i]) * 10) / 10 : null
	);
}
