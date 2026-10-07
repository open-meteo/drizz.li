import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';

import * as m from '$lib/paraglide/messages';

import AppStatus from './app-status.svelte';

const state = vi.hoisted(() => ({ setUpdated: (_value: boolean) => {} }));
vi.mock('$app/state', async () => {
	const { SvelteMap } = await import('svelte/reactivity');
	const values = new SvelteMap([['updated', false]]);
	state.setUpdated = (value) => values.set('updated', value);
	return {
		updated: {
			get current() {
				return values.get('updated');
			}
		}
	};
});

describe('app status', () => {
	let connected = true;
	let previousVisits: string | null;

	beforeEach(() => {
		previousVisits = localStorage.getItem('app_visits');
		localStorage.setItem('app_visits', '1');
		connected = true;
		vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => connected);
		state.setUpdated(false);
	});

	afterEach(async () => {
		await cleanup();
		vi.restoreAllMocks();
		if (previousVisits === null) localStorage.removeItem('app_visits');
		else localStorage.setItem('app_visits', previousVisits);
	});

	it('prioritizes offline, update, and install while preserving pending prompts', async () => {
		const view = await render(AppStatus);
		const prompt = vi.fn().mockResolvedValue(undefined);
		const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
			prompt,
			userChoice: Promise.resolve({ outcome: 'accepted' })
		});
		window.dispatchEvent(event);
		await expect.element(view.getByRole('button', { name: m.app_install() })).toBeVisible();

		state.setUpdated(true);
		await expect.element(view.getByText(m.update_title())).toBeVisible();
		await expect
			.element(view.getByRole('button', { name: m.app_install() }))
			.not.toBeInTheDocument();

		connected = false;
		window.dispatchEvent(new Event('offline'));
		await expect.element(view.getByRole('status')).toHaveTextContent(m.app_offline());
		await expect
			.element(view.getByRole('button', { name: m.update_reload() }))
			.not.toBeInTheDocument();

		connected = true;
		window.dispatchEvent(new Event('online'));
		await expect.element(view.getByText(m.update_title())).toBeVisible();
		await view.getByRole('button', { name: m.update_dismiss() }).click();
		await expect.element(view.getByRole('button', { name: m.app_install() })).toBeVisible();
	});
});
