<script lang="ts">
	import { onMount } from 'svelte';

	import * as m from '$lib/paraglide/messages';
	import { TOP_PRESSURES } from '$lib/soundings/models';
	import {
		interpolateLevel,
		temperatureDisplay,
		temperatureUnit,
		valueText,
		windDisplay,
		windUnit
	} from '$lib/soundings/profile';
	import {
		TRACE_COLORS,
		buildLayout,
		fromCanvas,
		renderSelection,
		renderSounding
	} from '$lib/soundings/renderer';

	import type { SoundingProfile } from '$lib/soundings/profile';
	import type { ChartPalette, PlotLayout, Selection } from '$lib/soundings/renderer';
	import type { UnitPrefs } from '$lib/stores/settings';

	let {
		profile,
		dayProfiles = [],
		elevation,
		topPressure = $bindable(100),
		units
	}: {
		profile: SoundingProfile;
		dayProfiles?: SoundingProfile[];
		elevation: number;
		topPressure?: number;
		units: UnitPrefs;
	} = $props();
	let container: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let overlay: HTMLCanvasElement;
	let availableWidth = $state(600);
	let chartTop = $state(300);
	let ready = $state(false);
	let themeVersion = $state(0);
	let layout = $state<PlotLayout | null>(null);
	let selection = $state<Selection | null>(null);
	let palette: ChartPalette;
	let viewportHeight = $state(900);
	// Grow vertically without stretching the skew-T into a landscape chart.
	let width = $derived(
		Math.min(
			availableWidth,
			Math.max(440, viewportHeight - chartTop - (availableWidth < 768 ? 100 : 48))
		)
	);
	let height = $derived(Math.max(440, width));
	function measure() {
		if (!container) return;
		availableWidth = container.clientWidth;
		// Main owns scrolling: measuring in its unscrolled position keeps sizing
		// stable when changing the hour or day while inspecting lower levels.
		chartTop = container.getBoundingClientRect().top + (container.closest('main')?.scrollTop ?? 0);
	}
	let dragging = false;
	let levels = $derived(profile.levels);
	let inspected = $derived(selection ? interpolateLevel(levels, selection.pressure) : null);
	let legend = $derived([
		{ name: m.var_temperature(), color: TRACE_COLORS.temperature, style: 'solid' },
		{ name: m.var_dew_point(), color: TRACE_COLORS.dewpoint, style: 'solid' },
		{ name: m.sounding_dry(), color: TRACE_COLORS.dry, style: 'dashed' },
		{ name: m.sounding_moist(), color: TRACE_COLORS.moist, style: 'solid' },
		{ name: m.sounding_mixing(), color: TRACE_COLORS.mixing, style: 'dotted' }
	]);

	function context(target: HTMLCanvasElement) {
		const dpr = window.devicePixelRatio || 1;
		target.width = Math.round(width * dpr);
		target.height = Math.round(height * dpr);
		const ctx = target.getContext('2d');
		ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
		return ctx;
	}

	onMount(() => {
		measure();
		let resizeFrame = 0;
		const resize = new ResizeObserver(() => {
			cancelAnimationFrame(resizeFrame);
			resizeFrame = requestAnimationFrame(() => {
				measure();
			});
		});
		resize.observe(container);
		const theme = new MutationObserver(() => {
			themeVersion++;
		});
		theme.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'style', 'data-theme']
		});
		ready = true;
		return () => {
			cancelAnimationFrame(resizeFrame);
			resize.disconnect();
			theme.disconnect();
		};
	});

	$effect(() => {
		if (!ready) return;
		void themeVersion;
		const style = getComputedStyle(document.documentElement);
		palette = {
			background: style.getPropertyValue('--background').trim() || '#fff',
			foreground: style.getPropertyValue('--foreground').trim() || '#111',
			grid: style.getPropertyValue('--border').trim() || '#ddd',
			muted: style.getPropertyValue('--muted-foreground').trim() || '#777'
		};
		const next = buildLayout(profile, elevation, topPressure, width, height, dayProfiles);
		const ctx = context(canvas);
		if (ctx && next)
			renderSounding(ctx, profile, elevation, next, width, height, palette, units, {
				wind: m.var_wind_short(),
				surface: m.sounding_surface(),
				temperatureUnit: temperatureUnit(units),
				windUnit: windUnit(units)
			});
		layout = next;
		selection = null;
		context(overlay);
	});

	$effect(() => {
		if (!ready || !layout) return;
		const ctx = overlay.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0, 0, width, height);
		if (selection) renderSelection(ctx, layout, selection, palette, profile, elevation, units);
	});

	function inspect(event: MouseEvent | PointerEvent) {
		if (!layout) return;
		const rect = canvas.getBoundingClientRect();
		const x = ((event.clientX - rect.left) * width) / rect.width;
		const y = ((event.clientY - rect.top) * height) / rect.height;
		if (
			x < layout.left ||
			x > layout.left + layout.width ||
			y < layout.top ||
			y > layout.top + layout.height
		) {
			selection = null;
			return;
		}
		selection = fromCanvas(layout, x, y);
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			selection = null;
			return;
		}
		if (!layout || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
		// Plain Left/Right belongs to the page time navigation.
		if (['ArrowLeft', 'ArrowRight'].includes(event.key) && !event.shiftKey) return;
		event.preventDefault();
		const current =
			selection ??
			fromCanvas(layout, layout.left + layout.width / 2, layout.top + layout.height / 2);
		selection = {
			pressure: Math.min(
				layout.maxPressure,
				Math.max(
					layout.minPressure,
					current.pressure *
						Math.exp(event.key === 'ArrowUp' ? -0.03 : event.key === 'ArrowDown' ? 0.03 : 0)
				)
			),
			temperature: Math.min(
				60,
				Math.max(
					-120,
					current.temperature +
						(event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0)
				)
			)
		};
	}

	export async function getExportImage(): Promise<HTMLCanvasElement | null> {
		if (!canvas || !layout) return null;
		const image = document.createElement('canvas');
		image.width = canvas.width;
		image.height = canvas.height;
		image.getContext('2d')?.drawImage(canvas, 0, 0);
		return image;
	}
</script>

<svelte:window bind:innerHeight={viewportHeight} onresize={measure} />

<div class="w-full min-w-0" bind:this={container}>
	<div class="relative mx-auto max-w-full" style:width="{width}px">
		<select
			aria-label={m.sounding_top()}
			title={m.sounding_top()}
			bind:value={topPressure}
			class="absolute top-0 left-0 z-10 h-9 cursor-pointer rounded-md border border-transparent bg-background px-1 text-xs text-muted-foreground hover:border-border focus-visible:outline-2 focus-visible:outline-primary"
		>
			{#each TOP_PRESSURES as pressure (pressure)}<option value={pressure}>{pressure} hPa</option
				>{/each}
		</select>
		<button
			type="button"
			aria-label={m.sounding_chart_aria()}
			class="relative block w-full touch-none rounded-lg outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
			onpointermove={(event) => {
				if (event.pointerType !== 'touch' || dragging) inspect(event);
			}}
			onpointerdown={(event) => {
				dragging = true;
				event.currentTarget.setPointerCapture(event.pointerId);
				inspect(event);
			}}
			onpointerup={() => {
				dragging = false;
			}}
			onclick={inspect}
			onkeydown={keydown}
			onpointerleave={(event) => {
				if (event.pointerType === 'mouse') selection = null;
			}}
			onpointercancel={() => {
				dragging = false;
				selection = null;
			}}
			onblur={() => (selection = null)}
		>
			<canvas bind:this={canvas} style:height="{height}px" class="block w-full" aria-hidden="true"
			></canvas>
			<canvas
				bind:this={overlay}
				style:height="{height}px"
				class="pointer-events-none absolute inset-0 w-full"
				aria-hidden="true"
			></canvas>
		</button>
		<div class="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
			{#each legend as item (item.name)}<span class="inline-flex items-center gap-1"
					><span
						class="w-4 border-t-2"
						style:border-color={item.color}
						style:border-top-style={item.style}
					></span>{item.name}</span
				>{/each}
			<span>{m.sounding_cloud_shading()}</span>
		</div>
		{#if layout && layout.minPressure > topPressure}
			<p class="mt-2 text-center text-xs text-muted-foreground">
				{m.sounding_limited({ pressure: String(layout.minPressure) })}
			</p>
		{/if}
		<p class="mt-3 text-center text-xs text-muted-foreground">{m.sounding_help()}</p>
		<div class="sr-only" aria-live="polite" aria-atomic="true">
			{#if selection}
				<p>
					{m.sounding_parcel()}: {valueText(temperatureDisplay(selection.temperature, units))}
					{temperatureUnit(units)} · {valueText(selection.pressure, 0)} hPa
				</p>
				{#if inspected}
					<p>
						{m.var_temperature()}: {valueText(temperatureDisplay(inspected.temperature, units))}
						{temperatureUnit(units)} · {m.var_dew_point()}: {valueText(
							temperatureDisplay(inspected.dewpoint, units)
						)}
						{temperatureUnit(units)} · {m.var_wind_short()}: {valueText(
							windDisplay(inspected.windSpeed, units)
						)}
						{windUnit(units)} / {valueText(inspected.windDirection, 0)}° · {m.sounding_height()}: {valueText(
							inspected.height,
							0
						)} m · {m.var_cloud()}: {valueText(inspected.cloudCover, 0)}%
					</p>
				{/if}
			{:else}<p>{m.sounding_inspect()}</p>{/if}
		</div>
		<details class="mt-4 rounded-lg border border-border p-3">
			<summary class="cursor-pointer text-sm font-medium">{m.sounding_table()}</summary>
			<div class="mt-3 overflow-x-auto">
				<table class="w-full text-right text-xs tabular-nums">
					<caption class="sr-only">{m.sounding_table()}</caption>
					<thead
						><tr>
							{#each [m.sounding_pressure() + ' (hPa)', m.sounding_height() + ' (m)', m.var_temperature() + ' (' + temperatureUnit(units) + ')', m.var_dew_point() + ' (' + temperatureUnit(units) + ')', m.var_wind() + ' (' + windUnit(units) + ')', m.var_wind_dir() + ' (°)', m.var_cloud() + ' (%)'] as heading (heading)}<th
									scope="col"
									class="px-2 py-2">{heading}</th
								>{/each}
						</tr></thead
					>
					<tbody
						>{#each levels as level (level.pressure)}<tr class="border-t border-border">
								<th scope="row" class="px-2 py-1.5">{level.pressure}</th>
								{#each [valueText(level.height, 0), valueText(temperatureDisplay(level.temperature, units)), valueText(temperatureDisplay(level.dewpoint, units)), valueText(windDisplay(level.windSpeed, units)), valueText(level.windDirection, 0), valueText(level.cloudCover, 0)] as value, i (i)}<td
										class="px-2 py-1.5">{value}</td
									>{/each}
							</tr>{/each}</tbody
					>
				</table>
			</div>
		</details>
	</div>
</div>
