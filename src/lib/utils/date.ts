import { isSameDay as isSameDayDateFns } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { de, enGB, es, fr, it } from 'date-fns/locale';

import * as m from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';

import type { Locale as DateFnsLocale } from 'date-fns';

// Weekday and month names come from date-fns, so they have to follow the same
// locale the messages do.
const DATE_LOCALES: Record<string, DateFnsLocale> = { en: enGB, de, es, fr, it };

/**
 * Normalises anything date-shaped into a plain `Date`, or null when it does not
 * describe a real instant.
 *
 * Two reasons every helper below starts here:
 *
 * 1. date-fns copies its input with `new date.constructor(value)`. Hand it the
 *    reactive `SvelteDate` the pages use for the selected day and it builds
 *    *another* SvelteDate, then reads the copy's fields back through memoised
 *    signals - a signal graph per formatted timestamp, in a path that runs
 *    hundreds of times per render.
 * 2. date-fns throws `RangeError: Invalid time value` on an invalid date. Thrown
 *    from inside a render (or inside a view-transition callback, where it
 *    surfaces as an unhandled rejection) that takes the whole page down for what
 *    is really one unformattable cell.
 */
function plainDate(date: Date | null | undefined): Date | null {
	const time = date?.getTime?.();
	if (time == null || !Number.isFinite(time)) return null;
	// already a plain Date: no copy needed
	return date!.constructor === Date ? (date as Date) : new Date(time);
}

/**
 * Formats a UTC Date into a string for a specific timezone using date-fns patterns.
 * Patterns: 'HH:mm' for 24h time, 'EEE' for short weekday, etc.
 *
 * Returns '' for a date or zone it cannot format - callers compare these strings
 * or print them, and both degrade gracefully on an empty one.
 */
export function formatZoned(date: Date, timeZone: string, pattern: string): string {
	const d = plainDate(date);
	if (!d || !timeZone) return '';
	return formatInTimeZone(d, timeZone, pattern, {
		locale: DATE_LOCALES[getLocale()] ?? enGB
	});
}

/**
 * Checks if two dates are the same day in a specific timezone.
 * Important for comparing weather forecast days against a selected date.
 */
export function isSameDayInZone(date1: Date, date2: Date, timeZone: string): boolean {
	const d1 = plainDate(date1);
	const d2 = plainDate(date2);
	if (!d1 || !d2 || !timeZone) return false;
	return isSameDayDateFns(toZonedTime(d1, timeZone), toZonedTime(d2, timeZone));
}

/**
 * Gets the numeric hour (0-23) for a date in a specific timezone, or NaN when
 * the date cannot be read.
 */
export function getZonedHour(date: Date, timeZone: string): number {
	const d = plainDate(date);
	if (!d || !timeZone) return NaN;
	return parseInt(formatInTimeZone(d, timeZone, 'H'), 10);
}

/**
 * Returns a relative label like "Today", "Tomorrow", "Yesterday",
 * or a formatted date string, all relative to the target timezone.
 */
export function getRelativeDayLabel(date: Date, timeZone: string): string {
	const d = plainDate(date);
	if (!d || !timeZone) return '';

	const zonedDate = toZonedTime(d, timeZone);
	const zonedNow = toZonedTime(new Date(), timeZone);

	if (isSameDayDateFns(zonedDate, zonedNow)) return m.day_today();

	const tomorrow = new Date(zonedNow);
	tomorrow.setDate(tomorrow.getDate() + 1);
	if (isSameDayDateFns(zonedDate, tomorrow)) return m.day_tomorrow();

	const yesterday = new Date(zonedNow);
	yesterday.setDate(yesterday.getDate() - 1);
	if (isSameDayDateFns(zonedDate, yesterday)) return m.day_yesterday();

	return formatZoned(d, timeZone, 'EEE d MMM');
}

/**
 * Formats a UTC offset in seconds to a string like "UTC+1" or "UTC-05:00"
 */
export function formatUtcOffset(offsetSeconds: number): string {
	const sign = offsetSeconds >= 0 ? '+' : '-';
	const abs = Math.abs(offsetSeconds);
	const hours = Math.floor(abs / 3600);
	const minutes = Math.floor((abs % 3600) / 60);
	const pad = (n: number) => n.toString().padStart(2, '0');
	return minutes === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${pad(minutes)}`;
}
