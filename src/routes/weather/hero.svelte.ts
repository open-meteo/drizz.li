import { getContext } from 'svelte';

import type { Snippet } from 'svelte';

interface HeroContext {
	setActions: (snippet: Snippet | null) => void;
}

/**
 * Renders a page's own controls into the shared page-heading row that lives in
 * `weather/+layout.svelte`. The row itself stays mounted across navigation;
 * only the controls swap, and they are cleared when the page unmounts.
 */
export function useHeroActions(actions: Snippet): void {
	const hero = getContext<HeroContext>('weather-hero');
	$effect(() => {
		hero.setActions(actions);
		return () => hero.setActions(null);
	});
}
