/**
 * Daylight Bands
 *
 * Converts sunrise/sunset timestamp arrays into neutral background band
 * descriptors that CanvasChart renders as shaded daylight areas.
 */

/** A background band on the time axis, expressed in epoch seconds. */
export interface DaylightBand {
	/** Band start (epoch seconds) */
	start: number;
	/** Band end (epoch seconds) */
	end: number;
}

/**
 * Builds daylight bands from sunrise/sunset arrays.
 *
 * @param sunrise - Array of sunrise timestamps (unix seconds)
 * @param sunset  - Array of sunset timestamps (unix seconds)
 */
export function buildDaylightBands(sunrise: number[], sunset: number[]): DaylightBand[] {
	return sunrise.map((r, i) => ({ start: r, end: sunset[i] }));
}
