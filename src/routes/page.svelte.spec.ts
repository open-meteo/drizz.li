import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';

import Page from './+page.svelte';

describe('/+page.svelte', () => {
	it('should render the redirect page with correct title', async () => {
		render(Page);

		const title = document.querySelector('title');
		expect(title?.textContent).toBe('Drizz.li');
	});
});
