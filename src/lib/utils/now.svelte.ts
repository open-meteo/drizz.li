import { browser } from '$app/environment';

/**
 * Shared "now" clock.
 *
 * One timer, aligned to the wall-clock minute, drives every current-time marker
 * in the app (the hourly table's NOW line, the meteogram's time marker) so they
 * stay accurate without a page reload.
 *
 * The timer only runs while at least one component is subscribed, and re-aligns
 * after each tick so it can't drift or fire twice within a minute (e.g. after
 * the tab has been suspended).
 */

let current = $state(new Date());
let subscribers = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

const MINUTE_MS = 60_000;

function scheduleTick() {
	timer = setTimeout(
		() => {
			current = new Date();
			scheduleTick();
		},
		MINUTE_MS - (Date.now() % MINUTE_MS)
	);
}

/**
 * Reactive current time, refreshed on every minute boundary while the calling
 * component is mounted. On the server it just reports render time.
 */
export function useNow(): { readonly current: Date } {
	if (browser) {
		$effect(() => {
			if (subscribers++ === 0) {
				current = new Date();
				scheduleTick();
			}
			return () => {
				if (--subscribers === 0) {
					clearTimeout(timer);
					timer = undefined;
				}
			};
		});
	}

	return {
		get current() {
			return browser ? current : new Date();
		}
	};
}
