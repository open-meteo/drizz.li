import { writable } from 'svelte/store';

/**
 * Whether the current page has enough data on screen to be worth revealing.
 *
 * The weather pages fetch their forecast *after* the route swap, so a plain
 * navigation transition would cross-fade one skeleton into another and then cut
 * hard to the real content. The layout holds its transition open on this flag
 * instead, so the fade lines up with the page actually being loaded.
 */
export const pageContentReady = writable(true);

/**
 * Raised by the layout just before it captures a navigation away from the maps
 * page. The map is a cross-origin iframe, which browsers do not paint into a
 * view transition snapshot - captured bare, the outgoing page would carry a
 * hole where the map was. The maps page answers by laying an opaque
 * same-origin cover over the iframe (the same one that hides the map while it
 * boots), so the snapshot shows a clean panel and the cross-fade has something
 * real to fade from. The layout lowers it again once the navigation is
 * through.
 */
export const mapTransitionCover = writable(false);

/**
 * Called by the layout before it swaps to a route that fetches its own data.
 *
 * The layout owns the "not ready yet" side deliberately: the incoming page's
 * effects have not necessarily run at that point (rendering is paused inside a
 * view transition), so a page that cleared the flag itself would sometimes be
 * announced as ready before it had fetched anything.
 */
export function markPageLoading(): void {
	pageContentReady.set(false);
}

/**
 * The counterpart, for a route that has nothing to wait for (the maps page, the
 * legal pages). Without it a navigation away from a page that never resolved
 * would leave the flag stuck on "loading", and the layout's overlay would sit on
 * top of a page that is perfectly finished.
 */
export function markPageReady(): void {
	pageContentReady.set(true);
}

/**
 * Declare a page's readiness. Pass a getter for "my data has arrived". Only
 * ever sets the flag - clearing it is the layout's job (see above).
 */
export function reportPageReady(isReady: () => boolean): void {
	$effect(() => {
		if (isReady()) pageContentReady.set(true);
	});
}
