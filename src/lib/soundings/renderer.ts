// Skew-T geometry and parcel guides adapted from terraputix/meteo-fly (GPL-3.0).
// https://github.com/terraputix/meteo-fly/blob/main/src/lib/charts/skewTRenderer.ts
// SPDX-License-Identifier: GPL-3.0-only
import {
	interpolateLevel,
	pressureAtHeight,
	temperatureDisplay,
	temperatureUnit,
	valueText,
	windDisplay,
	windUnit
} from './profile';
import {
	EPS,
	dryTemperature,
	inverseSaturationVaporPressure,
	moistAdiabat,
	saturationVaporPressure
} from './thermo';

import type { UnitPrefs } from '$lib/stores/settings';
import type { SoundingProfile } from './profile';

export const TRACE_COLORS = {
	temperature: '#ef4444',
	dewpoint: '#059669',
	dry: '#87939f',
	moist: '#718b99',
	mixing: '#92958c',
	parcel: '#3b82f6'
};

export interface PlotLayout {
	left: number;
	top: number;
	width: number;
	height: number;
	minPressure: number;
	maxPressure: number;
	minX: number;
	maxX: number;
}
export interface Selection {
	temperature: number;
	pressure: number;
}
export interface ChartPalette {
	background: string;
	foreground: string;
	grid: string;
	muted: string;
}
export interface ChartLabels {
	wind: string;
	surface: string;
	temperatureUnit: string;
	windUnit: string;
}

export function toCanvas(
	layout: PlotLayout,
	temperature: number,
	pressure: number
): [number, number] {
	const y =
		Math.log(layout.maxPressure / pressure) / Math.log(layout.maxPressure / layout.minPressure);
	return [
		layout.left +
			((temperature + 40 * y - layout.minX) / (layout.maxX - layout.minX)) * layout.width,
		layout.top + (1 - y) * layout.height
	];
}

export function fromCanvas(layout: PlotLayout, x: number, y: number): Selection {
	const normalized = 1 - (y - layout.top) / layout.height;
	return {
		pressure:
			layout.maxPressure *
			Math.exp(-normalized * Math.log(layout.maxPressure / layout.minPressure)),
		temperature:
			layout.minX +
			((x - layout.left) / layout.width) * (layout.maxX - layout.minX) -
			40 * normalized
	};
}

function modelSurfacePressure(profile: SoundingProfile, elevation: number): number {
	return Number.isFinite(profile.surfacePressure) && profile.surfacePressure > 0
		? profile.surfacePressure
		: pressureAtHeight(profile.levels, elevation);
}

export function buildLayout(
	profile: SoundingProfile,
	elevation: number,
	requestedTop: number,
	width: number,
	height: number,
	dayProfiles?: SoundingProfile[]
): PlotLayout | null {
	if (dayProfiles?.length) {
		const layouts = dayProfiles
			.map((item) => buildLayout(item, elevation, requestedTop, width, height))
			.filter((item): item is PlotLayout => item !== null);
		if (!layouts.length) return null;
		return {
			...layouts[0],
			minPressure: Math.min(...layouts.map((l) => l.minPressure)),
			maxPressure: Math.max(...layouts.map((l) => l.maxPressure)),
			minX: Math.min(...layouts.map((l) => l.minX)),
			maxX: Math.max(...layouts.map((l) => l.maxX))
		};
	}
	const levels = profile.levels;
	const valid = levels.filter((level) => Number.isFinite(level.temperature));
	if (valid.length < 2) return null;
	const availableTop = Math.min(...valid.map((level) => level.pressure));
	const surface = modelSurfacePressure(profile, elevation);
	// A standard baseline makes the below-surface region visible. Expand only
	// for unusually high surface pressures or deeper supplied pressure levels.
	const maxPressure = Math.max(
		1050,
		...levels.map((level) => level.pressure),
		Number.isFinite(surface) ? Math.ceil((surface + 1) / 50) * 50 : 0
	);

	let minPressure = Math.max(availableTop, requestedTop);
	if (minPressure >= valid[1].pressure) minPressure = availableTop;
	const logRange = Math.log(maxPressure / minPressure);
	const xs = levels
		.filter((level) => level.pressure >= minPressure)
		.flatMap((level) =>
			[level.temperature, level.dewpoint]
				.filter(Number.isFinite)
				.map((t) => t + (40 * Math.log(maxPressure / level.pressure)) / logRange)
		);
	if (Number.isFinite(profile.surfaceTemperature)) xs.push(profile.surfaceTemperature);
	if (Number.isFinite(profile.surfaceDewpoint)) xs.push(profile.surfaceDewpoint);
	const minX = Math.floor((Math.min(...xs) - 10) / 10) * 10;
	const maxX = Math.max(minX + 40, Math.ceil((Math.max(...xs) + 10) / 10) * 10);
	return {
		left: 46,
		top: 44,
		width: Math.max(80, width - 116),
		height: height - 89,
		minPressure,
		maxPressure,
		minX,
		maxX
	};
}

function stroke(
	ctx: CanvasRenderingContext2D,
	points: [number, number][],
	color: string,
	width = 1,
	dash: number[] = []
) {
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.setLineDash(dash);
	ctx.beginPath();
	let drawing = false;
	for (const [x, y] of points) {
		if (!Number.isFinite(x) || !Number.isFinite(y)) {
			drawing = false;
			continue;
		}
		if (drawing) ctx.lineTo(x, y);
		else ctx.moveTo(x, y);
		drawing = true;
	}
	ctx.stroke();
	ctx.setLineDash([]);
}

function label(
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	color: string,
	align: CanvasTextAlign = 'left'
) {
	ctx.fillStyle = color;
	ctx.font = '11px system-ui, sans-serif';
	ctx.textAlign = align;
	ctx.fillText(text, x, y);
}

function clip(ctx: CanvasRenderingContext2D, layout: PlotLayout) {
	ctx.beginPath();
	ctx.rect(layout.left, layout.top, layout.width, layout.height);
	ctx.clip();
}

export function renderSounding(
	ctx: CanvasRenderingContext2D,
	profile: SoundingProfile,
	elevation: number,
	layout: PlotLayout,
	width: number,
	height: number,
	palette: ChartPalette,
	units: UnitPrefs,
	labels: ChartLabels
) {
	ctx.fillStyle = palette.background;
	ctx.fillRect(0, 0, width, height);
	const { left, top, minPressure, maxPressure } = layout;
	const bottom = top + layout.height;
	const right = left + layout.width;
	const pressures = Array.from(
		{ length: 181 },
		(_, i) => maxPressure * Math.pow(minPressure / maxPressure, i / 180)
	);
	const point = (t: number, p: number) => toCanvas(layout, t, p);
	ctx.save();
	clip(ctx, layout);
	for (let t = -100; t <= 60; t += 10)
		stroke(
			ctx,
			[point(t, maxPressure), point(t, minPressure)],
			t === 0 ? palette.muted : palette.grid
		);
	ctx.globalAlpha = 0.3;
	for (let theta = -40; theta <= 200; theta += 10)
		stroke(
			ctx,
			pressures.map((p) => point(dryTemperature(theta, 1000, p), p)),
			TRACE_COLORS.dry,
			0.8,
			[4, 4]
		);
	for (let t = -40; t <= 40; t += 5)
		stroke(
			ctx,
			moistAdiabat(t, maxPressure, minPressure).map(([temperature, p]) => point(temperature, p)),
			TRACE_COLORS.moist,
			0.8,
			[]
		);
	for (const ratio of [0.1, 0.4, 1, 2, 4, 8, 16, 32]) {
		const w = ratio / 1000;
		stroke(
			ctx,
			pressures.map((p) => point(inverseSaturationVaporPressure((w * p) / (EPS + w)), p)),
			TRACE_COLORS.mixing,
			0.7,
			[1, 5]
		);
	}
	ctx.restore();
	const ticks = [
		...new Set([
			minPressure,
			...[100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 850, 900, 1000],
			maxPressure
		])
	]
		.filter((p) => p >= minPressure && p <= maxPressure)
		.sort((a, b) => b - a);
	let lastLabel = Infinity;
	for (const p of ticks) {
		const y = point(0, p)[1];
		stroke(
			ctx,
			[
				[left, y],
				[right, y]
			],
			palette.grid
		);
		if (lastLabel - y >= 19) {
			label(ctx, `${Math.round(p)}`, left - 6, y + 4, palette.foreground, 'right');
			lastLabel = y;
		}
	}
	label(ctx, 'hPa', left - 6, 16, palette.muted, 'right');
	label(ctx, labels.wind, right + 34, 16, palette.muted, 'center');
	label(ctx, labels.windUnit, right + 34, height - 17, palette.muted, 'center');
	const tempStep = layout.width < 350 ? 20 : 10;
	for (let t = Math.ceil(layout.minX / tempStep) * tempStep; t <= layout.maxX; t += tempStep)
		label(
			ctx,
			valueText(temperatureDisplay(t, units), 0),
			point(t, maxPressure)[0],
			bottom + 19,
			palette.foreground,
			'center'
		);
	label(ctx, labels.temperatureUnit, left + layout.width / 2, height - 5, palette.muted, 'center');

	const levels = profile.levels;
	ctx.save();
	clip(ctx, layout);
	for (let i = 0; i < levels.length - 1; i++) {
		const a = levels[i],
			b = levels[i + 1];
		if (!Number.isFinite(a.cloudCover) || !Number.isFinite(b.cloudCover)) continue;
		ctx.globalAlpha = Math.max(0, Math.min(1, (a.cloudCover + b.cloudCover) / 200)) * 0.16;
		ctx.fillStyle = palette.foreground;
		const y1 = point(0, a.pressure)[1],
			y2 = point(0, b.pressure)[1];
		ctx.fillRect(left, y2, layout.width, y1 - y2);
	}
	ctx.globalAlpha = 1;
	const surface = modelSurfacePressure(profile, elevation);
	if (Number.isFinite(surface) && surface < maxPressure) {
		const surfaceY = Math.max(top, Math.min(bottom, point(0, surface)[1]));
		ctx.save();
		ctx.beginPath();
		ctx.rect(left, surfaceY, layout.width, bottom - surfaceY);
		ctx.clip();
		ctx.fillStyle = palette.muted;
		ctx.globalAlpha = 0.12;
		ctx.fillRect(left, surfaceY, layout.width, bottom - surfaceY);
		ctx.globalAlpha = 0.22;
		for (let x = left - layout.height; x < right; x += 12)
			stroke(
				ctx,
				[
					[x, bottom],
					[x + layout.height, top]
				],
				palette.muted
			);
		ctx.restore();
	}
	for (const [field, color] of [
		['temperature', TRACE_COLORS.temperature],
		['dewpoint', TRACE_COLORS.dewpoint]
	] as const) {
		stroke(
			ctx,
			levels.map((level) => point(level[field], level.pressure)),
			color,
			2.5
		);
		ctx.fillStyle = color;
		for (const level of levels) {
			if (!Number.isFinite(level[field])) continue;
			const [x, y] = point(level[field], level.pressure);
			ctx.beginPath();
			ctx.arc(x, y, 2.5, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	ctx.restore();
	if (Number.isFinite(surface) && surface >= minPressure && surface <= maxPressure) {
		const y = point(0, surface)[1];
		stroke(
			ctx,
			[
				[left, y],
				[right, y]
			],
			palette.muted,
			1,
			[5, 3]
		);
		label(ctx, labels.surface, right - 4, y - 5, palette.muted, 'right');
		for (const [t, color] of [
			[profile.surfaceTemperature, TRACE_COLORS.temperature],
			[profile.surfaceDewpoint, TRACE_COLORS.dewpoint]
		] as const) {
			if (!Number.isFinite(t)) continue;
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(point(t, surface)[0], y, 3, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	let lastWindY = Infinity;
	for (const level of levels) {
		const y = point(0, level.pressure)[1];
		if (
			y < top ||
			y > bottom ||
			lastWindY - y < 26 ||
			!Number.isFinite(level.windSpeed) ||
			!Number.isFinite(level.windDirection)
		)
			continue;
		lastWindY = y;
		const x = right + 18;
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(((level.windDirection - 180) * Math.PI) / 180);
		stroke(
			ctx,
			[
				[0, 9],
				[0, -9],
				[4, -3]
			],
			palette.foreground,
			1.4
		);
		stroke(
			ctx,
			[
				[0, -9],
				[-4, -3]
			],
			palette.foreground,
			1.4
		);
		ctx.restore();
		label(
			ctx,
			valueText(windDisplay(level.windSpeed, units), 0),
			right + 32,
			y + 4,
			palette.foreground
		);
	}
}

export function renderSelection(
	ctx: CanvasRenderingContext2D,
	layout: PlotLayout,
	selection: Selection,
	palette: ChartPalette,
	profile: SoundingProfile,
	elevation: number,
	units: UnitPrefs
) {
	const { temperature: t, pressure: p } = selection;
	const point = (temperature: number, pressure: number) => toCanvas(layout, temperature, pressure);
	const y = point(t, p)[1];
	ctx.save();
	clip(ctx, layout);
	stroke(
		ctx,
		[
			[layout.left, y],
			[layout.left + layout.width, y]
		],
		palette.muted,
		1,
		[3, 3]
	);
	const lower = Array.from({ length: 81 }, (_, i) => p + ((layout.maxPressure - p) * i) / 80);
	stroke(
		ctx,
		lower.map((pressure) => point(dryTemperature(t, p, pressure), pressure)),
		TRACE_COLORS.parcel,
		2,
		[5, 3]
	);
	stroke(
		ctx,
		moistAdiabat(t, p, layout.minPressure).map(([temperature, pressure]) =>
			point(temperature, pressure)
		),
		TRACE_COLORS.parcel,
		2,
		[5, 3]
	);
	const e = saturationVaporPressure(t);
	if (e > 0 && e < p) {
		const w = (EPS * e) / (p - e);
		stroke(
			ctx,
			lower.map((pressure) =>
				point(inverseSaturationVaporPressure((w * pressure) / (EPS + w)), pressure)
			),
			TRACE_COLORS.parcel,
			1.5,
			[3, 3]
		);
	}
	const [x, cursorY] = point(t, p);
	ctx.fillStyle = palette.foreground;
	ctx.beginPath();
	ctx.arc(x, cursorY, 3, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();

	// Labels are outside the clipping region; keep them inside the canvas and
	// put T/Td on opposite sides of the crosshair even when the traces coincide.
	const box = (
		text: string,
		x: number,
		y: number,
		color: string,
		align: CanvasTextAlign = 'left'
	) => {
		ctx.font = '11px system-ui, sans-serif';
		const width = ctx.measureText(text).width + 10;
		const left = Math.max(
			1,
			Math.min(
				layout.left + layout.width + 69 - width,
				x - (align === 'right' ? width : align === 'center' ? width / 2 : 0)
			)
		);
		const top = Math.max(1, Math.min(layout.top + layout.height + 24, y - 12));
		ctx.fillStyle = palette.background;
		ctx.fillRect(left, top, width, 18);
		label(ctx, text, left + 5, top + 13, color);
	};
	const dot = (temperature: number, pressure: number, color: string) => {
		const [x, y] = point(temperature, pressure);
		if (!Number.isFinite(x) || x < layout.left || x > layout.left + layout.width) return null;
		ctx.beginPath();
		ctx.arc(x, y, 4, 0, Math.PI * 2);
		ctx.fillStyle = palette.background;
		ctx.fill();
		ctx.lineWidth = 2;
		ctx.strokeStyle = color;
		ctx.stroke();
		return [x, y];
	};
	// Hide the static axis/wind labels underneath the inspection readout.
	ctx.fillStyle = palette.background;
	ctx.fillRect(0, y - 20, layout.left, 42);
	ctx.fillRect(layout.left + layout.width + 1, y - 20, 69, 42);
	const inspected = interpolateLevel(profile.levels, p);
	box(`${Math.round(p)}`, layout.left - 3, y - 4, palette.foreground, 'right');
	if (inspected) {
		if (Number.isFinite(inspected.height))
			box(`${Math.round(inspected.height)} m`, 0, y + 15, palette.muted);
		if (Number.isFinite(inspected.windSpeed))
			box(
				`${valueText(windDisplay(inspected.windSpeed, units))} ${windUnit(units)}`,
				layout.left + layout.width + 2,
				y - 4,
				palette.foreground
			);
		if (Number.isFinite(inspected.windDirection))
			box(
				`${Math.round(inspected.windDirection)}°`,
				layout.left + layout.width + 2,
				y + 15,
				palette.muted
			);
		for (const [field, name, offset] of [
			['temperature', 'T', -12],
			['dewpoint', 'Td', 22]
		] as const) {
			const value = inspected[field];
			const hit = dot(value, p, TRACE_COLORS[field]);
			if (hit)
				box(
					`${name} ${valueText(temperatureDisplay(value, units))}${temperatureUnit(units)}`,
					hit[0],
					y + offset,
					TRACE_COLORS[field],
					'center'
				);
		}
	}
	// Intersections of the cursor's dry adiabat and mixing-ratio line with the
	// model surface are guides, not an inferred parcel origin or LFC.
	const surface = modelSurfacePressure(profile, elevation);
	if (Number.isFinite(surface) && surface >= p && surface <= layout.maxPressure) {
		const dry = dryTemperature(t, p, surface);
		const hit = dot(dry, surface, TRACE_COLORS.parcel);
		if (hit)
			box(
				`${valueText(temperatureDisplay(dry, units))}${temperatureUnit(units)}`,
				hit[0],
				hit[1] - 10,
				TRACE_COLORS.parcel,
				'center'
			);
		if (e > 0 && e < p) {
			const w = (EPS * e) / (p - e);
			const mixing = inverseSaturationVaporPressure((w * surface) / (EPS + w));
			const hit = dot(mixing, surface, TRACE_COLORS.parcel);
			if (hit)
				box(`${valueText(w * 1000)} g/kg`, hit[0], hit[1] + 20, TRACE_COLORS.parcel, 'center');
		}
	}
}
