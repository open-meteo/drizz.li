import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

import { localizeHref } from '$lib/paraglide/runtime';

import Page from './+page.svelte';

// The page's only job is the client-side redirect, and a real goto() needs a
// router this render does not have - so assert on the call instead.
const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

describe('/+page.svelte', () => {
	it('redirects to the localized week page', async () => {
		render(Page);

		expect(goto).toHaveBeenCalledWith(localizeHref('/weather/week/'), { replaceState: true });
	});
});
