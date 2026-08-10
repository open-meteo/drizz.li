<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import { formatZoned } from '$lib/utils/date';

	import {
		groupHover,
		groupRange,
		registerGroupMember,
		setGroupHover,
		setGroupRange
	} from '$lib/charts';
	import * as m from '$lib/paraglide/messages';

	import { getWeatherIconName, hasWeatherIcon } from '../../utils/weather-codes';
	import { modelColor, modelLabel } from './comparison';

	import type { ModelSeriesData } from '$lib/services/weather';

	interface Props {
		timestamps: number[];
		models: ModelSeriesData[];
		modelOrder: string[];
		sunrise: number[];
		sunset: number[];
		timezone: string;
		group: string;
		plotInsetLeft: number;
		plotInsetRight: number;
		showModelNames: boolean;
		onToggleModelNames: () => void;
		registerExporter?: (exporter: TimelineExporter | null) => void;
	}

	interface TimelineExporter {
		getExportImage(opts?: { title?: string }): Promise<HTMLCanvasElement | null>;
	}

	interface TimelinePoint {
		index: number;
		time: number;
		x: number;
		hour: string;
		date: string;
	}

	interface DaySeparator {
		x: number;
	}

	interface SunlightSegment {
		x1: number;
		x2: number;
	}

	interface TooltipRow {
		modelId: string;
		label: string;
		color: string;
		condition: string;
		cloudCover: number | null;
	}

	let {
		timestamps,
		models,
		modelOrder,
		sunrise,
		sunset,
		timezone,
		group,
		plotInsetLeft,
		plotInsetRight,
		showModelNames,
		onToggleModelNames,
		registerExporter
	}: Props = $props();

	const HOUR = 3600;
	const MIN_SPAN = 2 * HOUR;
	const HEADER_H = 38;
	const ROW_H = 38;
	const FOOTER_H = 5;
	const ICON_SIZE = 20;
	const ICON_BOX_WIDTH = 20;
	const ICON_BOX_HEIGHT = 30;
	const MIN_ICON_GAP = 20;
	const SUNLIGHT_STRIP_H = 4;
	const EXPORT_TITLE_H = 30;
	const SAMPLE_STEPS = [1, 2, 3, 4, 6, 8, 12, 24] as const;

	let containerEl: HTMLDivElement | undefined = $state();
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let width = $state(0);
	let themeVersion = $state(0);
	let dragSelect = $state<{ x0: number; x1: number } | null>(null);
	let screenRenderVersion = 0;

	let timestampsSec = $derived(timestamps.map((timestamp) => timestamp / 1000));
	let displayModels = $derived(
		models.filter((model) => model.variables.weather_code?.some(hasWeatherIcon))
	);
	let sharedRange = $derived(groupRange(group));
	let sharedHover = $derived(groupHover(group));
	let tMin = $derived(timestampsSec[0] ?? 0);
	let tMax = $derived(
		timestampsSec.length > 1 ? timestampsSec[timestampsSec.length - 1] : tMin + HOUR
	);
	let viewStart = $derived(sharedRange ? Math.max(tMin, sharedRange.start) : tMin);
	let viewEnd = $derived(
		sharedRange ? Math.max(viewStart + MIN_SPAN / 2, Math.min(tMax, sharedRange.end)) : tMax
	);
	let zoomed = $derived(sharedRange !== null && viewEnd - viewStart < tMax - tMin);
	let plotWidth = $derived(Math.max(1, width - plotInsetLeft - plotInsetRight));
	let height = $derived(HEADER_H + displayModels.length * ROW_H + FOOTER_H);

	function xForTime(time: number): number {
		return plotInsetLeft + ((time - viewStart) / Math.max(1, viewEnd - viewStart)) * plotWidth;
	}

	function timeForX(x: number): number {
		return viewStart + ((x - plotInsetLeft) / Math.max(1, plotWidth)) * (viewEnd - viewStart);
	}

	function clampPlotX(x: number): number {
		return Math.max(plotInsetLeft, Math.min(width - plotInsetRight, x));
	}

	function applyRange(start: number, end: number): void {
		const fullSpan = tMax - tMin;
		const span = Math.min(Math.max(end - start, MIN_SPAN), fullSpan);
		if (span >= fullSpan) {
			setGroupRange(group, null);
			return;
		}
		const boundedStart = Math.max(tMin, Math.min(start, tMax - span));
		setGroupRange(group, { start: boundedStart, end: boundedStart + span });
	}

	function zoomAt(centerTime: number, factor: number): void {
		const span = viewEnd - viewStart;
		const nextSpan = span * factor;
		const fraction = (centerTime - viewStart) / Math.max(1, span);
		applyRange(centerTime - fraction * nextSpan, centerTime + (1 - fraction) * nextSpan);
	}

	function nearestIndex(values: number[], target: number): number {
		let low = 0;
		let high = values.length - 1;
		while (low < high) {
			const middle = (low + high) >> 1;
			if (values[middle] < target) low = middle + 1;
			else high = middle;
		}
		if (low > 0 && Math.abs(values[low - 1] - target) <= Math.abs(values[low] - target)) {
			return low - 1;
		}
		return low;
	}

	function isDaytime(time: number): boolean {
		for (let i = 0; i < sunrise.length; i++) {
			if (time >= sunrise[i] && time < sunset[i]) return true;
			const nextSunrise = sunrise[i + 1] ?? Infinity;
			if (time >= sunset[i] && time < nextSunrise) return false;
		}
		return sunrise.length === 0 || time >= sunrise[0];
	}

	let sampleStepHours = $derived.by(() => {
		const pixelsPerHour = plotWidth / Math.max(1, (viewEnd - viewStart) / HOUR);
		return SAMPLE_STEPS.find((step) => step * pixelsPerHour >= MIN_ICON_GAP) ?? 24;
	});

	let visiblePoints = $derived.by((): TimelinePoint[] => {
		const points: TimelinePoint[] = [];
		const edgeInset = ICON_SIZE / 2 + 1;
		const firstValidIndex = timestampsSec.findIndex((time) => {
			const x = xForTime(time);
			return time >= viewStart && time <= viewEnd && x >= plotInsetLeft + edgeInset;
		});
		if (firstValidIndex < 0) return points;

		const firstTime = timestampsSec[firstValidIndex];
		const canvasRight = width - edgeInset;
		let previousDay = '';
		for (let index = firstValidIndex; index < timestampsSec.length; index++) {
			const time = timestampsSec[index];
			if (time < viewStart || time > viewEnd) continue;
			const x = xForTime(time);
			if (x > canvasRight) break;
			const hoursFromFirst = Math.round((time - firstTime) / HOUR);
			if (hoursFromFirst % sampleStepHours !== 0) continue;
			const date = new Date(timestamps[index]);
			const day = formatZoned(date, timezone, 'yyyy-MM-dd');
			points.push({
				index,
				time,
				x,
				hour: formatZoned(date, timezone, 'HH'),
				date: day === previousDay ? '' : formatZoned(date, timezone, 'EEE d')
			});
			previousDay = day;
		}
		return points;
	});

	let daySeparators = $derived.by((): DaySeparator[] => {
		const separators: DaySeparator[] = [];
		let previousDay = '';
		for (let index = 0; index < timestampsSec.length; index++) {
			const time = timestampsSec[index];
			if (time < viewStart || time > viewEnd) continue;
			const day = formatZoned(new Date(timestamps[index]), timezone, 'yyyy-MM-dd');
			if (previousDay && day !== previousDay) separators.push({ x: xForTime(time) });
			previousDay = day;
		}
		return separators;
	});
	let sunlightSegments = $derived.by((): SunlightSegment[] => {
		const segments: SunlightSegment[] = [];
		for (let index = 0; index < sunrise.length; index++) {
			const start = Math.max(viewStart, sunrise[index]);
			const end = Math.min(viewEnd, sunset[index] ?? sunrise[index]);
			if (end <= start) continue;
			segments.push({ x1: xForTime(start), x2: xForTime(end) });
		}
		return segments;
	});

	let hoverX = $derived(
		sharedHover !== null && sharedHover >= viewStart && sharedHover <= viewEnd
			? xForTime(sharedHover)
			: null
	);
	let hoverIndex = $derived(
		sharedHover !== null && hoverX !== null && timestampsSec.length > 0
			? nearestIndex(timestampsSec, sharedHover)
			: -1
	);

	function conditionLabel(code: number): string {
		if (code === 0) return m.cond_clear();
		if (code === 1 || code === 2) return m.cond_fair();
		if (code === 3) return m.cond_cloudy();
		if (code === 45 || code === 48) return m.cond_fog();
		if ([51, 53, 55, 56, 57].includes(code)) return m.cond_drizzle();
		if ([71, 73, 75, 77, 85, 86].includes(code)) return m.cond_snow();
		if ([95, 96, 99].includes(code)) return m.cond_thunder();
		return m.cond_rain();
	}

	let tooltipRows = $derived.by((): TooltipRow[] => {
		if (hoverIndex < 0) return [];
		const rows: TooltipRow[] = [];
		for (const model of displayModels) {
			const code = model.variables.weather_code?.[hoverIndex];
			if (!hasWeatherIcon(code)) continue;
			const cloudCover = model.variables.cloud_cover?.[hoverIndex];
			rows.push({
				modelId: model.modelId,
				label: modelLabel(model.modelId),
				color: modelColor(model.modelId, modelOrder),
				condition: conditionLabel(code),
				cloudCover:
					cloudCover !== undefined && Number.isFinite(cloudCover)
						? Math.round(Math.max(0, Math.min(100, cloudCover)))
						: null
			});
		}
		return rows;
	});
	let tooltipVisible = $derived(hoverIndex >= 0 && tooltipRows.length > 0 && hoverX !== null);
	let tooltipFlip = $derived((hoverX ?? 0) > width * 0.55);
	let hoverFrame = 0;
	let queuedClientX = 0;
	const pointers = new Map<number, { x: number; y: number }>();
	let gesture: 'none' | 'scroll' | 'inspect' | 'pan' | 'pinch' | 'select' = 'none';
	let selectionStartX = 0;
	let touchStart: { x: number; y: number; start: number; end: number } | null = null;
	let panStart: { x: number; start: number; end: number } | null = null;
	let pinchStart: { distance: number; start: number; end: number } | null = null;

	onMount(() => {
		const unregisterGroup = registerGroupMember(group);
		const interactionElement = containerEl;
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) width = entry.contentRect.width;
		});
		if (interactionElement) observer.observe(interactionElement);
		interactionElement?.addEventListener('wheel', handleWheel, { passive: false });

		const themeObserver = new MutationObserver(() => themeVersion++);
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'data-theme']
		});

		registerExporter?.({ getExportImage });
		return () => {
			interactionElement?.removeEventListener('wheel', handleWheel);
			observer.disconnect();
			themeObserver.disconnect();
			unregisterGroup();
			registerExporter?.(null);
		};
	});

	function scheduleHover(clientX: number): void {
		queuedClientX = clientX;
		if (hoverFrame !== 0) return;
		hoverFrame = requestAnimationFrame(() => {
			hoverFrame = 0;
			if (!containerEl || timestampsSec.length === 0) return;
			const localX = queuedClientX - containerEl.getBoundingClientRect().left;
			const time =
				viewStart + ((localX - plotInsetLeft) / Math.max(1, plotWidth)) * (viewEnd - viewStart);
			setGroupHover(
				group,
				localX >= plotInsetLeft && localX <= width - plotInsetRight
					? timestampsSec[nearestIndex(timestampsSec, time)]
					: null
			);
		});
	}

	function handlePointerDown(event: PointerEvent): void {
		if (!containerEl) return;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 2) {
			containerEl.setPointerCapture(event.pointerId);
			const [first, second] = [...pointers.values()];
			pinchStart = {
				distance: Math.max(10, Math.abs(first.x - second.x)),
				start: viewStart,
				end: viewEnd
			};
			panStart = null;
			dragSelect = null;
			gesture = 'pinch';
			setGroupHover(group, null);
			return;
		}

		if (event.pointerType === 'mouse') {
			containerEl.setPointerCapture(event.pointerId);
			selectionStartX = clampPlotX(event.clientX - containerEl.getBoundingClientRect().left);
			dragSelect = null;
			gesture = 'select';
			event.preventDefault();
		} else {
			touchStart = { x: event.clientX, y: event.clientY, start: viewStart, end: viewEnd };
			gesture = 'none';
		}
	}

	function handlePointerMove(event: PointerEvent): void {
		if (!containerEl) return;
		if (pointers.has(event.pointerId)) {
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		}

		if (gesture === 'pinch' && pointers.size === 2 && pinchStart) {
			const [first, second] = [...pointers.values()];
			const distance = Math.max(10, Math.abs(first.x - second.x));
			const scale = pinchStart.distance / distance;
			const span = pinchStart.end - pinchStart.start;
			const center = (pinchStart.start + pinchStart.end) / 2;
			applyRange(center - (span * scale) / 2, center + (span * scale) / 2);
			return;
		}

		if (gesture === 'select' && event.pointerType === 'mouse' && pointers.size === 1) {
			const x = clampPlotX(event.clientX - containerEl.getBoundingClientRect().left);
			if (dragSelect || Math.abs(x - selectionStartX) >= 3) {
				dragSelect = { x0: selectionStartX, x1: x };
				setGroupHover(group, null);
			}
			return;
		}

		if (event.pointerType !== 'mouse' && gesture === 'none' && touchStart && pointers.size === 1) {
			const deltaX = Math.abs(event.clientX - touchStart.x);
			const deltaY = Math.abs(event.clientY - touchStart.y);
			if (deltaX < 6 && deltaY < 6) return;
			if (deltaY > deltaX) {
				gesture = 'scroll';
				return;
			}
			gesture = zoomed ? 'pan' : 'inspect';
			containerEl.setPointerCapture(event.pointerId);
			if (gesture === 'pan') {
				panStart = { x: event.clientX, start: touchStart.start, end: touchStart.end };
			}
		}

		if (gesture === 'scroll') return;
		if (gesture === 'pan' && panStart && pointers.size === 1 && zoomed) {
			const deltaTime =
				((panStart.x - event.clientX) / Math.max(1, plotWidth)) * (panStart.end - panStart.start);
			applyRange(panStart.start + deltaTime, panStart.end + deltaTime);
			return;
		}

		if (pointers.size <= 1) scheduleHover(event.clientX);
	}

	function handlePointerUp(event: PointerEvent): void {
		if (gesture === 'select' && event.pointerType === 'mouse' && dragSelect) {
			const first = timeForX(dragSelect.x0);
			const second = timeForX(dragSelect.x1);
			applyRange(Math.min(first, second), Math.max(first, second));
		}
		dragSelect = null;
		pointers.delete(event.pointerId);
		if (pointers.size < 2) pinchStart = null;
		if (pointers.size === 0) {
			panStart = null;
			touchStart = null;
			gesture = 'none';
		}
		if (event.pointerType !== 'mouse') setGroupHover(group, null);
	}

	function handlePointerLeave(): void {
		if (pointers.size === 0) setGroupHover(group, null);
	}

	function handleWheel(event: WheelEvent): void {
		if ((!event.ctrlKey && !event.metaKey) || !containerEl) return;
		event.preventDefault();
		const x = clampPlotX(event.clientX - containerEl.getBoundingClientRect().left);
		zoomAt(timeForX(x), event.deltaY < 0 ? 1 / 1.3 : 1.3);
	}

	function handleDoubleClick(): void {
		setGroupRange(group, null);
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (timestampsSec.length === 0) return;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			const current = sharedHover ?? viewStart;
			const index = nearestIndex(timestampsSec, current);
			const delta = event.key === 'ArrowLeft' ? -1 : 1;
			const next = Math.max(0, Math.min(timestampsSec.length - 1, index + delta));
			setGroupHover(group, timestampsSec[next]);
			event.preventDefault();
		} else if (event.key === '+' || event.key === '=') {
			zoomAt(sharedHover ?? (viewStart + viewEnd) / 2, 1 / 1.3);
			event.preventDefault();
		} else if (event.key === '-' || event.key === '_') {
			zoomAt(sharedHover ?? (viewStart + viewEnd) / 2, 1.3);
			event.preventDefault();
		} else if (event.key === 'Escape') {
			setGroupRange(group, null);
			setGroupHover(group, null);
		}
	}

	onDestroy(() => {
		if (hoverFrame !== 0) cancelAnimationFrame(hoverFrame);
	});

	const iconImageCache = new Map<string, Promise<HTMLImageElement>>();

	function loadColoredIcon(name: string, color: string): Promise<HTMLImageElement> {
		const key = `${name}|${color}`;
		let promise = iconImageCache.get(key);
		if (!promise) {
			promise = fetch(`/images/weather-icons/${name}.svg`)
				.then((response) => response.text())
				.then(
					(svg) =>
						new Promise<HTMLImageElement>((resolve, reject) => {
							const colored = svg.replace(/<svg\b/, `<svg fill="${color}"`);
							const url = URL.createObjectURL(new Blob([colored], { type: 'image/svg+xml' }));
							const image = new Image();
							image.onload = () => {
								URL.revokeObjectURL(url);
								resolve(image);
							};
							image.onerror = (error) => {
								URL.revokeObjectURL(url);
								reject(error);
							};
							image.src = url;
						})
				);
			iconImageCache.set(key, promise);
		}
		return promise;
	}

	export async function getExportImage(opts?: {
		title?: string;
	}): Promise<HTMLCanvasElement | null> {
		if (!containerEl || width <= 0 || displayModels.length === 0) return null;
		const dpr = window.devicePixelRatio || 1;
		const titleHeight = opts?.title ? EXPORT_TITLE_H : 0;
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round((height + titleHeight) * dpr);
		const context = canvas.getContext('2d');
		if (!context) return null;
		context.setTransform(dpr, 0, 0, dpr, 0, 0);

		const styles = getComputedStyle(containerEl);
		const color = (name: string, fallback: string): string =>
			styles.getPropertyValue(name).trim() || fallback;
		const background = color('--card', '#ffffff');
		const foreground = color('--foreground', '#1f2937');
		const muted = color('--muted-foreground', '#6b7280');
		const grid = color('--border', 'rgba(0, 0, 0, 0.12)');
		const sunlight = color('--chart-3', '#f6c453');

		context.fillStyle = background;
		context.fillRect(0, 0, width, height + titleHeight);
		if (opts?.title) {
			context.fillStyle = foreground;
			context.font = '600 14px system-ui, -apple-system, sans-serif';
			context.textBaseline = 'middle';
			context.fillText(opts.title, 4, EXPORT_TITLE_H / 2 + 2);
		}

		const yOffset = titleHeight;
		context.save();
		context.beginPath();
		context.rect(plotInsetLeft, yOffset, plotWidth, height);
		context.clip();
		const sunlightY = yOffset + HEADER_H - SUNLIGHT_STRIP_H;
		context.fillStyle = muted;
		context.globalAlpha = 0.12;
		context.fillRect(plotInsetLeft, sunlightY, plotWidth, SUNLIGHT_STRIP_H);
		context.fillStyle = sunlight;
		context.globalAlpha = 0.9;
		for (const segment of sunlightSegments) {
			context.fillRect(segment.x1, sunlightY, segment.x2 - segment.x1, SUNLIGHT_STRIP_H);
		}
		context.globalAlpha = 1;
		context.strokeStyle = grid;
		context.lineWidth = 1;
		for (const separator of daySeparators) {
			context.beginPath();
			context.moveTo(separator.x, yOffset);
			context.lineTo(separator.x, yOffset + height);
			context.stroke();
		}
		context.restore();

		context.font = '600 10px system-ui, -apple-system, sans-serif';
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		for (const point of visiblePoints) {
			if (point.date) {
				context.fillStyle = foreground;
				context.textAlign = 'left';
				context.fillText(point.date, Math.max(plotInsetLeft + 3, point.x + 3), yOffset + 9);
			}
			context.fillStyle = muted;
			context.textAlign = 'center';
			context.fillText(point.hour, point.x, yOffset + 27);
		}

		const iconNames = new Set<string>();
		for (const model of displayModels) {
			for (const point of visiblePoints) {
				const code = model.variables.weather_code?.[point.index];
				if (!hasWeatherIcon(code)) continue;
				iconNames.add(getWeatherIconName(code, isDaytime(point.time)));
			}
		}
		const images = new Map<string, HTMLImageElement>();
		await Promise.all(
			[...iconNames].map(async (name) => {
				try {
					images.set(name, await loadColoredIcon(name, foreground));
				} catch {
					/* An individual missing icon should not prevent the report export. */
				}
			})
		);

		context.font = '600 11px system-ui, -apple-system, sans-serif';
		context.textBaseline = 'middle';
		for (let row = 0; row < displayModels.length; row++) {
			const model = displayModels[row];
			const rowTop = yOffset + HEADER_H + row * ROW_H;
			const rowCenter = rowTop + ROW_H / 2;
			context.strokeStyle = grid;
			context.globalAlpha = 0.55;
			context.beginPath();
			context.moveTo(0, rowTop);
			context.lineTo(width, rowTop);
			context.stroke();
			context.globalAlpha = 1;
			context.fillStyle = modelColor(model.modelId, modelOrder);
			context.beginPath();
			context.arc(9, rowCenter, 4, 0, Math.PI * 2);
			context.fill();
			if (showModelNames) {
				context.fillStyle = foreground;
				context.textAlign = 'left';
				context.fillText(
					modelLabel(model.modelId),
					18,
					rowCenter,
					Math.max(20, plotInsetLeft - 24)
				);
			}

			context.save();
			context.beginPath();
			// The right chart inset is empty display space, so pictograms at the
			// final chart coordinate may extend into it without being clipped.
			context.rect(plotInsetLeft, rowTop, width - plotInsetLeft, ROW_H);
			context.clip();
			for (const point of visiblePoints) {
				const code = model.variables.weather_code?.[point.index];
				if (!hasWeatherIcon(code)) continue;
				const cloudCover = model.variables.cloud_cover?.[point.index];
				const name = getWeatherIconName(code, isDaytime(point.time));
				const image = images.get(name);
				if (cloudCover !== undefined && Number.isFinite(cloudCover)) {
					const fraction = Math.max(0, Math.min(100, cloudCover)) / 100;
					context.fillStyle = muted;
					context.globalAlpha = 0.03 + 0.34 * Math.pow(fraction, 0.85);
					context.beginPath();
					context.roundRect(
						point.x - ICON_BOX_WIDTH / 2,
						rowCenter - ICON_BOX_HEIGHT / 2,
						ICON_BOX_WIDTH,
						ICON_BOX_HEIGHT,
						4
					);
					context.fill();
					context.globalAlpha = 1;
				}
				if (image) {
					context.drawImage(
						image,
						point.x - ICON_SIZE / 2,
						rowCenter - ICON_SIZE / 2,
						ICON_SIZE,
						ICON_SIZE
					);
				}
			}
			context.restore();
		}

		return canvas;
	}

	// The visible panel is drawn through the exact same export renderer. This
	// keeps icon sampling, cloud-cover boxes, labels, and plot geometry identical in
	// the page and downloaded PNG.
	$effect(() => {
		const target = canvasEl;
		const currentWidth = width;
		const currentHeight = height;
		void themeVersion;
		void visiblePoints;
		void daySeparators;
		void sunlightSegments;
		void displayModels;
		void showModelNames;
		if (!target || currentWidth <= 0 || currentHeight <= 0) return;

		const version = ++screenRenderVersion;
		void getExportImage().then((rendered) => {
			if (!rendered || version !== screenRenderVersion || target !== canvasEl) return;
			target.width = rendered.width;
			target.height = rendered.height;
			const context = target.getContext('2d');
			if (!context) return;
			context.setTransform(1, 0, 0, 1, 0, 0);
			context.clearRect(0, 0, target.width, target.height);
			context.drawImage(rendered, 0, 0);
		});

		return () => {
			if (version === screenRenderVersion) screenRenderVersion++;
		};
	});
</script>

{#if displayModels.length > 0}
	<section
		class="mt-7 -mx-3 border-y border-border/70 bg-card shadow-sm lg:mx-0 lg:rounded-2xl lg:border"
		aria-labelledby="model-pictogram-title"
	>
		<div class="flex items-start justify-between gap-3 px-3 pt-3 pb-2 lg:px-4">
			<div class="min-w-0">
				<h2 id="model-pictogram-title" class="text-sm font-bold tracking-tight">
					{m.compare_timeline_title()}
				</h2>
				<p class="text-xs text-muted-foreground">{m.compare_timeline_hint()}</p>
			</div>
			<button
				type="button"
				class="min-h-8 shrink-0 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground"
				aria-pressed={showModelNames}
				onclick={onToggleModelNames}
			>
				{showModelNames ? m.compare_hide_model_names() : m.compare_show_model_names()}
			</button>
		</div>
		<div class="lg:px-4">
			<div
				bind:this={containerEl}
				class="relative w-full select-none overflow-hidden"
				style:touch-action="pan-y"
				role="region"
				tabindex="0"
				aria-label={m.compare_timeline_scroll_aria()}
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerUp}
				onpointercancel={handlePointerUp}
				onpointerleave={handlePointerLeave}
				ondblclick={handleDoubleClick}
				onkeydown={handleKeydown}
			>
				<canvas
					bind:this={canvasEl}
					class="block w-full"
					style:height="{height}px"
					role="img"
					aria-label={m.compare_timeline_caption()}
				></canvas>
				{#if dragSelect}
					<div
						class="pointer-events-none absolute top-0 z-10 border-x-2 border-primary/70 bg-primary/15"
						style:left="{Math.min(dragSelect.x0, dragSelect.x1)}px"
						style:width="{Math.abs(dragSelect.x1 - dragSelect.x0)}px"
						style:height="{height}px"
					></div>
				{/if}
				{#if hoverX !== null}
					<div
						class="pointer-events-none absolute top-0 left-0 border-l border-dashed border-muted-foreground/70 will-change-transform"
						style:height="{height}px"
						style:transform="translateX({hoverX}px)"
					></div>
				{/if}
				{#if tooltipVisible && hoverX !== null && sharedHover !== null}
					<div
						class="pointer-events-none absolute z-20 w-max max-w-[calc(100%-1rem)] rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
						style:top="{HEADER_H + 4}px"
						style:left={tooltipFlip ? 'auto' : `${hoverX + 12}px`}
						style:right={tooltipFlip ? '0.5rem' : 'auto'}
					>
						<div class="mb-1 font-semibold whitespace-nowrap">
							{formatZoned(new Date(sharedHover * 1000), timezone, 'EEE d MMM HH:mm')}
						</div>
						{#each tooltipRows as row (row.modelId)}
							<div class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5">
								<span class="size-2 shrink-0 rounded-full" style:background-color={row.color}
								></span>
								<span class="min-w-0 break-words">{row.label}:</span>
								<span class="pl-2 text-right font-semibold whitespace-nowrap">
									{row.condition}{#if row.cloudCover !== null}
										· {m.var_cloud()} {row.cloudCover}%
									{/if}
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</section>
{/if}
