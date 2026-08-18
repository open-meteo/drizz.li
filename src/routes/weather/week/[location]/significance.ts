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

// ─── Daily warning level (orange / red triangle on the day cards) ───────────
// Meteoalarm-flavoured thresholds, expressed per display unit. A day gets an
// orange triangle at 'warn' and a red one at 'severe' as soon as ANY of
// gusts / precipitation / heat / cold crosses its bar.

export type DayWarnLevel = 'none' | 'warn' | 'severe';
export type DayWarnCause = 'gust' | 'precip' | 'heat' | 'cold';

export interface DayWarning {
	level: DayWarnLevel;
	/** Which variables crossed their bar, in display order. */
	causes: DayWarnCause[];
}

export function getDayWarning(opts: {
	tempMax: number | null;
	tempMin: number | null;
	precipSum: number | null;
	gust: number | null;
	temperatureUnit: string;
	precipitationUnit: string;
	windUnit: string;
}): DayWarning {
	const celsius = opts.temperatureUnit === 'celsius';
	const mm = opts.precipitationUnit === 'mm';
	const w = opts.windUnit;

	// gusts: ~80 km/h shakes branches loose, ~110 km/h fells trees
	const gustWarn = w === 'ms' ? 22 : w === 'mph' ? 50 : w === 'kn' ? 43 : 80;
	const gustSevere = w === 'ms' ? 31 : w === 'mph' ? 68 : w === 'kn' ? 59 : 110;
	// daily precipitation: ~30 mm soaks, ~60 mm floods
	const precipWarn = mm ? 30 : 1.2;
	const precipSevere = mm ? 60 : 2.4;
	// heat / cold extremes on the day's max / min
	const heatWarn = celsius ? 40 : 104;
	const heatSevere = celsius ? 45 : 113;
	const coldWarn = celsius ? -20 : -4;
	const coldSevere = celsius ? -30 : -22;

	const g = opts.gust != null && !isNaN(opts.gust) ? opts.gust : -Infinity;
	const p = opts.precipSum != null && !isNaN(opts.precipSum) ? opts.precipSum : -Infinity;
	const tx = opts.tempMax != null && !isNaN(opts.tempMax) ? opts.tempMax : -Infinity;
	const tn = opts.tempMin != null && !isNaN(opts.tempMin) ? opts.tempMin : Infinity;

	const causes: DayWarnCause[] = [];
	let severe = false;
	if (g >= gustWarn) {
		causes.push('gust');
		severe ||= g >= gustSevere;
	}
	if (p >= precipWarn) {
		causes.push('precip');
		severe ||= p >= precipSevere;
	}
	if (tx >= heatWarn) {
		causes.push('heat');
		severe ||= tx >= heatSevere;
	}
	if (tn <= coldWarn) {
		causes.push('cold');
		severe ||= tn <= coldSevere;
	}
	return { level: causes.length === 0 ? 'none' : severe ? 'severe' : 'warn', causes };
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
