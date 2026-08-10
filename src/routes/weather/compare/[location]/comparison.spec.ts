import { describe, expect, it } from 'vitest';

import {
	cardinalDirection,
	isWindDirection,
	modelColor,
	modelMean,
	sanitizeList,
	validDirectionValues
} from './comparison';

import type { ModelSeriesData } from '$lib/services/weather';

const models: ModelSeriesData[] = [
	{
		modelId: 'model-a',
		resolvedModelId: 'model-a',
		variables: {
			precipitation: [1, Number.NaN, 3],
			precipitation_probability: [80, 90, 100]
		}
	},
	{
		modelId: 'model-b',
		resolvedModelId: 'model-b',
		variables: { precipitation: [3, Number.NaN, 5] }
	}
];

describe('multimodel comparison helpers', () => {
	it('averages only the exact scalar variable and preserves missing values', () => {
		expect(modelMean(models, 'precipitation', 3)).toEqual([2, null, 4]);
	});

	it('validates and deduplicates shared URL selections', () => {
		const allowed = new Set(['a', 'b']);
		expect(sanitizeList(['a', 'unknown', 'a', 'b'], allowed)).toEqual(['a', 'b']);
		expect(sanitizeList(['unknown'], allowed)).toBeNull();
	});

	it('treats every wind direction height as a direction series', () => {
		expect(isWindDirection('wind_direction_10m')).toBe(true);
		expect(isWindDirection('wind_direction_180m')).toBe(true);
		expect(isWindDirection('wind_speed_10m')).toBe(false);
	});

	it('drops direction values outside the fixed 0–360 degree domain', () => {
		expect(validDirectionValues([-1, 0, 90, 360, 361, Number.NaN])).toEqual([
			null,
			0,
			90,
			360,
			null,
			null
		]);
		expect(cardinalDirection(0)).toBe('N');
		expect(cardinalDirection(270)).toBe('W');
	});

	it('assigns deterministic model colors', () => {
		expect(modelColor('ecmwf_ifs')).toBe(modelColor('ecmwf_ifs'));
		expect(modelColor('ecmwf_ifs')).not.toBe(modelColor('gfs_global'));
	});
});
