/**
 * Temperature color scale ported from the open-meteo/weather-map-layer
 * project (src/utils/color-scales.ts) so tables and maps share the same
 * color language. Values between breakpoints are linearly interpolated.
 */

export type RGBA = [number, number, number, number];

export interface BreakpointScale {
	unit: string;
	breakpoints: number[];
	colors: RGBA[];
}

export const temperatureScale: BreakpointScale = {
	unit: '°C',
	breakpoints: [
		-80, -65, -50, -40, -32, -28, -24, -20, -17.5, -15, -12.5, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8,
		10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50
	],
	colors: [
		[74, 13, 0, 1],
		[130, 1, 29, 1],
		[185, 4, 114, 1],
		[221, 6, 193, 1],
		[207, 6, 241, 1],
		[163, 5, 243, 1],
		[118, 4, 246, 1],
		[71, 3, 249, 1],
		[41, 2, 250, 1],
		[11, 1, 252, 1],
		[1, 22, 253, 1],
		[0, 52, 255, 1],
		[35, 99, 251, 1],
		[69, 139, 247, 1],
		[102, 171, 245, 1],
		[134, 197, 245, 1],
		[114, 232, 165, 1],
		[78, 232, 133, 1],
		[40, 233, 96, 1],
		[17, 220, 61, 1],
		[9, 191, 36, 1],
		[4, 160, 15, 1],
		[0, 128, 0, 1],
		[40, 160, 0, 1],
		[96, 192, 0, 1],
		[167, 223, 0, 1],
		[255, 255, 0, 1],
		[255, 237, 0, 1],
		[255, 219, 0, 1],
		[255, 201, 0, 1],
		[255, 183, 0, 1],
		[255, 165, 0, 1],
		[255, 138, 0, 1],
		[255, 110, 0, 1],
		[255, 83, 0, 1],
		[255, 55, 0, 1],
		[255, 27, 0, 1],
		[255, 0, 0, 1],
		[228, 0, 10, 1],
		[201, 0, 18, 1],
		[174, 0, 23, 1],
		[147, 0, 26, 1]
	]
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Linearly interpolated color for `value` on a breakpoint scale. */
export const sampleScale = (breakpoints: number[], colors: RGBA[], value: number): RGBA => {
	if (!Number.isFinite(value) || value <= breakpoints[0]) return colors[0];
	const last = breakpoints.length - 1;
	if (value >= breakpoints[last]) return colors[last];
	let i = 0;
	while (value > breakpoints[i + 1]) i++;
	const t = (value - breakpoints[i]) / (breakpoints[i + 1] - breakpoints[i]);
	const [r1, g1, b1, a1] = colors[i];
	const [r2, g2, b2, a2] = colors[i + 1];
	return [
		Math.round(lerp(r1, r2, t)),
		Math.round(lerp(g1, g2, t)),
		Math.round(lerp(b1, b2, t)),
		lerp(a1, a2, t)
	];
};

export const rgbaCss = ([r, g, b, a]: RGBA): string =>
	`rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;

/**
 * Whether text over `color` should be white, after alpha-compositing the
 * color onto the page background (light or dark).
 */
export const needsWhiteText = ([r, g, b, a]: RGBA, dark = false): boolean => {
	const base = dark ? 26 : 255;
	const cr = r * a + base * (1 - a);
	const cg = g * a + base * (1 - a);
	const cb = b * a + base * (1 - a);
	return cr * 0.299 + cg * 0.587 + cb * 0.114 <= 150;
};
