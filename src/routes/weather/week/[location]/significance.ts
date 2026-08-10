// ─── "Is this metric worth highlighting?" thresholds ────────────────────────
// Shared by the desktop day cards and the mobile day strip. Below these, the
// sun / precip / wind readouts are greyed out so a card at a glance only
// emphasises what's actually notable that day.

export function sunIsSignificant(sunshineSeconds: number | null, daylightSeconds: number): boolean {
	if (daylightSeconds <= 0) return false;
	return (sunshineSeconds ?? 0) / daylightSeconds >= 0.1;
}

export function precipIsSignificant(sum: number | null, unit: string): boolean {
	const min = unit === 'mm' ? 0.1 : 0.005; // anything above a trace
	return (sum ?? 0) >= min;
}

/** Sunshine as a share of daylight, for the sun progress bar (0-100). */
export function getSunshinePercent(
	sunshineSeconds: number | null,
	daylightSeconds: number
): number {
	if (!sunshineSeconds || daylightSeconds <= 0) return 0;
	return Math.min(100, (sunshineSeconds / daylightSeconds) * 100);
}

/** Sun icon / bar colour by sunshine ratio: grey → pale gold → amber. */
export function getSunshineColor(sunshineSeconds: number | null, daylightSeconds: number): string {
	if (daylightSeconds <= 0) return '#d1d5db';
	const ratio = (sunshineSeconds ?? 0) / daylightSeconds;
	if (ratio >= 0.7) return '#f59e0b';
	if (ratio >= 0.45) return '#fbbf24';
	if (ratio >= 0.1) return '#fcd34d';
	return '#d1d5db';
}

export function windIsSignificant(
	speed: number | null,
	gust: number | null,
	unit: string
): boolean {
	// separate bars: sustained wind ~ a light breeze (~12 km/h), gusts a bit
	// higher (~22 km/h). If EITHER is met, the whole wind readout is coloured.
	const windMin = unit === 'ms' ? 3 : unit === 'mph' ? 7 : unit === 'kn' ? 6 : 12;
	const gustMin = unit === 'ms' ? 6 : unit === 'mph' ? 14 : unit === 'kn' ? 12 : 22;
	const s = speed != null && !isNaN(speed) ? speed : -Infinity;
	const g = gust != null && !isNaN(gust) ? gust : -Infinity;
	return s >= windMin || g >= gustMin;
}
