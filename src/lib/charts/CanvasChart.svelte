<!--
  CanvasChart.svelte — Self-contained canvas time-series chart

  Renders line and bar series over a shared hourly time axis on a
  devicePixelRatio-aware canvas. Supports daylight background bands,
  timezone-aware axis labels with emphasized day boundaries, a DOM tooltip
  with crosshair, Ctrl+wheel / pinch zoom, drag panning, and cross-chart
  synchronization via the `group` prop.

  Usage:
    <CanvasChart
      timestamps={epochSeconds}
      timezone="Europe/Berlin"
      series={[{ name: 'Temperature', type: 'line', color: '#ef6c00', data: temps }]}
      bands={daylightBands}
      unit="°C"
      group="meteogram"
    />
-->
<script module lang="ts">
	import * as m from '$lib/paraglide/messages';

	export interface ChartSeries {
		/** Series display name (used in legend and tooltip) */
		name: string;
		/** Render style */
		type: 'line' | 'bar' | 'point';
		/** Any CSS color string */
		color: string;
		/** One value per timestamp; null values break lines */
		data: (number | null)[];
		/** Line width in px (default 2); 0 draws only the area fill */
		width?: number;
		/** Radius in px for point series (default 3). */
		pointRadius?: number;
		/** Draw a low-alpha area fill below (or above, on inverted axes) the line */
		fill?: boolean;
		/** Area fill coloured by the value scale (segmentColor), fading to
		 *  transparent ~20px below the series minimum. */
		gradientFill?: boolean;
		/** With `fill`, fill the area between this line and another data array
		 *  instead of the baseline (e.g. an ensemble min-max band) */
		bandTo?: (number | null)[];
		/** Opacity of the area fill (default 0.15) */
		fillOpacity?: number;
		/** Draw the line dashed */
		dashed?: boolean;
		/** Hide the series entirely (not rendered, not listed in the tooltip) */
		hidden?: boolean;
		/** Which y axis the series is scaled against (default 'left') */
		axis?: 'left' | 'right';
		/** Include the series in the legend row (default true) */
		showInLegend?: boolean;
		/** Custom tooltip value formatter */
		format?: (value: number, index: number) => string;
		/** Short name used in the tooltip / legend when the full name is long */
		shortName?: string;
		/** Colour each line segment by value (e.g. a temperature colour scale) */
		segmentColor?: (value: number, index: number) => string;
		/** Draw the line itself in the theme foreground (black/white), ignoring
		 *  segmentColor for the stroke (segmentColor still colours any fill) */
		foregroundLine?: boolean;
		/** Draw a contrasting halo (black in light mode, white in dark) under the line */
		outline?: boolean;
		/** Annotate local minima / maxima with their value */
		labelExtrema?: boolean;
		/** Formatter for extrema labels (defaults to the tooltip format) */
		labelFormat?: (value: number) => string;
		/** Render as a soft cloud band instead of a line (see `cloudLayer`) */
		cloudBand?: boolean;
		/**
		 * Which slot a cloud band occupies. Omitted (total cover) hangs from the
		 * top of the plot; the named layers stack in their real vertical order,
		 * each in its own slot, so a layered chart reads like the sky itself.
		 */
		cloudLayer?: 'high' | 'mid' | 'low';
	}

	export interface ChartAgreementPoint {
		wetCount: number;
		availableCount: number;
		median: number;
		min: number;
		max: number;
	}

	export interface ChartAgreementStrip {
		points: (ChartAgreementPoint | null)[];
		label: string;
		format: (point: ChartAgreementPoint) => string;
	}

	interface GroupState {
		range: { start: number; end: number } | null;
		hover: number | null;
		count: number;
	}

	// Module-level registry: charts sharing a `group` name share zoom range and
	// crosshair position through one reactive state object.
	const groups: Record<string, GroupState> = $state({});

	function acquireGroup(name: string): GroupState {
		if (!groups[name]) {
			groups[name] = { range: null, hover: null, count: 0 };
		}
		groups[name].count++;
		return groups[name];
	}

	function releaseGroup(name: string): void {
		const state = groups[name];
		if (!state) return;
		state.count--;
		if (state.count <= 0) {
			delete groups[name];
		}
	}

	/** Register a non-chart surface that participates in synchronized interactions. */
	export function registerGroupMember(name: string): () => void {
		acquireGroup(name);
		let registered = true;
		return () => {
			if (!registered) return;
			registered = false;
			releaseGroup(name);
		};
	}

	/**
	 * Drive the shared crosshair of a chart group from the outside (e.g. hovering
	 * the hourly table). `time` is epoch seconds, or null to clear. No-op if no
	 * chart in that group is currently mounted.
	 */
	export function setGroupHover(name: string, time: number | null): void {
		const state = groups[name];
		if (state && state.hover !== time) state.hover = time;
	}

	/** Set the synchronized visible time range for a registered chart group. */
	export function setGroupRange(name: string, range: { start: number; end: number } | null): void {
		const state = groups[name];
		if (state) state.range = range;
	}

	/** Current shared zoom range of a group (null = full range), reactive. */
	export function groupRange(name: string): { start: number; end: number } | null {
		return groups[name]?.range ?? null;
	}

	/**
	 * Current shared crosshair time of a group (epoch seconds, or null), reactive.
	 * Lets outside UI (e.g. the hourly table) mirror the chart's hovered timestep.
	 */
	export function groupHover(name: string): number | null {
		return groups[name]?.hover ?? null;
	}
</script>

<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	import { formatZoned, getZonedHour } from '$lib/utils/date';
	import { useNow } from '$lib/utils/now.svelte';

	import { CHART_COLORS } from './data';

	// ─── Props ──────────────────────────────────────────────────────────────────

	interface Props {
		/** Time axis values in epoch seconds (shared by all series) */
		timestamps: number[];
		/** IANA timezone used for all time labels */
		timezone: string;
		/** Series to render */
		series: ChartSeries[];
		/** Background bands (epoch seconds), e.g. daylight */
		bands?: { start: number; end: number }[];
		/** Weather pictograms drawn across the top (t in epoch seconds) */
		pictograms?: { t: number; icon: string }[];
		/** Wind-direction arrows drawn across the top (t in epoch seconds, deg from N) */
		windArrows?: { t: number; deg: number }[];
		/** Highlighted time range (epoch seconds), e.g. the selected day */
		highlight?: { start: number; end: number };
		/** Compact per-timestamp model-agreement band below the plot. */
		agreementStrip?: ChartAgreementStrip;
		/** Unit label for the left y axis (also used in tooltip values) */
		unit?: string;
		/** Unit label for the right y axis; when set, right-axis labels are drawn */
		unitRight?: string;
		/** Canvas height in px */
		height?: number;
		/** Charts sharing a group share x-zoom range and crosshair */
		group?: string;
		/** Fixed left-axis minimum (otherwise derived from data, including 0) */
		yMin?: number;
		/** Minimum breathing room (axis units) above the left-axis data range. */
		yPadTop?: number;
		/** Minimum breathing room (axis units) below the left-axis data range. */
		yPadBottom?: number;
		/** Fixed left-axis maximum */
		yMax?: number;
		/** Explicit left-axis tick values (for categorical/fixed domains). */
		yTicks?: number[];
		/** Custom left-axis tick formatter. */
		yTickFormat?: (value: number) => string;
		/** Use abbreviated y-axis labels and omit verbose gutter labels. */
		compactYAxis?: boolean;
		/** Force the derived left axis to include zero (default true) */
		zeroBaseLeft?: boolean;
		/** Fixed right-axis minimum (default 0) */
		yMinRight?: number;
		/** Fixed right-axis maximum (default 100) */
		yMaxRight?: number;
		/** Invert the right axis (min at the top) */
		invertRight?: boolean;
		/** Reserve the right-axis gutter even without a right axis (keeps a row of
		 *  stacked charts identically sized) */
		reserveRightAxis?: boolean;
		/** Reserve this many top icon-rows even if this chart has fewer, so a row
		 *  of stacked charts share the same plot rectangle */
		reserveTopRows?: number;
		/** Override the plot's left inset so heterogeneous synchronized panels align. */
		plotInsetLeft?: number;
		/** Override the plot's right inset so heterogeneous synchronized panels align. */
		plotInsetRight?: number;
		/** Chart title drawn top-left on the canvas */
		title?: string;
		/** Smaller subtitle drawn under the title */
		subtitle?: string;
		/** Show the DOM legend row above the canvas */
		showLegend?: boolean;
		/** Draw a red vertical line at the current time */
		showNow?: boolean;
		/** Draw the Open-Meteo.com credit bottom-right */
		showCredit?: boolean;
		/** Accessible description for the interactive canvas. */
		ariaLabel?: string;
		/** Optional CSS class for the outer container */
		class?: string;
	}

	let {
		timestamps,
		timezone,
		series,
		bands = [],
		pictograms = [],
		windArrows = [],
		highlight,
		agreementStrip,
		unit = '',
		unitRight,
		height = 300,
		group,
		yMin,
		yMax,
		yTicks,
		yTickFormat,
		compactYAxis = false,
		yPadTop,
		yPadBottom,
		zeroBaseLeft = true,
		yMinRight,
		yMaxRight,
		invertRight = false,
		reserveRightAxis = false,
		reserveTopRows = 0,
		plotInsetLeft,
		plotInsetRight,
		title,
		subtitle,
		showLegend = false,
		showNow = true,
		showCredit = false,
		ariaLabel,
		class: className = ''
	}: Props = $props();

	// Minute-resolution clock shared with the rest of the app; read in draw() so
	// the current-time marker stays put as time passes.
	const clock = useNow();

	// ─── Constants ──────────────────────────────────────────────────────────────

	const PAD_BOTTOM = 34;
	const AGREEMENT_STRIP_HEIGHT = 10;
	const AGREEMENT_STRIP_GAP = 3;
	const MIN_SPAN = 2 * 3600; // minimum zoom window: 2 hours
	const HOUR = 3600;
	// Top icon rows (weather pictograms / wind arrows)
	const ICON_ROW_H = 40; // reserved height per icon row
	const ICON_BAND_H = 38; // visible band height
	const ICON_PX = 25; // pictogram size (a touch smaller than the arrows)
	const ARROW_PX = 36; // wind-direction arrow size
	// edge inset used for BOTH rows so pictograms and arrows clamp to the same
	// centre and stay aligned with each other
	const ICON_EDGE = ARROW_PX / 2;
	// Total cloud cover: 100% reaches this far down from the top of the plot.
	const CLOUD_BAND_MAX = 48;
	// Layered cover (high / mid / low): each layer owns a slot of this height and
	// grows symmetrically out of the centre line of that slot.
	const CLOUD_LAYER_H = 42;
	const CLOUD_LAYER_GAP = 6;
	const CLOUD_LAYER_ORDER = ['high', 'mid', 'low'] as const;

	/** Return a colour string with the given alpha (handles rgb/rgba/#hex). */
	function withAlpha(color: string, alpha: number): string {
		const m = color.match(/rgba?\(([^)]+)\)/);
		if (m) {
			const [r, g, b] = m[1].split(',').map((p) => parseFloat(p));
			return `rgba(${r}, ${g}, ${b}, ${alpha})`;
		}
		if (color[0] === '#') {
			const h = color.slice(1);
			const n =
				h.length === 3
					? h
							.split('')
							.map((c) => c + c)
							.join('')
					: h;
			const r = parseInt(n.slice(0, 2), 16);
			const g = parseInt(n.slice(2, 4), 16);
			const b = parseInt(n.slice(4, 6), 16);
			return `rgba(${r}, ${g}, ${b}, ${alpha})`;
		}
		return color;
	}

	function agreementMarkerColor(point: ChartAgreementPoint): string {
		if (point.wetCount === 0) return '#6b7280';
		const wetShare = point.wetCount / Math.max(1, point.availableCount);
		return wetShare <= 0.5 ? '#d97706' : '#2563eb';
	}

	function agreementFillColor(point: ChartAgreementPoint, mutedColor: string): string {
		if (point.wetCount === 0) return withAlpha(mutedColor, 0.3);
		const wetShare = point.wetCount / Math.max(1, point.availableCount);
		const agreement = Math.abs(wetShare - 0.5) * 2;
		if (wetShare <= 0.5) return withAlpha('#d97706', 0.35 + (1 - agreement) * 0.35);
		return withAlpha('#2563eb', 0.3 + agreement * 0.6);
	}

	/**
	 * Light [1 2 1] smoothing pass. Cloud cover is noisy hour to hour; smoothing
	 * the values before interpolating gives the band a slow, rolling silhouette
	 * instead of one that tracks every single sample.
	 */
	function smoothCover(values: number[], passes = 2): number[] {
		let out = values;
		for (let p = 0; p < passes; p++) {
			const next = new Array<number>(out.length);
			for (let i = 0; i < out.length; i++) {
				const prev = out[i - 1] ?? out[i];
				const nxt = out[i + 1] ?? out[i];
				next[i] = (prev + 2 * out[i] + nxt) / 4;
			}
			out = next;
		}
		return out;
	}

	/** Vertical offset of a cloud series' slot from the top of the plot. */
	function cloudSlotOffset(s: ChartSeries): number {
		if (!s.cloudLayer) return 0;
		return CLOUD_LAYER_ORDER.indexOf(s.cloudLayer) * (CLOUD_LAYER_H + CLOUD_LAYER_GAP);
	}

	/**
	 * Traces a monotone cubic (Fritsch-Carlson) curve through the points. Unlike a
	 * plain Catmull-Rom spline it never overshoots the data, so a cloud band can't
	 * bulge past 0% or 100% between two samples.
	 */
	function traceMonotone(
		ctx: CanvasRenderingContext2D,
		pts: Array<[number, number]>,
		continuePath = false
	): void {
		const n = pts.length;
		if (!continuePath) ctx.moveTo(pts[0][0], pts[0][1]);
		if (n === 2) {
			ctx.lineTo(pts[1][0], pts[1][1]);
			return;
		}

		// secant slopes, then tangents averaged from the neighbouring secants
		const slope: number[] = [];
		for (let i = 0; i < n - 1; i++) {
			const dx = pts[i + 1][0] - pts[i][0];
			slope.push(dx === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx);
		}
		const m: number[] = [slope[0]];
		for (let i = 1; i < n - 1; i++) m.push((slope[i - 1] + slope[i]) / 2);
		m.push(slope[n - 2]);

		// clamp the tangents back onto the monotone circle of radius 3
		for (let i = 0; i < n - 1; i++) {
			if (slope[i] === 0) {
				m[i] = 0;
				m[i + 1] = 0;
				continue;
			}
			const a = m[i] / slope[i];
			const b = m[i + 1] / slope[i];
			const h = a * a + b * b;
			if (h > 9) {
				const t = 3 / Math.sqrt(h);
				m[i] = t * a * slope[i];
				m[i + 1] = t * b * slope[i];
			}
		}

		for (let i = 0; i < n - 1; i++) {
			const [x0, y0] = pts[i];
			const [x1, y1] = pts[i + 1];
			const dx = (x1 - x0) / 3;
			ctx.bezierCurveTo(x0 + dx, y0 + m[i] * dx, x1 - dx, y1 - m[i + 1] * dx, x1, y1);
		}
	}

	// ─── State ──────────────────────────────────────────────────────────────────

	let containerEl: HTMLDivElement | undefined = $state();
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let width = $state(0);
	let themeVersion = $state(0);
	const legendHidden = new SvelteSet<string>();

	// Drag-to-zoom selection rectangle (plot-local pixel x), null when inactive.
	let dragSelect = $state<{ x0: number; x1: number } | null>(null);

	// Zoom range and crosshair: either group-shared or local to this chart.
	// The group is acquired once at component init (the prop is treated as fixed).
	const groupName = untrack(() => group);
	const groupState: GroupState | null = groupName ? acquireGroup(groupName) : null;
	let localRange = $state<{ start: number; end: number } | null>(null);
	let localHover = $state<number | null>(null);
	// Pointer hover is visual only. Live-region announcements are enabled by
	// keyboard navigation so mouse movement does not continuously invalidate the
	// accessibility tree (and only the keyboard-focused chart announces changes).
	let announceHover = $state(false);

	onDestroy(() => {
		if (groupName) releaseGroup(groupName);
	});

	// ─── Derived: view window & scales ──────────────────────────────────────────

	let viewRange = $derived(groupState ? groupState.range : localRange);
	let hoverTime = $derived(groupState ? groupState.hover : localHover);

	let tMin = $derived(timestamps.length > 0 ? timestamps[0] : 0);
	let tMax = $derived(timestamps.length > 1 ? timestamps[timestamps.length - 1] : tMin + HOUR);
	let viewStart = $derived(viewRange ? Math.max(tMin, viewRange.start) : tMin);
	let viewEnd = $derived(
		viewRange ? Math.max(viewStart + MIN_SPAN / 2, Math.min(tMax, viewRange.end)) : tMax
	);
	let zoomed = $derived(viewRange !== null && viewEnd - viewStart < tMax - tMin);

	let visibleSeries = $derived(series.filter((s) => !s.hidden && !legendHidden.has(s.name)));
	// Cloud-band series draw a decorative top band and are excluded from the
	// axis scale and from the normal line/bar drawing.
	let plottedSeries = $derived(visibleSeries.filter((s) => !s.cloudBand));
	let cloudBandSeries = $derived(visibleSeries.filter((s) => s.cloudBand));
	let hasRightAxis = $derived(plottedSeries.some((s) => s.axis === 'right'));

	// Minimal gutters on narrow screens so the plot uses nearly the full width
	// (just enough to keep the axis tick labels legible).
	// Compact gutters (small axis padding, short icon rows) apply to phones AND
	// tablets: below `lg` the page is edge-to-edge, so wide desktop-style axis
	// margins would waste most of the width. Desktop keeps its roomier metrics.
	let belowDesktop = $state(false);
	onMount(() => {
		const mq = window.matchMedia('(max-width: 1023px)');
		const apply = () => (belowDesktop = mq.matches);
		apply();
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	});
	let isNarrow = $derived(belowDesktop || (width > 0 && width < 520));
	let padLeft = $derived(plotInsetLeft ?? (isNarrow ? (yTicks?.length ? 52 : 26) : 60));
	// Reserve the right gutter when this chart (or a sibling, via reserveRightAxis)
	// has a right axis, so a stacked row of charts share the same plot width. On
	// narrow (mobile) screens we don't reserve it — the graph uses the full width
	// and the right-axis labels are drawn overlaid on top instead (see below).
	let padRight = $derived(
		plotInsetRight ?? (isNarrow ? 6 : hasRightAxis || reserveRightAxis ? 56 : 20)
	);
	// Icon rows across the top: pictograms and/or wind arrows. reserveTopRows keeps
	// a stacked row of charts the same height even if some have fewer icon rows —
	// but only on wide screens: on mobile that uniform band wastes precious
	// vertical space, so each chart reserves just its own rows there.
	let ownIconRows = $derived((pictograms.length > 0 ? 1 : 0) + (windArrows.length > 0 ? 1 : 0));
	let iconRows = $derived(isNarrow ? ownIconRows : Math.max(ownIconRows, reserveTopRows));
	// tighter top/bottom gutters on mobile so charts don't waste vertical space
	const iconRowH = $derived(isNarrow ? 30 : ICON_ROW_H);
	let padTop = $derived((title ? (subtitle ? 66 : 46) : isNarrow ? 22 : 28) + iconRows * iconRowH);
	let agreementStripOffset = $derived(
		agreementStrip ? AGREEMENT_STRIP_HEIGHT + AGREEMENT_STRIP_GAP + 2 : 0
	);
	let padBottom = $derived((isNarrow ? 24 : PAD_BOTTOM) + agreementStripOffset);
	let plotW = $derived(Math.max(1, width - padLeft - padRight));
	let plotH = $derived(Math.max(1, height - padTop - padBottom));

	interface Scale {
		min: number;
		max: number;
		step: number;
	}

	function niceNum(range: number, round: boolean): number {
		const exp = Math.floor(Math.log10(range));
		const frac = range / 10 ** exp;
		let nice: number;
		if (round) {
			nice = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
		} else {
			nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
		}
		return nice * 10 ** exp;
	}

	function dataExtent(axis: 'left' | 'right', includeZero = true): [number, number] {
		let lo = Infinity;
		let hi = -Infinity;
		for (const s of plottedSeries) {
			if ((s.axis ?? 'left') !== axis) continue;
			for (const v of s.data) {
				if (v === null || !isFinite(v)) continue;
				if (v < lo) lo = v;
				if (v > hi) hi = v;
			}
		}
		if (!isFinite(lo)) return [0, 1];
		// Match the previous ECharts behavior (value axis without `scale`): always
		// include zero in the axis extent. Skipped for derived secondary axes
		// (e.g. pressure) where zero would flatten the series.
		if (includeZero) {
			lo = Math.min(lo, 0);
			hi = Math.max(hi, 0);
		}
		if (lo === hi) hi = lo + 1;
		return [lo, hi];
	}

	function buildScale(
		lo: number,
		hi: number,
		loFixed: boolean,
		hiFixed: boolean,
		halfStepBounds = false
	): Scale {
		const step = niceNum(niceNum(Math.max(hi - lo, 1e-9), false) / 4, true);
		// Padded axes (e.g. temperature) may end on HALF steps — 5° when ticks
		// are every 10° — so the requested margin isn't inflated to a whole step.
		// Tick drawing starts at the first full-step multiple, so a half-step
		// bound gets no label or gridline of its own.
		const snap = halfStepBounds ? step / 2 : step;
		const min = loFixed ? lo : Math.floor(lo / snap) * snap;
		const max = hiFixed ? hi : Math.ceil(hi / snap) * snap;
		return { min, max: max > min ? max : min + step, step };
	}

	/** First tick at or above the scale minimum (bounds may sit on half steps). */
	function firstTick(scale: Scale): number {
		return Math.ceil((scale.min - 1e-9) / scale.step) * scale.step;
	}

	let leftScale = $derived.by((): Scale => {
		let [dLo, dHi] = dataExtent('left', zeroBaseLeft);
		// requested breathing room around the data (e.g. temperature): at least
		// the given units, growing with wide ranges so it stays proportionate
		const span = dHi - dLo;
		const padded = yPadTop != null || yPadBottom != null;
		if (yMax === undefined && yPadTop) dHi += Math.max(yPadTop, span * 0.08);
		if (yMin === undefined && yPadBottom) dLo -= Math.max(yPadBottom, span * 0.12);
		return buildScale(yMin ?? dLo, yMax ?? dHi, yMin !== undefined, yMax !== undefined, padded);
	});

	let rightScale = $derived.by((): Scale => {
		// Use explicit bounds when given; otherwise derive from the right-axis
		// data so arbitrary variables (pressure, wind, …) can share a panel.
		const loFixed = yMinRight !== undefined;
		const hiFixed = yMaxRight !== undefined;
		if (loFixed && hiFixed) return buildScale(yMinRight!, yMaxRight!, true, true);
		const [dLo, dHi] = dataExtent('right', false);
		return buildScale(yMinRight ?? dLo, yMaxRight ?? dHi, loFixed, hiFixed);
	});

	function xPix(t: number): number {
		return padLeft + ((t - viewStart) / (viewEnd - viewStart)) * plotW;
	}

	function pixToTime(x: number): number {
		return viewStart + ((x - padLeft) / plotW) * (viewEnd - viewStart);
	}

	function yPix(v: number, axis: 'left' | 'right'): number {
		if (axis === 'right') {
			const frac = (v - rightScale.min) / (rightScale.max - rightScale.min);
			return invertRight ? padTop + frac * plotH : padTop + (1 - frac) * plotH;
		}
		const frac = (v - leftScale.min) / (leftScale.max - leftScale.min);
		return padTop + (1 - frac) * plotH;
	}

	// ─── Zoom / pan helpers ─────────────────────────────────────────────────────

	function setViewRange(range: { start: number; end: number } | null): void {
		if (groupState) groupState.range = range;
		else localRange = range;
	}

	function setHover(time: number | null): void {
		if (groupState) {
			if (groupState.hover !== time) groupState.hover = time;
		} else if (localHover !== time) {
			localHover = time;
		}
	}

	function applyRange(start: number, end: number): void {
		const full = tMax - tMin;
		const span = Math.min(Math.max(end - start, MIN_SPAN), full);
		if (span >= full) {
			setViewRange(null);
			return;
		}
		const s = Math.max(tMin, Math.min(start, tMax - span));
		setViewRange({ start: s, end: s + span });
	}

	function zoomAt(centerTime: number, factor: number): void {
		const span = viewEnd - viewStart;
		const newSpan = span * factor;
		const frac = (centerTime - viewStart) / span;
		applyRange(centerTime - frac * newSpan, centerTime + (1 - frac) * newSpan);
	}

	// ─── Public API ─────────────────────────────────────────────────────────────

	/** Returns the chart as a PNG data URL, or null before mount. */
	export function getPngDataUrl(): string | null {
		return canvasEl ? canvasEl.toDataURL('image/png') : null;
	}

	// ─── Full export (title + icon bands + legend composited onto one canvas) ────
	// The canvas alone omits the DOM overlays (weather/wind icons), the panel
	// title (rendered by the parent), and the legend (an HTML row). This builds a
	// standalone canvas that includes all of them so downloads look like the page.
	const iconImageCache = new SvelteMap<string, Promise<HTMLImageElement>>();
	function loadColoredIcon(name: string, color: string): Promise<HTMLImageElement> {
		const key = `${name}|${color}`;
		let p = iconImageCache.get(key);
		if (!p) {
			p = fetch(`/images/weather-icons/${name}.svg`)
				.then((r) => r.text())
				.then(
					(svg) =>
						new Promise<HTMLImageElement>((resolve, reject) => {
							// the paths carry no fill, so a root fill tints the whole glyph
							const colored = svg.replace(/<svg\b/, `<svg fill="${color}"`);
							const url = URL.createObjectURL(new Blob([colored], { type: 'image/svg+xml' }));
							const img = new Image();
							img.onload = () => {
								URL.revokeObjectURL(url);
								resolve(img);
							};
							img.onerror = (e) => {
								URL.revokeObjectURL(url);
								reject(e);
							};
							img.src = url;
						})
				);
			iconImageCache.set(key, p);
		}
		return p;
	}

	/**
	 * Composite the chart, its icon bands, an optional title, and the legend onto
	 * a fresh canvas for export. Async because the icon SVGs are rasterized.
	 */
	export async function getExportImage(opts?: {
		title?: string;
	}): Promise<HTMLCanvasElement | null> {
		if (!canvasEl || !containerEl || width <= 0) return null;
		const dpr = window.devicePixelRatio || 1;
		const styles = getComputedStyle(containerEl);
		const cssVar = (n: string, f: string) => styles.getPropertyValue(n).trim() || f;
		const strong = cssVar('--foreground', '#374151');
		const muted = cssVar('--muted-foreground', '#6b7280');
		const bg = cssVar('--card', '#ffffff');

		const title = opts?.title;
		const titleH = title ? 30 : 0;
		const legendItems = showLegend ? series.filter((s) => s.showInLegend !== false) : [];
		const legendH = legendItems.length > 0 ? 28 : 0;
		const totalH = titleH + height + legendH;

		const out = document.createElement('canvas');
		out.width = Math.round(width * dpr);
		out.height = Math.round(totalH * dpr);
		const ctx = out.getContext('2d');
		if (!ctx) return null;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, width, totalH);

		if (title) {
			ctx.fillStyle = strong;
			ctx.font = '600 14px system-ui, -apple-system, sans-serif';
			ctx.textAlign = 'left';
			ctx.textBaseline = 'middle';
			ctx.fillText(title, 4, titleH / 2 + 2);
		}

		// the plot itself (canvasEl is a dpr-scaled bitmap of the css-sized chart)
		ctx.drawImage(canvasEl, 0, titleH, width, height);

		// weather pictograms
		for (const p of visiblePictograms) {
			try {
				const img = await loadColoredIcon(p.icon, strong);
				const cx = Math.max(ICON_EDGE, Math.min(iconBandWidth - ICON_EDGE, p.x));
				ctx.drawImage(
					img,
					iconBandLeft + cx - ICON_PX / 2,
					titleH + pictoRowTop + (ICON_BAND_H - ICON_PX) / 2,
					ICON_PX,
					ICON_PX
				);
			} catch {
				/* skip an icon that failed to rasterize */
			}
		}

		// wind-direction arrows, rotated about their centre
		for (const a of visibleWindArrows) {
			try {
				const img = await loadColoredIcon('wi-direction-down', strong);
				const cx = Math.max(ICON_EDGE, Math.min(iconBandWidth - ICON_EDGE, a.x));
				ctx.save();
				ctx.translate(iconBandLeft + cx, titleH + windRowTop + ICON_BAND_H / 2);
				ctx.rotate((a.deg * Math.PI) / 180);
				ctx.globalAlpha = 0.8;
				ctx.drawImage(img, -ARROW_PX / 2, -ARROW_PX / 2, ARROW_PX, ARROW_PX);
				ctx.restore();
			} catch {
				/* skip */
			}
		}

		// legend row, centred like the on-screen one
		if (legendItems.length > 0) {
			ctx.font = '12px system-ui, -apple-system, sans-serif';
			ctx.textAlign = 'left';
			ctx.textBaseline = 'middle';
			const gap = 12;
			const dot = 9;
			const dotGap = 6;
			const widths = legendItems.map((s) => dot + dotGap + ctx.measureText(s.name).width);
			const totalW = widths.reduce((a, b) => a + b, 0) + gap * (legendItems.length - 1);
			let x = Math.max(4, (width - totalW) / 2);
			const y = titleH + height + legendH / 2;
			for (let i = 0; i < legendItems.length; i++) {
				const s = legendItems[i];
				ctx.fillStyle = s.color;
				ctx.beginPath();
				ctx.arc(x + dot / 2, y, dot / 2, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = muted;
				ctx.fillText(s.name, x + dot + dotGap, y);
				x += widths[i] + gap;
			}
		}

		// credit hugging the bottom-right corner of the export
		if (showCredit) {
			ctx.font = '10px system-ui, -apple-system, sans-serif';
			ctx.textAlign = 'right';
			ctx.textBaseline = 'alphabetic';
			ctx.fillStyle = muted;
			ctx.globalAlpha = 0.8;
			ctx.fillText(
				`${m.footer_data_by()} Open-Meteo · ${m.chart_credit_viz()} Drizz.li`,
				width - 6,
				totalH - 5
			);
			ctx.globalAlpha = 1;
		}

		return out;
	}

	/** Zooms the x axis to the given epoch-second range (clamped to the data). */
	export function setRange(startEpoch: number, endEpoch: number): void {
		applyRange(startEpoch, endEpoch);
	}

	/** Resets the x axis to the full data range. */
	export function resetRange(): void {
		setViewRange(null);
	}

	// ─── Tooltip data ───────────────────────────────────────────────────────────

	function nearestIndex(arr: number[], t: number): number {
		let lo = 0;
		let hi = arr.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (arr[mid] < t) lo = mid + 1;
			else hi = mid;
		}
		if (lo > 0 && Math.abs(arr[lo - 1] - t) <= Math.abs(arr[lo] - t)) return lo - 1;
		return lo;
	}

	let hoverIdx = $derived(
		hoverTime === null || timestamps.length === 0 ? -1 : nearestIndex(timestamps, hoverTime)
	);

	interface TooltipRow {
		name: string;
		color: string;
		value: string;
	}

	let tooltipRows = $derived.by((): TooltipRow[] => {
		if (hoverIdx < 0) return [];
		const rows: TooltipRow[] = [];
		for (const s of visibleSeries) {
			const v = s.data[hoverIdx];
			if (v === null || v === undefined || !isFinite(v)) continue;
			const axisUnit = (s.axis ?? 'left') === 'right' ? (unitRight ?? '') : unit;
			const value = s.format
				? s.format(v, hoverIdx)
				: `${v.toFixed(1)}${axisUnit ? ' ' + axisUnit : ''}`;
			rows.push({ name: s.shortName ?? s.name, color: s.color, value });
		}
		const agreementPoint = agreementStrip?.points[hoverIdx];
		if (agreementStrip && agreementPoint && agreementPoint.availableCount > 0) {
			rows.push({
				name: agreementStrip.label,
				color: agreementMarkerColor(agreementPoint),
				value: agreementStrip.format(agreementPoint)
			});
		}
		return rows;
	});

	let tooltipVisible = $derived(hoverIdx >= 0 && tooltipRows.length > 0 && width > 0);
	let tooltipX = $derived(hoverIdx >= 0 ? xPix(timestamps[hoverIdx]) : 0);
	let tooltipFlip = $derived(tooltipX > width * 0.55);
	let crosshairVisible = $derived(
		hoverIdx >= 0 &&
			timestamps[hoverIdx] >= viewStart &&
			timestamps[hoverIdx] <= viewEnd &&
			width > 0
	);

	// ─── Pictograms (DOM overlay across the top) ─────────────────────────────────

	// The icon band spans exactly the plot area so the icons line up with the
	// data (and axis) below and never overhang the plot's cut-off edge.
	let iconBandLeft = $derived(padLeft);
	let iconBandWidth = $derived(plotW);
	function iconBandX(t: number): number {
		return xPix(t) - padLeft;
	}

	// Thin the icons so they never crowd: keep ≥ 40px apart within the band.
	let visiblePictograms = $derived.by((): { x: number; icon: string }[] => {
		if (pictograms.length === 0 || width <= 0) return [];
		const out: { x: number; icon: string }[] = [];
		let lastX = -Infinity;
		for (const p of pictograms) {
			if (p.t < viewStart || p.t > viewEnd) continue;
			const x = iconBandX(p.t);
			// keep clear of the band edges so the first/last never bunch or clip
			if (x < ICON_EDGE || x > iconBandWidth - ICON_EDGE) continue;
			if (x - lastX < 40) continue;
			out.push({ x, icon: p.icon });
			lastX = x;
		}
		return out;
	});

	// Same thinning for the wind-direction arrow row.
	let visibleWindArrows = $derived.by((): { x: number; deg: number }[] => {
		if (windArrows.length === 0 || width <= 0) return [];
		const out: { x: number; deg: number }[] = [];
		let lastX = -Infinity;
		for (const a of windArrows) {
			if (a.t < viewStart || a.t > viewEnd) continue;
			const x = iconBandX(a.t);
			if (x < ICON_EDGE || x > iconBandWidth - ICON_EDGE) continue;
			if (x - lastX < 40) continue;
			out.push({ x, deg: a.deg });
			lastX = x;
		}
		return out;
	});

	// Vertical offset (px from container top) of each icon row's top edge, anchored
	// just above the plot. When both rows are present, pictograms sit above the
	// wind arrows (which stay closest to the plot).
	let pictoRowTop = $derived(padTop - (windArrows.length > 0 ? 2 : 1) * iconRowH + 2);
	let windRowTop = $derived(padTop - iconRowH + 2);

	// ─── Local minima / maxima (for value labels) ────────────────────────────────

	function findExtrema(data: (number | null)[]): { i: number; type: 'min' | 'max' }[] {
		const res: { i: number; type: 'min' | 'max' }[] = [];
		const W = 3;
		let lastLabeled = -Infinity;
		for (let i = 0; i < data.length; i++) {
			const v = data[i];
			if (v === null || !isFinite(v)) continue;
			let noGreater = true;
			let noLess = true;
			let someLess = false;
			let someGreater = false;
			for (let j = Math.max(0, i - W); j <= Math.min(data.length - 1, i + W); j++) {
				if (j === i) continue;
				const u = data[j];
				if (u === null || !isFinite(u)) continue;
				if (u > v) {
					noGreater = false;
					someGreater = true;
				} else if (u < v) {
					noLess = false;
					someLess = true;
				}
			}
			const isMax = noGreater && someLess;
			const isMin = noLess && someGreater;
			if ((isMax || isMin) && i - lastLabeled >= W) {
				res.push({ i, type: isMax ? 'max' : 'min' });
				lastLabeled = i;
			}
		}
		return res;
	}

	// ─── X axis ticks ───────────────────────────────────────────────────────────

	interface XTick {
		t: number;
		label: string;
		isDay: boolean;
	}

	function computeXTicks(): XTick[] {
		const spanHours = (viewEnd - viewStart) / HOUR;
		const pxPerHour = plotW / spanHours;
		const steps = [1, 2, 3, 6, 12, 24];
		let step = 24;
		for (const s of steps) {
			if (s * pxPerHour >= 48) {
				step = s;
				break;
			}
		}
		// A "EEE d" day label needs ~46px of room; when days are packed tighter
		// (long ranges on a narrow screen) keep every day's gridline but only
		// label every Nth one so the dates never overlap.
		const pxPerDay = 24 * pxPerHour;
		const dayStride = pxPerDay >= 46 ? 1 : Math.max(1, Math.ceil(46 / pxPerDay));
		const ticks: XTick[] = [];
		const first = Math.ceil(viewStart / HOUR) * HOUR;
		let dayCount = 0;
		for (let t = first; t <= viewEnd; t += HOUR) {
			const date = new Date(t * 1000);
			const hour = getZonedHour(date, timezone);
			if (hour === 0) {
				const showLabel = dayCount % dayStride === 0;
				dayCount++;
				ticks.push({
					t,
					label: showLabel ? formatZoned(date, timezone, 'EEE d') : '',
					isDay: true
				});
			} else if (step < 24 && hour % step === 0) {
				ticks.push({ t, label: formatZoned(date, timezone, 'HH:mm'), isDay: false });
			}
		}
		return ticks;
	}

	// ─── Rendering ──────────────────────────────────────────────────────────────

	function tickDecimals(step: number): number {
		if (step >= 1) return 0;
		return Math.min(3, Math.max(0, Math.ceil(-Math.log10(step))));
	}

	function draw(): void {
		if (!canvasEl || !containerEl || width <= 0) return;

		const dpr = window.devicePixelRatio || 1;
		const w = Math.round(width * dpr);
		const h = Math.round(height * dpr);
		if (canvasEl.width !== w) canvasEl.width = w;
		if (canvasEl.height !== h) canvasEl.height = h;

		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);

		if (timestamps.length === 0) return;

		const styles = getComputedStyle(containerEl);
		const cssColor = (name: string, fallback: string): string =>
			styles.getPropertyValue(name).trim() || fallback;
		const textColor = cssColor('--muted-foreground', '#6b7280');
		const strongColor = cssColor('--foreground', '#374151');
		const gridColor = cssColor('--border', 'rgba(0, 0, 0, 0.1)');
		const bgColor = cssColor('--card', '#ffffff');
		const dark = document.documentElement.classList.contains('dark');
		// halo matches the background (white in light mode, dark in dark mode) so a
		// line reads clearly where it crosses others
		const outlineColor = bgColor;

		const plotRight = padLeft + plotW;
		const plotBottom = padTop + plotH;
		const font = '11px system-ui, sans-serif';

		// Daylight bands (kept subtle so they don't compete with the data)
		ctx.fillStyle = CHART_COLORS.daylight;
		ctx.globalAlpha = 0.65;
		for (const band of bands) {
			if (band.end < viewStart || band.start > viewEnd) continue;
			const x1 = Math.max(padLeft, xPix(band.start));
			const x2 = Math.min(plotRight, xPix(band.end));
			if (x2 > x1) ctx.fillRect(x1, padTop, x2 - x1, plotH);
		}
		ctx.globalAlpha = 1;

		// Selected-day highlight: soft tint + dashed edge lines
		if (highlight && highlight.end > viewStart && highlight.start < viewEnd) {
			const accent = cssColor('--primary', '#e08a3c');
			const x1 = Math.max(padLeft, xPix(highlight.start));
			const x2 = Math.min(plotRight, xPix(highlight.end));
			if (x2 > x1) {
				ctx.save();
				ctx.globalAlpha = 0.08;
				ctx.fillStyle = accent;
				ctx.fillRect(x1, padTop, x2 - x1, plotH);
				ctx.globalAlpha = 0.55;
				ctx.strokeStyle = accent;
				ctx.lineWidth = 1.5;
				ctx.setLineDash([5, 4]);
				ctx.beginPath();
				for (const edge of [highlight.start, highlight.end]) {
					const x = xPix(edge);
					if (x >= padLeft && x <= plotRight) {
						ctx.moveTo(x, padTop);
						ctx.lineTo(x, plotBottom);
					}
				}
				ctx.stroke();
				ctx.restore();
			}
		}

		// Horizontal grid lines + left axis labels
		ctx.font = font;
		ctx.textAlign = 'right';
		ctx.textBaseline = 'middle';
		const leftTicks =
			yTicks ??
			Array.from(
				{ length: Math.floor((leftScale.max - firstTick(leftScale)) / leftScale.step) + 1 },
				(_, i) => firstTick(leftScale) + i * leftScale.step
			);
		for (const v of leftTicks) {
			const y = yPix(v, 'left');
			ctx.strokeStyle = gridColor;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(padLeft, y);
			ctx.lineTo(plotRight, y);
			ctx.stroke();
			ctx.fillStyle = textColor;
			ctx.fillText(
				compactYAxis
					? v.toFixed(tickDecimals(leftScale.step))
					: (yTickFormat?.(v) ?? v.toFixed(tickDecimals(leftScale.step))),
				padLeft - 8,
				y
			);
		}

		// Right axis labels in the gutter (desktop only). On mobile there is no
		// gutter — the labels are drawn on top of the graph with halos after the
		// series (see drawOverlaidAxisLabels below), so the data can't cover them.
		if (hasRightAxis && unitRight !== undefined && !isNarrow) {
			ctx.textAlign = 'left';
			ctx.fillStyle = textColor;
			for (
				let v = firstTick(rightScale);
				v <= rightScale.max + rightScale.step / 2;
				v += rightScale.step
			) {
				ctx.fillText(v.toFixed(tickDecimals(rightScale.step)), plotRight + 8, yPix(v, 'right'));
			}
		}

		// X axis ticks: midnight gridlines + time labels
		ctx.textBaseline = 'top';
		for (const tick of computeXTicks()) {
			const x = xPix(tick.t);
			if (tick.isDay) {
				ctx.strokeStyle = gridColor;
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(x, padTop);
				ctx.lineTo(x, plotBottom);
				ctx.stroke();
				ctx.font = 'bold 11px system-ui, sans-serif';
				ctx.fillStyle = strongColor;
			} else {
				ctx.strokeStyle = gridColor;
				ctx.beginPath();
				ctx.moveTo(x, plotBottom);
				ctx.lineTo(x, plotBottom + 4);
				ctx.stroke();
				ctx.font = font;
				ctx.fillStyle = textColor;
			}
			ctx.textAlign = 'center';
			ctx.fillText(tick.label, x, plotBottom + agreementStripOffset + 7);
		}

		// Series (clipped to the plot area)
		ctx.save();
		ctx.beginPath();
		ctx.rect(padLeft, padTop, plotW, plotH);
		ctx.clip();

		const interval = timestamps.length > 1 ? timestamps[1] - timestamps[0] : HOUR;

		// Cloud bands: cover drives how far the band reaches into its slot, traced
		// as a monotone-interpolated curve so the silhouette flows instead of
		// stepping hour to hour. Both gradients run from near-transparent at the
		// anchor to solid at full cover, so a 10% sky barely registers while an
		// overcast one is unmistakable.
		//
		//  * total cover hangs from the top of the plot
		//  * high / mid / low each grow symmetrically out of their slot's centre
		//    line, stacked in the order the layers actually sit in the sky
		for (const s of cloudBandSeries) {
			const slotTop = padTop + cloudSlotOffset(s);
			const layered = s.cloudLayer != null;
			const slotH = layered ? CLOUD_LAYER_H : CLOUD_BAND_MAX;
			const centre = slotTop + slotH / 2;

			// Samples just outside the viewport are kept so the curve enters and
			// leaves the plot at the right slope.
			const xs: number[] = [];
			const covers: number[] = [];
			for (let i = 0; i < timestamps.length; i++) {
				const t = timestamps[i];
				if (t < viewStart - interval * 2 || t > viewEnd + interval * 2) continue;
				const v = s.data[i];
				xs.push(xPix(t));
				covers.push(
					v === null || v === undefined || !isFinite(v) ? 0 : Math.min(100, Math.max(0, v))
				);
			}
			if (xs.length < 2) continue;

			const smoothed = smoothCover(covers);
			const top: Array<[number, number]> = [];
			const bottom: Array<[number, number]> = [];
			for (let i = 0; i < xs.length; i++) {
				const frac = smoothed[i] / 100;
				if (layered) {
					const half = frac * (slotH / 2);
					top.push([xs[i], centre - half]);
					bottom.push([xs[i], centre + half]);
				} else {
					top.push([xs[i], slotTop]);
					bottom.push([xs[i], slotTop + frac * slotH]);
				}
			}

			// The gradient runs ALONG the series rather than top-to-bottom: every
			// sample contributes a stop at its own x, so the band's density tracks
			// the cover itself - a clear spell dissolves, an overcast one goes
			// solid - and the fade always lines up with the silhouette above it.
			const first = xs[0];
			const span = xs[xs.length - 1] - first || 1;
			const base = layered ? 0.08 : 0.05;
			const peak = layered ? 0.92 : 0.68;
			// Total cover ramps up late: a broken sky stays nearly clear on the
			// plot and the density only really builds as it closes over.
			const curve = layered ? 1 : 2.2;
			const fill = ctx.createLinearGradient(first, 0, xs[xs.length - 1], 0);
			// The edge follows the same values but starts later still: below a
			// fifth of the sky there is no silhouette to draw at all.
			const EDGE_FLOOR = 20;
			const edge = layered ? null : ctx.createLinearGradient(first, 0, xs[xs.length - 1], 0);
			for (let i = 0; i < xs.length; i++) {
				const pos = Math.max(0, Math.min(1, (xs[i] - first) / span));
				const cover = smoothed[i];
				fill.addColorStop(
					pos,
					withAlpha(s.color, base + (peak - base) * Math.pow(cover / 100, curve))
				);
				if (edge) {
					const above = Math.max(0, (cover - EDGE_FLOOR) / (100 - EDGE_FLOOR));
					edge.addColorStop(pos, withAlpha(s.color, 0.85 * Math.pow(above, 1.6)));
				}
			}

			ctx.save();
			ctx.beginPath();
			traceMonotone(ctx, bottom);
			if (layered) {
				// back along the mirrored upper edge
				ctx.lineTo(top[top.length - 1][0], top[top.length - 1][1]);
				traceMonotone(ctx, [...top].reverse(), true);
			} else {
				ctx.lineTo(bottom[bottom.length - 1][0], slotTop);
				ctx.lineTo(bottom[0][0], slotTop);
			}
			ctx.closePath();
			ctx.fillStyle = fill;
			ctx.fill();

			// The layers are gradient only - an outline would fight the soft mass
			// they are meant to look like.
			if (edge) {
				ctx.beginPath();
				traceMonotone(ctx, bottom);
				ctx.strokeStyle = edge;
				ctx.lineWidth = 1.25;
				ctx.lineJoin = 'round';
				ctx.stroke();
			}
			ctx.restore();
		}

		const barSeries = plottedSeries.filter((s) => s.type === 'bar');
		const slot = plotW / ((viewEnd - viewStart) / interval);
		const barWidth = Math.min(8, Math.max(1, (slot * 0.7) / Math.max(1, barSeries.length)));

		for (const s of plottedSeries) {
			const axis = s.axis ?? 'left';
			const baseline = Math.min(plotBottom, Math.max(padTop, yPix(0, axis)));

			if (s.type === 'bar') {
				const bi = barSeries.indexOf(s);
				const groupOffset = (barSeries.length * barWidth) / 2 - bi * barWidth;
				ctx.fillStyle = s.color;
				for (let i = 0; i < timestamps.length; i++) {
					const v = s.data[i];
					if (v === null || v === undefined || !isFinite(v)) continue;
					const t = timestamps[i];
					if (t < viewStart - interval || t > viewEnd + interval) continue;
					const x = xPix(t) - groupOffset;
					const y = yPix(v, axis);
					ctx.fillRect(x, Math.min(y, baseline), barWidth, Math.abs(baseline - y) || 1);
				}
				continue;
			}

			if (s.type === 'point') {
				const radius = s.pointRadius ?? 3;
				ctx.fillStyle = s.color;
				ctx.strokeStyle = outlineColor;
				ctx.lineWidth = 1;
				for (let i = 0; i < timestamps.length; i++) {
					const v = s.data[i];
					if (v === null || v === undefined || !isFinite(v)) continue;
					const t = timestamps[i];
					if (t < viewStart || t > viewEnd) continue;
					ctx.beginPath();
					ctx.arc(xPix(t), yPix(v, axis), radius, 0, Math.PI * 2);
					ctx.fill();
					ctx.stroke();
				}
				continue;
			}

			// Line series: draw fill and stroke per contiguous non-null run
			// (points outside the view are handled by the clip rect). Each point
			// is [x, y, yBand, sourceIndex] — yBand only used when s.bandTo is set.
			const runs: Array<Array<[number, number, number, number]>> = [];
			let run: Array<[number, number, number, number]> = [];
			for (let i = 0; i < timestamps.length; i++) {
				const v = s.data[i];
				const b = s.bandTo?.[i];
				const bandInvalid = s.bandTo != null && (b === null || b === undefined || !isFinite(b));
				if (v === null || v === undefined || !isFinite(v) || bandInvalid) {
					if (run.length > 0) runs.push(run);
					run = [];
					continue;
				}
				run.push([xPix(timestamps[i]), yPix(v, axis), s.bandTo ? yPix(b as number, axis) : 0, i]);
			}
			if (run.length > 0) runs.push(run);

			for (const points of runs) {
				if (points.length === 0) continue;

				if (s.gradientFill && points.length > 1) {
					// Coloured fill anchored at the curve, fading out towards zero: down
					// for positive values, up for all-negative values. Full opacity near
					// the far-from-zero extreme, fading ~30px past the near-zero extreme.
					let minV = Infinity;
					let maxV = -Infinity;
					for (const p of points) {
						const val = s.data[p[3]] as number;
						if (val < minV) minV = val;
						if (val > maxV) maxV = val;
					}
					const goUp = maxV <= 0; // all non-positive → fill toward zero (upward)
					const maxYp = yPix(maxV, axis);
					const minYp = yPix(minV, axis);
					// anchor = opaque end (far-from-zero extreme); fade = transparent end
					const anchorY = goUp ? minYp : maxYp;
					const nearY = goUp ? maxYp : minYp;
					// fade runs a good stretch past the near extreme, flowing most of the
					// way to the plot edge (~78% of the way there)
					const fadeY = goUp
						? Math.max(padTop, maxYp - (maxYp - padTop) * 0.78)
						: Math.min(plotBottom, minYp + (plotBottom - minYp) * 0.78);
					const anchorV = goUp ? minV : maxV;
					const nearV = goUp ? maxV : minV;
					const span = fadeY - anchorY;
					// begin the fade a touch (~10px) BEFORE the near-zero extreme
					const fadeStartY = nearY - Math.sign(nearY - anchorY) * 10;
					const fadeStart =
						span !== 0 ? Math.max(0, Math.min(0.95, (fadeStartY - anchorY) / span)) : 0.6;
					const colorFn = s.segmentColor ?? (() => s.color);
					const FULL = 0.8;
					const grad = ctx.createLinearGradient(0, anchorY, 0, fadeY);
					// full colour from the curve down to just before the near extreme…
					const STOPS = 6;
					for (let k = 0; k <= STOPS; k++) {
						const t = k / STOPS;
						const val = anchorV + t * (nearV - anchorV);
						grad.addColorStop(t * fadeStart, withAlpha(colorFn(val, 0), FULL));
					}
					// …then a long, gentle fade out to the plot edge
					grad.addColorStop(fadeStart, withAlpha(colorFn(nearV, 0), FULL));
					grad.addColorStop(1, withAlpha(colorFn(nearV, 0), 0));

					ctx.beginPath();
					ctx.moveTo(points[0][0], points[0][1]);
					for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
					ctx.lineTo(points[points.length - 1][0], fadeY);
					ctx.lineTo(points[0][0], fadeY);
					ctx.closePath();
					ctx.fillStyle = grad;
					// the bright temperature colours glow over a dark background, so
					// knock the whole fill back to 75% in dark mode
					ctx.globalAlpha = dark ? 0.75 : 1;
					ctx.fill();
					ctx.globalAlpha = 1;
				}

				if (s.fill && points.length > 1) {
					ctx.beginPath();
					ctx.moveTo(points[0][0], points[0][1]);
					for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
					if (s.bandTo) {
						// close the polygon along the second line, walked backwards
						for (let i = points.length - 1; i >= 0; i--) ctx.lineTo(points[i][0], points[i][2]);
					} else {
						ctx.lineTo(points[points.length - 1][0], baseline);
						ctx.lineTo(points[0][0], baseline);
					}
					ctx.closePath();
					ctx.globalAlpha = s.fillOpacity ?? 0.15;
					ctx.fillStyle = s.color;
					ctx.fill();
					ctx.globalAlpha = 1;
				}

				const lineWidth = s.width ?? 2;
				if (lineWidth > 0) {
					ctx.lineJoin = 'round';
					ctx.lineCap = 'round';
					ctx.setLineDash(s.dashed ? [8, 8] : []);

					// Contrasting halo drawn under the line so a multi-colour line
					// stays legible over any background.
					if (s.outline && points.length > 1) {
						ctx.strokeStyle = outlineColor;
						ctx.lineWidth = lineWidth + 2.5;
						ctx.beginPath();
						ctx.moveTo(points[0][0], points[0][1]);
						for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
						ctx.stroke();
					}

					ctx.lineWidth = lineWidth;
					if (s.segmentColor && !s.foregroundLine) {
						// Colour each segment by its value (temperature colour scale).
						// `idx[i]` maps a run point back to its source data index.
						for (let i = 1; i < points.length; i++) {
							const v = s.data[points[i][3]];
							ctx.strokeStyle = s.segmentColor(v as number, points[i][3]);
							ctx.beginPath();
							ctx.moveTo(points[i - 1][0], points[i - 1][1]);
							ctx.lineTo(points[i][0], points[i][1]);
							ctx.stroke();
						}
					} else if (s.foregroundLine) {
						// Foreground line drawn on top of its own fill. Stroke the whole
						// path once with a horizontal gradient sampled from the value
						// colour scale, so the colour flows smoothly along the line
						// instead of stepping at each data point.
						ctx.beginPath();
						ctx.moveTo(points[0][0], points[0][1]);
						for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
						if (s.segmentColor && points.length > 1) {
							const x0 = points[0][0];
							const x1 = points[points.length - 1][0];
							const span = x1 - x0 || 1;
							const grad = ctx.createLinearGradient(x0, 0, x1, 0);
							let prevT = -1;
							for (let i = 0; i < points.length; i++) {
								let t = (points[i][0] - x0) / span;
								t = t < 0 ? 0 : t > 1 ? 1 : t;
								if (t <= prevT) t = prevT + 1e-6; // keep stops strictly increasing
								if (t > 1) t = 1;
								prevT = t;
								// exact same colour as the fill so the line and gradient match
								grad.addColorStop(t, s.segmentColor(s.data[points[i][3]] as number, points[i][3]));
							}
							ctx.strokeStyle = grad;
						} else {
							ctx.strokeStyle = strongColor;
						}
						// keep the line crisp (full opacity) as a clean edge; only the
						// large fill area is dimmed in dark mode
						ctx.stroke();
					} else {
						ctx.beginPath();
						ctx.moveTo(points[0][0], points[0][1]);
						for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
						ctx.strokeStyle = s.color;
						ctx.stroke();
					}
					ctx.setLineDash([]);
				}
			}

			// Local minima / maxima value labels
			if (s.labelExtrema) {
				const fmt = s.labelFormat ?? ((v: number) => v.toFixed(0));
				ctx.font = 'bold 11px system-ui, sans-serif';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'alphabetic';
				ctx.lineWidth = 3;
				ctx.strokeStyle = bgColor;
				ctx.fillStyle = strongColor;
				// clear the (possibly thick) line + its outline before the text sits
				const off = (s.width ?? 2) / 2 + 7;
				for (const ext of findExtrema(s.data)) {
					const t = timestamps[ext.i];
					if (t < viewStart || t > viewEnd) continue;
					const v = s.data[ext.i] as number;
					const x = xPix(t);
					const y = yPix(v, axis);
					const label = fmt(v);
					// keep the label inside the plot vertically (never under the icon
					// band above or clipped at the bottom)
					const ly = Math.max(
						padTop + 11,
						Math.min(plotBottom - 3, ext.type === 'max' ? y - off : y + off + 8)
					);
					// keep the centred label fully inside the plot so it never clips
					const halfW = ctx.measureText(label).width / 2 + 2;
					const lx = Math.max(padLeft + halfW, Math.min(plotRight - halfW, x));
					ctx.strokeText(label, lx, ly);
					ctx.fillText(label, lx, ly);
				}
			}
		}

		// Mobile: right-axis labels overlaid on top of the data with a halo (no
		// gutter is reserved on narrow screens, so the graph runs full width).
		if (isNarrow && hasRightAxis && unitRight !== undefined) {
			ctx.font = font;
			ctx.textAlign = 'right';
			ctx.textBaseline = 'middle';
			ctx.lineWidth = 3;
			ctx.lineJoin = 'round';
			for (
				let v = firstTick(rightScale);
				v <= rightScale.max + rightScale.step / 2;
				v += rightScale.step
			) {
				const y = yPix(v, 'right');
				const label = v.toFixed(tickDecimals(rightScale.step));
				ctx.strokeStyle = bgColor;
				ctx.strokeText(label, plotRight - 2, y);
				ctx.fillStyle = textColor;
				ctx.fillText(label, plotRight - 2, y);
			}
		}

		// Current time marker. Reading the shared clock (rather than Date.now())
		// makes the enclosing draw effect re-run every minute, so the line moves.
		if (showNow) {
			const now = clock.current.getTime() / 1000;
			if (now >= viewStart && now <= viewEnd) {
				const x = xPix(now);
				ctx.strokeStyle = CHART_COLORS.currentTimeLine;
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(x, padTop);
				ctx.lineTo(x, plotBottom);
				ctx.stroke();
			}
		}

		ctx.restore();

		if (agreementStrip) {
			const stripTop = plotBottom + AGREEMENT_STRIP_GAP;
			ctx.save();
			ctx.beginPath();
			ctx.rect(padLeft, stripTop, plotW, AGREEMENT_STRIP_HEIGHT);
			ctx.clip();
			for (let index = 0; index < timestamps.length; index++) {
				const point = agreementStrip.points[index];
				if (!point || point.availableCount === 0) continue;
				const time = timestamps[index];
				if (time < viewStart - interval || time > viewEnd + interval) continue;
				const left = Math.max(padLeft, xPix(time - interval / 2));
				const right = Math.min(plotRight, xPix(time + interval / 2));
				if (right <= left) continue;
				ctx.fillStyle = agreementFillColor(point, textColor);
				ctx.fillRect(left, stripTop, Math.max(1, right - left + 0.5), AGREEMENT_STRIP_HEIGHT);
			}
			ctx.restore();

			ctx.strokeStyle = withAlpha(gridColor, 0.8);
			ctx.lineWidth = 1;
			ctx.strokeRect(padLeft, stripTop + 0.5, plotW, AGREEMENT_STRIP_HEIGHT - 1);
			if (!compactYAxis) {
				ctx.fillStyle = textColor;
				ctx.font = '600 9px system-ui, sans-serif';
				ctx.textAlign = 'right';
				ctx.textBaseline = 'middle';
				ctx.fillText(
					agreementStrip.label,
					padLeft - 6,
					stripTop + AGREEMENT_STRIP_HEIGHT / 2,
					Math.max(24, padLeft - 10)
				);
			}
		}

		// Axis unit labels
		ctx.font = font;
		ctx.textBaseline = 'alphabetic';
		if (unit) {
			ctx.textAlign = 'right';
			ctx.fillStyle = textColor;
			ctx.fillText(unit, padLeft - 4, padTop - 8);
		}
		if (hasRightAxis && unitRight) {
			if (isNarrow) {
				// overlaid inside the plot's top-right corner (no right gutter) with a halo
				ctx.textAlign = 'right';
				ctx.lineWidth = 3;
				ctx.lineJoin = 'round';
				ctx.strokeStyle = bgColor;
				ctx.strokeText(unitRight, plotRight - 2, padTop - 8);
				ctx.fillStyle = textColor;
				ctx.fillText(unitRight, plotRight - 2, padTop - 8);
			} else {
				ctx.textAlign = 'left';
				ctx.fillStyle = textColor;
				ctx.fillText(unitRight, plotRight + 4, padTop - 8);
			}
		}

		// Title / subtitle
		if (title) {
			ctx.textAlign = 'left';
			ctx.font = '16px system-ui, sans-serif';
			ctx.fillStyle = strongColor;
			ctx.fillText(title, 4, 20);
			if (subtitle) {
				ctx.font = '12px system-ui, sans-serif';
				ctx.fillStyle = textColor;
				ctx.fillText(subtitle, 4, 38);
			}
		}

		// Credit is a DOM overlay (below) so its two sources can be links; the
		// export path redraws it onto the exported canvas in getExportImage().
	}

	$effect(() => {
		// themeVersion is a manual dependency: it bumps when the document theme
		// class changes so colors are re-read from CSS custom properties.
		void themeVersion;
		draw();
	});

	// ─── Lifecycle: resize + theme observers ────────────────────────────────────

	onMount(() => {
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				width = entry.contentRect.width;
			}
		});
		if (containerEl) resizeObserver.observe(containerEl);

		const themeObserver = new MutationObserver(() => {
			themeVersion++;
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'data-theme']
		});

		return () => {
			resizeObserver.disconnect();
			themeObserver.disconnect();
		};
	});

	// ─── Interaction ────────────────────────────────────────────────────────────

	// Listeners are attached programmatically (not via template attributes) so the
	// wheel handler can be registered as non-passive.
	$effect(() => {
		const el = canvasEl;
		if (!el) return;

		// Plain interaction bookkeeping (not reactive state)
		const pointers = new SvelteMap<number, { x: number; y: number }>();
		let panStart: { x: number; start: number; end: number } | null = null;
		let pinchStart: { dist: number; start: number; end: number } | null = null;
		// Touch gesture intent. On touch we defer pointer capture until we know
		// the finger is moving horizontally; a vertical drag is left to the page
		// so the meteograms don't hijack scrolling (and don't flash the tooltip).
		let gesture: 'none' | 'scroll' | 'inspect' | 'pan' | 'pinch' | 'select' = 'none';
		let touchStart: { x: number; y: number; start: number; end: number } | null = null;
		let selStartX = 0; // drag-to-zoom anchor (canvas-local px)
		let hoverFrame = 0;
		let queuedClientX = 0;
		let queuedHoverAction: 'none' | 'position' | 'clear' = 'none';

		const localX = (e: { clientX: number }): number => e.clientX - el.getBoundingClientRect().left;
		const clampPlotX = (x: number): number => Math.max(padLeft, Math.min(width - padRight, x));

		const scheduleHoverFrame = (): void => {
			if (hoverFrame !== 0) return;
			hoverFrame = requestAnimationFrame(() => {
				hoverFrame = 0;
				const action = queuedHoverAction;
				queuedHoverAction = 'none';
				if (action === 'clear') {
					setHover(null);
					return;
				}
				if (action !== 'position') return;

				// Geometry reads and timestamp lookup happen once per animation frame,
				// even when a high-polling pointer emits many events between frames.
				const t = pixToTime(queuedClientX - el.getBoundingClientRect().left);
				const time =
					t >= viewStart && t <= viewEnd && timestamps.length > 0
						? timestamps[nearestIndex(timestamps, t)]
						: null;
				setHover(time);
			});
		};

		const scheduleHoverPosition = (clientX: number): void => {
			if (announceHover) announceHover = false;
			queuedClientX = clientX;
			queuedHoverAction = 'position';
			scheduleHoverFrame();
		};

		const scheduleHoverClear = (): void => {
			if (announceHover) announceHover = false;
			queuedHoverAction = 'clear';
			scheduleHoverFrame();
		};

		const onPointerDown = (e: PointerEvent): void => {
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

			if (pointers.size === 2) {
				el.setPointerCapture(e.pointerId);
				const [a, b] = [...pointers.values()];
				pinchStart = { dist: Math.max(10, Math.abs(a.x - b.x)), start: viewStart, end: viewEnd };
				panStart = null;
				gesture = 'pinch';
				scheduleHoverClear();
				return;
			}

			if (e.pointerType === 'mouse') {
				// Mouse: click-drag selects a range to zoom into.
				el.setPointerCapture(e.pointerId);
				selStartX = clampPlotX(localX(e));
				dragSelect = null;
				panStart = null;
				pinchStart = null;
				gesture = 'select';
			} else {
				// Touch: wait for the first move to reveal scroll vs inspect intent.
				touchStart = { x: e.clientX, y: e.clientY, start: viewStart, end: viewEnd };
				gesture = 'none';
			}
		};

		const onPointerMove = (e: PointerEvent): void => {
			if (pointers.has(e.pointerId)) {
				pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			}

			if (gesture === 'pinch' && pointers.size === 2) {
				const [a, b] = [...pointers.values()];
				const dist = Math.max(10, Math.abs(a.x - b.x));
				const scale = pinchStart!.dist / dist;
				const span = pinchStart!.end - pinchStart!.start;
				const center = (pinchStart!.start + pinchStart!.end) / 2;
				const newSpan = span * scale;
				applyRange(center - newSpan / 2, center + newSpan / 2);
				return;
			}

			// Mouse drag-to-zoom: track the selection rectangle
			if (gesture === 'select' && e.pointerType === 'mouse' && pointers.size === 1) {
				const x = clampPlotX(localX(e));
				if (dragSelect || Math.abs(x - selStartX) >= 3) {
					dragSelect = { x0: selStartX, x1: x };
					scheduleHoverClear();
				}
				return;
			}

			// Resolve touch intent from the initial drag direction
			if (e.pointerType !== 'mouse' && gesture === 'none' && touchStart && pointers.size === 1) {
				const dx = Math.abs(e.clientX - touchStart.x);
				const dy = Math.abs(e.clientY - touchStart.y);
				if (dx < 6 && dy < 6) return;
				if (dy > dx) {
					// Vertical: let the page scroll, never capture or hover
					gesture = 'scroll';
					return;
				}
				gesture = zoomed ? 'pan' : 'inspect';
				el.setPointerCapture(e.pointerId);
				if (gesture === 'pan') {
					panStart = { x: e.clientX, start: touchStart.start, end: touchStart.end };
				}
			}

			if (gesture === 'scroll') return;

			if (gesture === 'pan' && panStart && pointers.size === 1 && zoomed) {
				const dt = ((panStart.x - e.clientX) / plotW) * (panStart.end - panStart.start);
				applyRange(panStart.start + dt, panStart.end + dt);
				return;
			}

			if (pointers.size <= 1) scheduleHoverPosition(e.clientX);
		};

		const onPointerUp = (e: PointerEvent): void => {
			// Commit a mouse drag-to-zoom selection (if it spans a real range).
			if (gesture === 'select' && e.pointerType === 'mouse' && dragSelect) {
				const a = pixToTime(dragSelect.x0);
				const b = pixToTime(dragSelect.x1);
				if (Math.abs(a - b) > 0) applyRange(Math.min(a, b), Math.max(a, b));
			}
			dragSelect = null;

			pointers.delete(e.pointerId);
			if (pointers.size < 2) pinchStart = null;
			if (pointers.size < 1) {
				panStart = null;
				touchStart = null;
				gesture = 'none';
			}
			if (e.pointerType !== 'mouse') scheduleHoverClear();
		};

		const onPointerLeave = (): void => {
			if (pointers.size === 0) scheduleHoverClear();
		};

		const onWheel = (e: WheelEvent): void => {
			// Zoom only while Ctrl (or ⌘) is held — a plain scroll should keep
			// scrolling the page. Trackpad pinch also arrives as ctrlKey wheel.
			if (!e.ctrlKey && !e.metaKey) {
				return;
			}
			e.preventDefault();
			const t = pixToTime(localX(e));
			zoomAt(t, e.deltaY < 0 ? 1 / 1.3 : 1.3);
		};

		const onDblClick = (): void => {
			setViewRange(null);
		};

		el.addEventListener('pointerdown', onPointerDown);
		el.addEventListener('pointermove', onPointerMove);
		el.addEventListener('pointerup', onPointerUp);
		el.addEventListener('pointercancel', onPointerUp);
		el.addEventListener('pointerleave', onPointerLeave);
		el.addEventListener('wheel', onWheel, { passive: false });
		el.addEventListener('dblclick', onDblClick);

		return () => {
			el.removeEventListener('pointerdown', onPointerDown);
			el.removeEventListener('pointermove', onPointerMove);
			el.removeEventListener('pointerup', onPointerUp);
			el.removeEventListener('pointercancel', onPointerUp);
			el.removeEventListener('pointerleave', onPointerLeave);
			el.removeEventListener('wheel', onWheel);
			el.removeEventListener('dblclick', onDblClick);
			if (hoverFrame !== 0) cancelAnimationFrame(hoverFrame);
		};
	});

	function toggleSeries(name: string): void {
		if (legendHidden.has(name)) legendHidden.delete(name);
		else legendHidden.add(name);
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (timestamps.length === 0) return;
		const current = hoverTime ?? viewStart;
		const index = nearestIndex(timestamps, current);
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			const delta = event.key === 'ArrowLeft' ? -1 : 1;
			const next = Math.max(0, Math.min(timestamps.length - 1, index + delta));
			announceHover = true;
			setHover(timestamps[next]);
			event.preventDefault();
		} else if (event.key === '+' || event.key === '=') {
			zoomAt(current, 1 / 1.3);
			event.preventDefault();
		} else if (event.key === '-' || event.key === '_') {
			zoomAt(current, 1.3);
			event.preventDefault();
		} else if (event.key === 'Escape') {
			announceHover = false;
			setViewRange(null);
			setHover(null);
		}
	}
</script>

<div bind:this={containerEl} class="relative w-full select-none {className}">
	<div class="relative">
		<canvas
			bind:this={canvasEl}
			class="block w-full"
			style:height="{height}px"
			style:touch-action="pan-y"
			tabindex="0"
			aria-label={ariaLabel}
			onkeydown={handleKeydown}
		></canvas>
		<p class="sr-only" aria-live="polite">
			{#if announceHover && tooltipVisible}
				{formatZoned(new Date(timestamps[hoverIdx] * 1000), timezone, 'EEE d MMM HH:mm')}:
				{tooltipRows.map((row) => `${row.name} ${row.value}`).join(', ')}
			{/if}
		</p>

		<!-- Drag-to-zoom selection rectangle -->
		{#if dragSelect}
			<div
				class="pointer-events-none absolute z-20 border-x-2 border-primary/70 bg-primary/15"
				style:left="{Math.min(dragSelect.x0, dragSelect.x1)}px"
				style:top="{padTop}px"
				style:width="{Math.abs(dragSelect.x1 - dragSelect.x0)}px"
				style:height="{plotH + agreementStripOffset}px"
			></div>
		{/if}

		<!-- Weather pictograms: a bordered band across the top of the plot -->
		{#if visiblePictograms.length > 0}
			<div
				class="pointer-events-none absolute z-10 overflow-hidden rounded-t-lg border border-border/60 bg-muted/30"
				style:left="{iconBandLeft}px"
				style:top="{pictoRowTop}px"
				style:width="{iconBandWidth}px"
				style:height="{ICON_BAND_H}px"
			>
				{#each visiblePictograms as p (p.x)}
					{@const cx = Math.max(ICON_EDGE, Math.min(iconBandWidth - ICON_EDGE, p.x))}
					<svg
						class="absolute top-1/2 -translate-y-1/2 fill-foreground"
						width={ICON_PX}
						height={ICON_PX}
						style:left="{cx - ICON_PX / 2}px"
					>
						<use xlink:href="/images/weather-icons/{p.icon}.svg#Layer_1"></use>
					</svg>
				{/each}
			</div>
		{/if}

		<!-- Wind-direction arrows: a matching band -->
		{#if visibleWindArrows.length > 0}
			<div
				class="pointer-events-none absolute z-10 overflow-hidden rounded-t-lg border border-border/60 bg-muted/30"
				style:left="{iconBandLeft}px"
				style:top="{windRowTop}px"
				style:width="{iconBandWidth}px"
				style:height="{ICON_BAND_H}px"
			>
				{#each visibleWindArrows as a (a.x)}
					{@const cx = Math.max(ICON_EDGE, Math.min(iconBandWidth - ICON_EDGE, a.x))}
					<span
						class="absolute top-1/2 inline-flex items-center justify-center"
						style:width="{ARROW_PX}px"
						style:height="{ARROW_PX}px"
						style:left="{cx - ARROW_PX / 2}px"
						style:transform="translateY(-50%) rotate({a.deg}deg)"
					>
						<svg class="fill-foreground/80" width={ARROW_PX} height={ARROW_PX}>
							<use xlink:href="/images/weather-icons/wi-direction-down.svg#Layer_1"></use>
						</svg>
					</span>
				{/each}
			</div>
		{/if}

		<!-- Hover is intentionally a DOM overlay: moving the crosshair must not
			     repaint the expensive base canvas or every synchronized chart. -->
		{#if crosshairVisible}
			<div
				class="pointer-events-none absolute left-0 z-[15] border-l border-dashed border-muted-foreground/70 will-change-transform"
				style:transform="translateX({tooltipX}px)"
				style:top="{padTop}px"
				style:height="{plotH + agreementStripOffset}px"
			></div>
		{/if}

		{#if tooltipVisible}
			<div
				class="pointer-events-none absolute z-20 rounded-md border border-border bg-popover px-3 py-2 text-xs whitespace-nowrap text-popover-foreground shadow-md"
				style:top="{padTop + 8}px"
				style:left="{tooltipFlip ? tooltipX - 12 : tooltipX + 12}px"
				style:transform={tooltipFlip ? 'translateX(-100%)' : ''}
			>
				<div class="mb-1 font-semibold">
					{formatZoned(new Date(timestamps[hoverIdx] * 1000), timezone, 'EEE d MMM HH:mm')}
				</div>
				{#each tooltipRows as row (row.name)}
					<div class="flex items-center gap-1.5">
						<span
							class="inline-block h-2 w-2 shrink-0 rounded-full"
							style:background-color={row.color}
						></span>
						<span>{row.name}:</span>
						<span class="ml-auto pl-2 font-semibold">{row.value}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Legend sits below the graph -->
	{#if showLegend && series.length > 0}
		<div
			class="mt-0.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 px-1 md:mt-1.5 md:gap-y-1"
		>
			{#each series.filter((s) => s.showInLegend !== false) as s (s.name)}
				<button
					type="button"
					class="flex cursor-pointer items-center gap-1.5 text-xs transition-opacity {legendHidden.has(
						s.name
					)
						? 'opacity-40'
						: ''}"
					onclick={() => toggleSeries(s.name)}
					title={m.chart_toggle_series({ series: s.name })}
				>
					<span
						class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
						style:background-color={s.color}
					></span>
					<span class="text-muted-foreground"
						>{width > 0 && width < 520 ? (s.shortName ?? s.name) : s.name}</span
					>
				</button>
			{/each}
		</div>
	{/if}

	<!-- Credit: below the legend, in the bottom-right corner, with linked sources -->
	{#if showCredit}
		<div
			class="px-2 pt-2 pb-1 text-center md:text-right text-[10px] leading-none text-muted-foreground/70"
		>
			{m.footer_data_by()}
			<a
				class="font-medium underline-offset-2 hover:text-foreground hover:underline"
				href="https://open-meteo.com"
				target="_blank"
				rel="noopener noreferrer">Open-Meteo</a
			>, {m.chart_credit_viz()}
			<a
				class="font-medium underline-offset-2 hover:text-foreground hover:underline"
				href="https://drizz.li"
				target="_blank"
				rel="noopener noreferrer">Drizz.li</a
			>
		</div>
	{/if}
</div>
