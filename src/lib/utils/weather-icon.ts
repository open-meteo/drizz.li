/**
 * Knowing when a weather pictogram is actually on screen.
 *
 * The pictograms are one SVG file each, pulled in by `<use xlink:href>`. The
 * browser fetches a file the first time an icon needs it, which is the right
 * behaviour - a day of conditions nobody has looked at yet should not hold the
 * page up - but a `<use>` whose file has not arrived paints nothing at all, so
 * the icon blinks into existence a moment later with no warning.
 *
 * This tracks which files the browser has, so a caller can hold a placeholder
 * in the icon's box until then and fade the real thing in. The warm-up fetch is
 * what fills the HTTP cache; the `<use>` that follows reads it back out.
 */
import { SvelteSet } from 'svelte/reactivity';

const ICON_DIR = '/images/weather-icons';

/** The `<use>` target for a pictogram name (see getWeatherIconName). */
export const weatherIconHref = (name: string) => `${ICON_DIR}/${name}.svg#Layer_1`;

// Shared across every component that asks: an icon fetched for the day strip is
// on screen instantly when the nearby list wants the same condition.
const ready = new SvelteSet<string>();
const inFlight = new Set<string>();

/** Whether `<use>` would paint this icon right now. Reactive. */
export function weatherIconReady(name: string): boolean {
	return ready.has(name);
}

/**
 * Pulls the file into the cache, once per name. Call it from an effect rather
 * than from markup - it writes to the set that `weatherIconReady` reads.
 */
export function warmWeatherIcon(name: string): void {
	if (!name || ready.has(name) || inFlight.has(name)) return;
	inFlight.add(name);

	void fetch(weatherIconHref(name).split('#')[0])
		.catch(() => {
			// A file that cannot be fetched is not worth waiting for either: mark it
			// ready so the placeholder gives way to the same empty box the icon
			// would have left, instead of pulsing forever.
		})
		.finally(() => {
			inFlight.delete(name);
			ready.add(name);
		});
}
