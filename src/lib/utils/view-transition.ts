/**
 * Central entry point for every view transition in the app.
 *
 * Two things it exists to get right.
 *
 * **One transition at a time, but only where it matters.** Starting a
 * transition while another is running makes the browser skip the first, and
 * what that looks like depends entirely on which phase the first is in:
 *
 *   - *capturing* - its update callback has not resolved yet, so the screen is
 *     frozen on the outgoing snapshot. Skipping drops that snapshot on the spot
 *     and pops the half-updated live DOM into view: the whole-screen flash.
 *     This phase is common here, because navigation deliberately holds the
 *     callback open while the new page fetches, and `/` plus every bare
 *     `/weather/<view>/` page is a redirect stub that navigates again from
 *     `onMount` - one click, two or three navigations.
 *   - *animating* - the DOM is already in its final state and the pseudo
 *     elements are playing out. Skipping just finishes them early, landing on
 *     exactly the state they were heading for.
 *
 * So a new transition rides along inside the running one only while it is
 * capturing; once it is animating, superseding it is the better answer (waiting
 * would strand the new update under a stale snapshot until the animation ends).
 *
 * **A scoping class.** `rootClass` is set on `<html>` for the life of the
 * transition, so the stylesheet can tell a page swap from a day switch and pin
 * the parts that are identical on both sides (see routes/layout.css).
 */
type UpdateCallback = () => void | Promise<void>;

interface Options {
	/** Class set on `<html>` while the transition runs, for scoping CSS. */
	rootClass?: string;
	/**
	 * Set false to run the update without a transition. For content the browser
	 * does not paint into a snapshot - a cross-origin iframe - where animating
	 * means animating a hole rather than a cross-fade.
	 */
	enabled?: boolean;
}

/** Set while a transition holds the screen frozen on the outgoing snapshot. */
let capturing: Promise<void> | null = null;

/**
 * How many running transitions hold each scoping class. A superseded
 * transition's cleanup fires while its successor is mid-capture (skipping
 * rejects `finished` on a microtask, which runs before the next render);
 * without the count it would strip the class out from under the successor,
 * and a day switch captured without `day-switch` falls back to the full-page
 * fade it exists to prevent.
 */
const rootClassHolds = new Map<string, number>();

/** The most recently started transition, while it is capturing or animating. */
let active: ViewTransition | null = null;

/**
 * Finishes the running transition's animation on the spot (the DOM is already
 * in its final state, so this is always safe). Used to hand the screen back
 * the moment the user starts scrolling under a day switch, rather than
 * animating against a moving target.
 */
export function skipActiveViewTransition(): void {
	active?.skipTransition();
}

export const supportsViewTransitions = (): boolean =>
	typeof document !== 'undefined' && typeof document.startViewTransition === 'function';

export const prefersReducedMotion = (): boolean =>
	typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * True while a transition is frozen on its outgoing snapshot - the phase in
 * which starting a rival transition would flash the page.
 */
export const isViewTransitionCapturing = (): boolean => capturing !== null;

/** Whether `startViewTransition` would actually open one right now. */
export const canStartViewTransition = (): boolean =>
	supportsViewTransitions() && !prefersReducedMotion() && !isViewTransitionCapturing();

/**
 * Runs `update` inside a view transition, or straight away when one cannot (or
 * must not) be started. Resolves once the transition has finished animating -
 * or as soon as the update is done, when it ran on its own.
 */
export function startViewTransition(update: UpdateCallback, options: Options = {}): Promise<void> {
	const { rootClass, enabled = true } = options;

	if (!enabled || !canStartViewTransition()) {
		return Promise.resolve(update()).then(
			() => {},
			(error: unknown) => {
				console.error('view transition update failed', error);
			}
		);
	}

	const root = document.documentElement;
	if (rootClass) {
		rootClassHolds.set(rootClass, (rootClassHolds.get(rootClass) ?? 0) + 1);
		root.classList.add(rootClass);
	}

	const transition = document.startViewTransition(update);
	active = transition;

	// A throw inside the callback rejects `updateCallbackDone` as well as
	// `finished`. Nothing awaits the former, and an unhandled rejection there is
	// what turns one bad render into an "Uncaught" error on the page.
	const captured = transition.updateCallbackDone.then(
		() => {},
		(error: unknown) => {
			console.error('view transition update failed', error);
		}
	);
	capturing = captured;
	void captured.then(() => {
		if (capturing === captured) capturing = null;
	});

	// A superseded transition rejects `finished`; the DOM is already up to date,
	// so that is not an error worth surfacing.
	return transition.finished
		.then(
			() => {},
			() => {}
		)
		.finally(() => {
			if (active === transition) active = null;
			if (!rootClass) return;
			const holds = (rootClassHolds.get(rootClass) ?? 1) - 1;
			if (holds > 0) {
				rootClassHolds.set(rootClass, holds);
			} else {
				rootClassHolds.delete(rootClass);
				root.classList.remove(rootClass);
			}
		});
}
