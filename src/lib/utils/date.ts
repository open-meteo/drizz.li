import { isSameDay as isSameDayDateFns } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { de, enGB, es, fr, it } from 'date-fns/locale';

import * as m from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';

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
 * Pins the API's daily timestamps to local noon of the days they stand for.
 *
 * Open-Meteo applies one utc offset to a whole response, the one in effect when
 * the request is made, so its days start at that offset's midnight even past a
 * DST change. On the other side of one (later in a forecast, or an archive range
 * from the other half of the year) they start an hour off the local midnight,
 * and a start at 23:00 is the day before in the IANA zone. The calendar date is
 * read back with the API's own offset instead and re-anchored in the zone. Noon
 * rather than midnight: zones like America/Santiago change their clocks at
 * 00:00, and a midnight that does not exist resolves to the evening before again.
 */
export function localDayDates(
	timestampsMs: number[],
	utcOffsetSeconds: number,
	timeZone: string
): Date[] {
	return timestampsMs.map((t) => {
		const local = new Date(t + utcOffsetSeconds * 1000);
		const noon = Number.isFinite(local.getTime())
			? fromZonedTime(`${local.toISOString().slice(0, 10)}T12:00:00`, timeZone)
			: local;
		// a zone the runtime does not know leaves the API's own instant, which is
		// still the right day as long as no DST change lies in between
		return Number.isFinite(noon.getTime()) ? noon : new Date(t);
	});
}

/**
 * Index range `[start, end)` of the hours that fall on `days` consecutive local
 * days, beginning with the day `from` falls on, or null when no hour does. Read
 * off the hours themselves: a day the clocks change on runs 23 or 25 hours, so
 * days cannot be counted in 24-hour steps. `end` stops at the end of the data
 * when the hours run out first.
 */
export function localDayHours(
	hours: Date[],
	from: Date,
	days: number,
	timeZone: string
): { start: number; end: number } | null {
	const dayOf = (date: Date) => formatZoned(date, timeZone, 'yyyy-MM-dd');
	let day = dayOf(from);
	const start = day ? hours.findIndex((hour) => dayOf(hour) === day) : -1;
	if (start === -1) return null;

	let counted = 1;
	for (let i = start + 1; i < hours.length; i++) {
		const next = dayOf(hours[i]);
		if (next === day) continue;
		if (++counted > days) return { start, end: i };
		day = next;
	}
	return { start, end: hours.length };
}

/**
 * `localDayHours` as epoch ms: from the first hour of the first day to the
 * first hour after the last one, or an hour past the last hour when the data
 * ends first.
 */
export function localDaySpan(
	hours: Date[],
	from: Date,
	days: number,
	timeZone: string
): { start: number; end: number } | null {
	const range = localDayHours(hours, from, days, timeZone);
	if (!range) return null;
	const end = hours[range.end] ?? new Date(hours[range.end - 1].getTime() + 3_600_000);
	return { start: hours[range.start].getTime(), end: end.getTime() };
}

/**
 * The zone's UTC offset at an instant, in seconds, or NaN when it cannot be
 * read. Follows the zone across DST changes, unlike the API's single
 * `utc_offset_seconds` per response.
 */
export function getZonedOffsetSeconds(date: Date, timeZone: string): number {
	// read through the formatter, which takes the offset at the instant itself;
	// date-fns-tz's getTimezoneOffset instead takes the date's system-local
	// fields as a wall-clock time in the zone, which is an hour off around a DST
	// change and depends on the visitor's own zone
	const match = /^([+-])(\d{2}):(\d{2})$/.exec(formatZoned(date, timeZone, 'xxx'));
	if (!match) return NaN;
	const seconds = Number(match[2]) * 3600 + Number(match[3]) * 60;
	return match[1] === '-' ? -seconds : seconds;
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
