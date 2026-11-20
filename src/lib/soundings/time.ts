import { fromZonedTime } from 'date-fns-tz';

import { addDays } from './profile';

export function soundingDayBounds(day: string, timezone: string) {
	const start = fromZonedTime(`${day}T00:00:00`, timezone).getTime();
	const end = fromZonedTime(`${addDays(day, 1)}T00:00:00`, timezone).getTime();
	return { start, end };
}

/** Real instants in one local day: retain both repeated hours when DST ends. */
export function soundingHours(day: string, timezone: string): number[] {
	const { start, end } = soundingDayBounds(day, timezone);
	return Array.from({ length: Math.ceil((end - start) / 3600000) }, (_, i) => start + i * 3600000);
}
