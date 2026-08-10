/**
 * Locale-aware routing helpers.
 *
 * SvelteKit's `resolve()` returns the language-neutral path a route lives at;
 * every link has to go through `localizeHref()` on top of that, or clicking it
 * would drop the visitor back into the base locale (the reroute hook in
 * `src/hooks.ts` strips the prefix again on the way in).
 */
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';

import { type Locale, deLocalizeHref, locales, localizeHref } from '$lib/paraglide/runtime';

import type {
	PathnameWithSearchOrHash,
	RouteId,
	RouteIdWithSearchOrHash,
	RouteParams
} from '$app/types';

// Mirrors SvelteKit's own (non-exported) argument type for `resolve`, so a
// route id still demands exactly the params that route declares.
type StripSearchOrHash<T extends string> = T extends `${infer P}?${string}`
	? P
	: T extends `${infer P}#${string}`
		? P
		: T;

type ResolveArgs<T extends RouteIdWithSearchOrHash | PathnameWithSearchOrHash> = T extends RouteId
	? RouteParams<T> extends Record<string, never>
		? [route: T]
		: [route: T, params: RouteParams<T>]
	: StripSearchOrHash<T> extends infer U extends RouteId
		? RouteParams<U> extends Record<string, never>
			? [route: T]
			: [route: T, params: RouteParams<U>]
		: [route: T];

/**
 * `resolve()` for the current locale. Mirrors SvelteKit's own signature, so
 * route ids and their params keep being type-checked.
 */
export function href<T extends RouteIdWithSearchOrHash | PathnameWithSearchOrHash>(
	...args: ResolveArgs<T>
): string {
	return localizeHref(resolve(...args));
}

/** Same as `href`, but forced into a specific locale. */
export function hrefIn<T extends RouteIdWithSearchOrHash | PathnameWithSearchOrHash>(
	locale: Locale,
	...args: ResolveArgs<T>
): string {
	return localizeHref(resolve(...args), { locale });
}

/** `goto()` that keeps the visitor in their language. */
export function gotoLocalized<T extends RouteIdWithSearchOrHash | PathnameWithSearchOrHash>(
	...args: ResolveArgs<T>
) {
	return goto(href(...args));
}

/**
 * The language-neutral path for a URL that still carries its locale prefix -
 * what "which page am I on?" checks have to compare against.
 */
export function routePath(pathname: string): string {
	return deLocalizeHref(pathname);
}

/** Display names for the language switcher, in the language itself. */
export const LOCALE_LABELS: Record<Locale, string> = {
	en: 'English',
	de: 'Deutsch',
	es: 'Español',
	fr: 'Français',
	it: 'Italiano'
};

export const LOCALE_LIST = locales;
