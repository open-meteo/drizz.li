import { describe, expect, it } from 'vitest';

import {
	formatZoned,
	getZonedOffsetSeconds,
	localDayDates,
	localDayHours,
	localDaySpan
} from './date';

const at = (iso: string) => Date.parse(iso);

/** `count` hourly instants starting at `first`. */
const hoursFrom = (first: string, count: number) =>
	Array.from({ length: count }, (_, i) => new Date(at(first) + i * 3_600_000));

describe('localDayDates', () => {
	it('keeps one day per date when a DST change falls inside the forecast', () => {
		// What the forecast API sent for Berlin on 2026-10-22: every day at the
		// CEST midnight, although the clocks go back on Sunday the 25th.
		const daily = [
			'2026-10-21T22:00:00Z',
			'2026-10-22T22:00:00Z',
			'2026-10-23T22:00:00Z',
			'2026-10-24T22:00:00Z',
			'2026-10-25T22:00:00Z',
			'2026-10-26T22:00:00Z',
			'2026-10-27T22:00:00Z'
		].map(at);

		const days = localDayDates(daily, 7200, 'Europe/Berlin');

		expect(days.map((d) => formatZoned(d, 'Europe/Berlin', 'yyyy-MM-dd HH:mm'))).toEqual([
			'2026-10-22 12:00',
			'2026-10-23 12:00',
			'2026-10-24 12:00',
			'2026-10-25 12:00',
			'2026-10-26 12:00',
			'2026-10-27 12:00',
			'2026-10-28 12:00'
		]);
	});

	it('reads an archive range from the other half of the year on its own dates', () => {
		// January requested in summer: the archive API still answers with +2h
		const days = localDayDates(
			[at('2025-01-09T22:00:00Z'), at('2025-01-10T22:00:00Z')],
			7200,
			'Europe/Berlin'
		);

		expect(days.map((d) => formatZoned(d, 'Europe/Berlin', 'yyyy-MM-dd'))).toEqual([
			'2025-01-10',
			'2025-01-11'
		]);
	});

	it('stays on the day whose midnight a DST change skips', () => {
		// Santiago jumps from 00:00 to 01:00 on 2026-09-06; asked for with the
		// summer offset (-3h), the API starts that day at 23:00 the evening before
		const [day] = localDayDates([at('2026-09-06T03:00:00Z')], -10800, 'America/Santiago');

		expect(formatZoned(day, 'America/Santiago', 'yyyy-MM-dd HH:mm')).toBe('2026-09-06 12:00');
	});

	it('keeps the API instant for a zone the runtime does not know', () => {
		const t = at('2026-10-24T22:00:00Z');

		expect(localDayDates([t], 7200, 'Nowhere/Nothing')[0].getTime()).toBe(t);
	});
});

describe('localDayHours', () => {
	// Sunday 2026-10-25 00:00 CEST onwards, through Tuesday 00:00 CET
	const autumn = hoursFrom('2026-10-24T22:00:00Z', 50);

	it('gives the day the clocks go back 25 hours', () => {
		expect(localDayHours(autumn, autumn[0], 1, 'Europe/Berlin')).toEqual({ start: 0, end: 25 });
		expect(localDayHours(autumn, autumn[0], 2, 'Europe/Berlin')).toEqual({ start: 0, end: 49 });
	});

	it('gives the day the clocks go forward 23 hours', () => {
		const spring = hoursFrom('2027-03-27T23:00:00Z', 30);

		expect(localDayHours(spring, spring[0], 1, 'Europe/Berlin')).toEqual({ start: 0, end: 23 });
	});

	it('starts on the day `from` falls on, wherever it sits in that day', () => {
		const mondayNoon = new Date(at('2026-10-26T11:00:00Z'));

		expect(localDayHours(autumn, mondayNoon, 1, 'Europe/Berlin')).toEqual({ start: 25, end: 49 });
	});

	it('stops at the end of the data', () => {
		expect(localDayHours(autumn, autumn[30], 3, 'Europe/Berlin')).toEqual({ start: 25, end: 50 });
	});

	it('is null for a day no hour falls on', () => {
		const later = new Date(at('2026-10-28T12:00:00Z'));

		expect(localDayHours(autumn, later, 1, 'Europe/Berlin')).toBeNull();
	});
});

describe('localDaySpan', () => {
	const autumn = hoursFrom('2026-10-24T22:00:00Z', 50);

	it('runs from the first hour of the day to the first hour of the next', () => {
		expect(localDaySpan(autumn, autumn[0], 1, 'Europe/Berlin')).toEqual({
			start: at('2026-10-24T22:00:00Z'),
			end: at('2026-10-25T23:00:00Z')
		});
	});

	it('ends an hour after the last hour when the data runs out first', () => {
		expect(localDaySpan(autumn, autumn[30], 3, 'Europe/Berlin')).toEqual({
			start: at('2026-10-25T23:00:00Z'),
			end: at('2026-10-27T00:00:00Z')
		});
	});
});

describe('getZonedOffsetSeconds', () => {
	it('follows the zone across a DST change', () => {
		// Berlin goes from +2h to +1h at 01:00Z, halfway through the 02:00 hour
		// that happens twice
		expect(getZonedOffsetSeconds(new Date('2026-10-25T00:30:00Z'), 'Europe/Berlin')).toBe(7200);
		expect(getZonedOffsetSeconds(new Date('2026-10-25T01:30:00Z'), 'Europe/Berlin')).toBe(3600);
	});

	it('reads offsets with minutes and west of UTC', () => {
		expect(getZonedOffsetSeconds(new Date('2026-10-25T12:00:00Z'), 'Asia/Kathmandu')).toBe(20700);
		expect(getZonedOffsetSeconds(new Date('2026-07-01T12:00:00Z'), 'America/St_Johns')).toBe(-9000);
		expect(getZonedOffsetSeconds(new Date('2026-07-01T12:00:00Z'), 'UTC')).toBe(0);
	});

	it('is NaN for a date it cannot read', () => {
		expect(getZonedOffsetSeconds(new Date(NaN), 'Europe/Berlin')).toBeNaN();
	});
});
