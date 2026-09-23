import { type Writable, get } from 'svelte/store';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

import { page as routePage } from '$app/stores';

import { defaultLocation, defaultUnits, storedModel, storedUnits } from '$lib/stores/settings';

import * as m from '$lib/paraglide/messages';
import { addDays } from '$lib/soundings/profile';

import Soundings from './+page.svelte';

import type { SoundingForecastParams } from '$lib/services/weather';
import type { SoundingForecastResult } from '$lib/soundings/profile';
import type { PageData } from './$types';

const { fetchSoundingForecast, syncSearchParams } = vi.hoisted(() => ({
	fetchSoundingForecast: vi.fn(),
	syncSearchParams: vi.fn()
}));
vi.mock('$lib/services/weather', () => ({
	fetchSoundingForecast,
	humanizeWeatherError: () => ({ title: 'Network error', hint: 'Try again' })
}));
vi.mock('$lib/utils/url-state', () => ({ syncSearchParams }));
vi.mock('../../hero.svelte', () => ({ useHeroActions: () => {} }));
vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	return { page: writable({ url: new URL('http://localhost/') }) };
});

const today = new Date().toISOString().slice(0, 10);
const tomorrow = addDays(today, 1);
const data = { location: { ...defaultLocation, timezone: 'UTC' } } as PageData;

function navigate(date = today, model = 'icon_global', hour = 12, top = 100) {
	(routePage as unknown as Writable<{ url: URL }>).set({
		...get(routePage),
		url: new URL(
			`http://localhost/en/weather/soundings/berlin/?model=${model}&time=${date}T${String(hour).padStart(2, '0')}:00:00Z&top=${top}`
		)
	});
}

function forecast(date: string): SoundingForecastResult {
	return {
		timezone: 'UTC',
		elevation: 100,
		profiles: Array.from({ length: 24 }, (_, hour) => ({
			time: Date.parse(`${date}T00:00:00Z`) + hour * 3600000,
			surfacePressure: 1000,
			surfaceTemperature: 20,
			surfaceDewpoint: 15,
			levels: [1000, 850, 700, 500, 300, 100].map((pressure, i) => ({
				pressure,
				temperature: 20 - i * 15,
				dewpoint: 10 - i * 15,
				height: 100 + i * 3000,
				windSpeed: 5 + i,
				windDirection: 350,
				cloudCover: 20
			}))
		}))
	};
}

describe('soundings day navigation', () => {
	beforeEach(() => {
		fetchSoundingForecast.mockReset();
		fetchSoundingForecast.mockImplementation(async (params: SoundingForecastParams) =>
			forecast(params.date)
		);
		syncSearchParams.mockReset();
		// SvelteKit shallow writes notify page subscribers with the old route URL.
		syncSearchParams.mockImplementation(() => {
			(routePage as unknown as Writable<{ url: URL }>).update((page) => ({ ...page }));
		});
		storedModel.set('icon_global');
		storedUnits.set(defaultUnits);
		navigate();
	});

	it('fetches a selected day once; hours, range, units and cached days stay local', async () => {
		const screen = await render(Soundings, { data });
		await expect
			.element(screen.getByRole('group', { name: m.sounding_hour(), exact: true }))
			.toBeVisible();
		expect(fetchSoundingForecast).toHaveBeenCalledTimes(1);
		expect(fetchSoundingForecast.mock.calls[0][0].date).toBe(today);
		await screen.getByRole('button', { name: m.sounding_next_hour() }).click();
		await screen.getByRole('combobox', { name: m.sounding_top() }).selectOptions('300');
		storedUnits.set({ ...defaultUnits, temperature_unit: 'fahrenheit', wind_speed_unit: 'kn' });
		await expect.poll(() => syncSearchParams.mock.lastCall?.[0].top).toBe('300');
		expect(fetchSoundingForecast).toHaveBeenCalledTimes(1);
		await screen.getByRole('button', { name: m.sounding_next_day() }).click();
		await expect
			.element(screen.getByRole('group', { name: m.sounding_hour(), exact: true }))
			.toBeVisible();
		expect(fetchSoundingForecast).toHaveBeenCalledTimes(2);
		expect(fetchSoundingForecast.mock.calls[1][0].date).toBe(tomorrow);
		await expect
			.poll(() => syncSearchParams.mock.lastCall?.[0].time)
			.toBe(`${tomorrow}T13:00:00.000Z`);
		await screen.getByRole('button', { name: m.sounding_previous_day() }).click();
		await expect
			.poll(() => syncSearchParams.mock.lastCall?.[0].time)
			.toBe(`${today}T13:00:00.000Z`);
		expect(fetchSoundingForecast).toHaveBeenCalledTimes(2);
	});

	it('selects hours directly and steps across midnight using one new day request', async () => {
		const screen = await render(Soundings, { data });
		await screen.getByRole('button', { name: '23:00 UTC', exact: true }).click();
		expect(fetchSoundingForecast).toHaveBeenCalledTimes(1);
		await screen.getByRole('button', { name: m.sounding_next_hour() }).click();
		await expect
			.poll(() => syncSearchParams.mock.lastCall?.[0].time)
			.toBe(`${tomorrow}T00:00:00.000Z`);
		expect(fetchSoundingForecast).toHaveBeenCalledTimes(2);
		expect(fetchSoundingForecast.mock.lastCall?.[0].date).toBe(tomorrow);
		await screen.getByRole('button', { name: m.sounding_previous_hour() }).click();
		await expect
			.poll(() => syncSearchParams.mock.lastCall?.[0].time)
			.toBe(`${today}T23:00:00.000Z`);
		expect(fetchSoundingForecast).toHaveBeenCalledTimes(2);
	});
	it('keeps missing hours visible and disabled without fetching more data', async () => {
		const partial = forecast(today);
		partial.profiles = partial.profiles.filter((item) => new Date(item.time).getUTCHours() !== 13);
		fetchSoundingForecast.mockResolvedValueOnce(partial);
		const screen = await render(Soundings, { data });
		await expect
			.element(screen.getByRole('button', { name: '13:00 UTC', exact: true }))
			.toBeDisabled();
		await screen.getByRole('button', { name: m.sounding_next_hour() }).click();
		await expect
			.poll(() => syncSearchParams.mock.lastCall?.[0].time)
			.toBe(`${today}T14:00:00.000Z`);
		expect(fetchSoundingForecast).toHaveBeenCalledTimes(1);
	});

	it('uses arrow keys across midnight into history and back without refetching cached days', async () => {
		navigate(today, 'icon_global', 0);
		const screen = await render(Soundings, { data });
		await expect
			.element(screen.getByRole('group', { name: m.sounding_hour(), exact: true }))
			.toBeVisible();
		expect(document.querySelector('input[type="date"]')).toBeNull();
		const chart = document.querySelector('canvas')!.parentElement!;
		chart.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })
		);
		const yesterday = addDays(today, -1);
		await expect
			.poll(() => syncSearchParams.mock.lastCall?.[0].time)
			.toBe(`${yesterday}T23:00:00.000Z`);
		expect(fetchSoundingForecast.mock.lastCall?.[0].date).toBe(yesterday);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
		await expect
			.poll(() => syncSearchParams.mock.lastCall?.[0].time)
			.toBe(`${today}T00:00:00.000Z`);
		expect(fetchSoundingForecast).toHaveBeenCalledTimes(2);
		const top = document.querySelector('select')!;
		top.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
		);
		expect(syncSearchParams.mock.lastCall?.[0].time).toBe(`${today}T00:00:00.000Z`);
		expect(fetchSoundingForecast).toHaveBeenCalledTimes(2);
	});
	it('restores historical links and preserves the day when changing model', async () => {
		navigate('2024-06-15', 'icon_global', 10);
		await render(Soundings, { data });
		await expect
			.poll(() => syncSearchParams.mock.lastCall?.[0].time)
			.toBe('2024-06-15T10:00:00.000Z');
		expect(fetchSoundingForecast.mock.lastCall?.[0].date).toBe('2024-06-15');
		navigate('2024-06-15', 'gfs_global', 10);
		await expect.poll(() => fetchSoundingForecast.mock.lastCall?.[0].model).toBe('gfs_global');
		await expect
			.poll(() => syncSearchParams.mock.lastCall?.[0].time)
			.toBe('2024-06-15T10:00:00.000Z');
	});

	it('restores URL model/day/hour/top and clears the cache for a new model', async () => {
		const screen = await render(Soundings, { data });
		await expect
			.element(screen.getByRole('group', { name: m.sounding_hour(), exact: true }))
			.toBeVisible();
		navigate(tomorrow, 'icon_d2', 16, 500);
		await expect
			.poll(() => syncSearchParams.mock.lastCall?.[0])
			.toEqual({ model: 'icon_d2', time: `${tomorrow}T16:00:00.000Z`, top: '500' });
		expect(fetchSoundingForecast.mock.lastCall?.[0]).toMatchObject({
			model: 'icon_d2',
			date: tomorrow
		});
		navigate(today, 'icon_global');
		await expect.poll(() => fetchSoundingForecast.mock.calls.length).toBe(3);
	});

	it('ignores a slow response after selecting another day', async () => {
		let finish: (result: SoundingForecastResult) => void = () => {};
		fetchSoundingForecast.mockImplementationOnce(
			() =>
				new Promise<SoundingForecastResult>((resolve) => {
					finish = resolve;
				})
		);
		const screen = await render(Soundings, { data });
		await expect.poll(() => fetchSoundingForecast.mock.calls.length).toBe(1);
		await screen.getByRole('button', { name: m.sounding_next_day() }).click();
		await expect
			.element(screen.getByRole('group', { name: m.sounding_hour(), exact: true }))
			.toBeVisible();
		finish(forecast(today));
		await expect
			.poll(() => syncSearchParams.mock.lastCall?.[0].time)
			.toBe(`${tomorrow}T12:00:00.000Z`);
		expect(fetchSoundingForecast).toHaveBeenCalledTimes(2);
	});

	it('shows missing data without probing other days and retries the same date', async () => {
		fetchSoundingForecast.mockResolvedValueOnce({ timezone: 'UTC', elevation: 100, profiles: [] });
		const screen = await render(Soundings, { data });
		await expect.element(screen.getByRole('heading', { name: m.sounding_empty() })).toBeVisible();
		expect(fetchSoundingForecast).toHaveBeenCalledTimes(1);
		await screen.getByRole('button', { name: m.sounding_retry() }).click();
		await expect
			.element(screen.getByRole('group', { name: m.sounding_hour(), exact: true }))
			.toBeVisible();
		expect(fetchSoundingForecast).toHaveBeenCalledTimes(2);
		expect(fetchSoundingForecast.mock.lastCall?.[0].date).toBe(today);
	});

	it('survives an API error and retries', async () => {
		fetchSoundingForecast.mockRejectedValueOnce(new TypeError('Network'));
		const screen = await render(Soundings, { data });
		await expect.element(screen.getByRole('heading', { name: 'Network error' })).toBeVisible();
		await screen.getByRole('button', { name: m.sounding_retry() }).click();
		await expect
			.element(screen.getByRole('group', { name: m.sounding_hour(), exact: true }))
			.toBeVisible();
		expect(fetchSoundingForecast).toHaveBeenCalledTimes(2);
	});
});
