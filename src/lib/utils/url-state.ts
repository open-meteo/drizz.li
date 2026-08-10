/**
 * Mirrors UI state into the query string so a view can be linked and reloaded
 * exactly as it was: which day is open, which model is plotted, which variables
 * are compared.
 *
 * Writes use `replaceState` rather than `goto`, so mirroring state never adds a
 * history entry or re-runs a load - the back button still means "the page
 * before", not "the previous day I clicked".
 *
 * The base is `location`, deliberately not `page.url`. Shallow routing does not
 * republish the URL: `replaceState` writes the history entry (and files the
 * *previous* `page.url` in it, so a popstate can restore it) but leaves
 * `page.url` on the last navigated URL. Diffing against that stale value is
 * wrong in exactly one direction - clearing a parameter. Opening a day writes
 * `?day=`, `page.url` still has none, so asking to remove it produces a URL
 * identical to the stale one, the write is skipped as a no-op, and the
 * parameter stays in the address bar for good.
 *
 * Reading `location` rather than a passed-in URL also removes the old trap that
 * callers had to pass it untracked: an effect that both read `$page.url` and
 * wrote to it looped until `effect_update_depth_exceeded` hung the page.
 */
import { browser } from '$app/environment';
import { replaceState } from '$app/navigation';

export function syncSearchParams(updates: Record<string, string | null>): void {
	if (!browser) return;
	const current = new URL(window.location.href);
	const next = new URL(current);
	for (const [key, value] of Object.entries(updates)) {
		if (value == null || value === '') next.searchParams.delete(key);
		else next.searchParams.set(key, value);
	}
	if (next.href === current.href) return;
	try {
		replaceState(next, {});
	} catch {
		// A page whose state settles during mount can get here before the router
		// has taken over. The URL is cosmetic, so retry on the next frame rather
		// than letting it break the page.
		requestAnimationFrame(() => {
			try {
				replaceState(next, {});
			} catch {
				/* give up: the view still works, it just isn't linkable yet */
			}
		});
	}
}

/**
 * The value to mirror, or null when it is the view's default. Defaults belong
 * in the code, not the query string: a shared link should carry only what the
 * visitor actually changed, and going back to the default has to clear the
 * parameter again rather than pin the default in place.
 */
export function unlessDefault(value: string | null | undefined, fallback: string): string | null {
	return value && value !== fallback ? value : null;
}

/**
 * Same, for the comma-separated list parameters. Order counts - the models are
 * plotted, coloured and legended in the order they are listed, so a reordered
 * line-up is a different view even when it holds the same entries.
 */
export function listUnlessDefault(
	values: string[] | null | undefined,
	fallback: string[]
): string | null {
	if (!values?.length) return null;
	const joined = values.join(',');
	return joined === fallback.join(',') ? null : joined;
}

/** Reads a comma-separated list, dropping empties. */
export function readList(url: URL, key: string): string[] | null {
	const raw = url.searchParams.get(key);
	if (!raw) return null;
	const list = raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return list.length > 0 ? list : null;
}
