import { SvelteURL } from 'svelte/reactivity';

// Use the same rune-based property tracking as SvelteKit's page state.
// Replacing the URL must invalidate effects that read page.url.
export const mockPage = $state<{ url: URL }>({ url: new SvelteURL('http://localhost/') });
