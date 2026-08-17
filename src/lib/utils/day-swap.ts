import { tick } from 'svelte';

import {
	canStartViewTransition,
	prefersReducedMotion,
	skipActiveViewTransition,
	startViewTransition,
	supportsViewTransitions
} from './view-transition';

/**
 * Runs a day change inside a view transition, so the outgoing day is still on
 * screen while the incoming one fades in - a real cross-fade rather than the
 * old content vanishing and the new one fading up from nothing.
 *
 * Only the regions that actually change carry a `view-transition-name` (see
 * `.day-region-*` in routes/layout.css); everything else - the strip, the
 * header, the page chrome - is pinned by the `day-switch` class so it stays
 * completely still.
 *
 * A day switch that lands while a navigation transition is still on screen just
 * applies: starting a rival transition would skip the running one and flash the
 * page (see view-transition.ts).
 */
/** Guards the shared cleanup below against a switch superseding a switch. */
let dayTransitionToken = 0;

/** The regions that cross-fade; layout.css clips their snapshot groups. */
const DAY_REGIONS = ['table', 'summary', 'charts'] as const;

export async function runDayTransition(update: () => void): Promise<void> {
	if (!canStartViewTransition()) {
		update();
		return;
	}

	const token = ++dayTransitionToken;
	const root = document.documentElement;

	// The region snapshots include the part of the table normally scrolled up
	// behind the sticky strip; each snapshot group is clipped at the bar's
	// bottom edge so they cannot paint over the (live, clickable) strip.
	// The clip is measured per switch (the bar's height follows the scroll
	// collapse) and per REGION, as a distance from the region's own top edge:
	// a group-local clip-path stays correct even when the snapshot layer's
	// containing block is offset from the layout viewport, which it is on
	// mobile while the browser UI is (partially) shown - a viewport-anchored
	// clip on the whole overlay let the table paint over the strip there.
	const bar = document.querySelector('.daystrip .strip-row');
	if (bar) {
		const barBottom = bar.getBoundingClientRect().bottom;
		for (const region of DAY_REGIONS) {
			const el = document.querySelector(`.day-region-${region}`);
			if (!el) continue;
			const clip = Math.max(0, barBottom - el.getBoundingClientRect().top);
			root.style.setProperty(`--day-switch-clip-${region}`, `${clip}px`);
		}
	}

	// The page stays scrollable during the fade, but the snapshots and the clip
	// line above are anchored to where things were at capture - so the first
	// sign of scrolling finishes the fade on the spot instead of animating
	// against a moving page.
	const skip = () => skipActiveViewTransition();
	window.addEventListener('wheel', skip, { passive: true });
	window.addEventListener('touchmove', skip, { passive: true });

	try {
		// Svelte applies the change on the next tick; the transition has to wait
		// for that before it snapshots the new state. `day-switch` scopes which
		// regions take part (see routes/layout.css) and is cleared when it ends.
		await startViewTransition(
			async () => {
				update();
				await tick();
			},
			{ rootClass: 'day-switch' }
		);
	} finally {
		window.removeEventListener('wheel', skip);
		window.removeEventListener('touchmove', skip);
		// a newer switch owns the clip vars now; only the last one may clear them
		if (token === dayTransitionToken)
			for (const region of DAY_REGIONS) root.style.removeProperty(`--day-switch-clip-${region}`);
	}
}

/**
 * Fallback for browsers without view transitions: fade the block back in when
 * the value passed to it changes. Animates the existing node rather than
 * remounting it, so the canvas charts keep their zoom state.
 */
export function daySwap(node: HTMLElement, key: unknown) {
	let current = key;

	const play = () => {
		// view transitions handle it properly where they exist
		if (supportsViewTransitions() || prefersReducedMotion()) return;
		node.animate([{ opacity: 0.1 }, { opacity: 1 }], {
			duration: 460,
			easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)'
		});
	};

	return {
		update(next: unknown) {
			if (next === current) return;
			current = next;
			play();
		}
	};
}
