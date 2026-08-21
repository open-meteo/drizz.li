<script lang="ts">
	/**
	 * The week page's loading placeholders, in one place so the page and the
	 * redirect stub in front of it show the same thing.
	 *
	 * A visitor landing on `/` does not reach the located page for anything from
	 * half a second to several (the bare `/weather/week/` stub has to ask where
	 * they are first), and until this was shared that whole stretch was a blank
	 * column: the placeholders lived inside the page that had not mounted yet.
	 *
	 * Deliberately no intro transition. These fade *out* over the content that
	 * replaces them (skeletonOut), but fading them *in* would mean the stub's
	 * placeholder blinking out and the identical one on the located page fading
	 * back up - and on a plain page load there is nothing to fade in from.
	 */
	import { MediaQuery } from 'svelte/reactivity';

	import { storedChartLayout, storedVariablePrefs } from '$lib/stores/settings';

	import { skeletonOut } from '$lib/utils/skeleton-fade';

	import { ChartContainer } from '$lib/components/charts';

	let { part }: { part: 'table' | 'summary' | 'charts' } = $props();

	// Meteogram canvases are shorter on phones, where a 300px plot eats most of
	// the viewport - the same number the real charts are given, so the reserved
	// space matches exactly.
	const narrow = new MediaQuery('max-width: 767px');
	let chartHeight = $derived(narrow.current ? 215 : 300);

	// The hourly table is a header row, the time/daylight row, then one row per
	// enabled variable, so this reserves exactly that and nothing under it jumps
	// when the real table arrives. Rows are shorter below lg, where the cells sit
	// tighter - measured, not guessed: 36px against 55px, and the time row is
	// 48px at every width.
	const compact = new MediaQuery('max-width: 1023px');
	let tableRowPx = $derived(compact.current ? 36 : 55);
	const TABLE_TIME_ROW_PX = 48;
	let enabledTableRows = $derived(Object.values($storedVariablePrefs.table).filter(Boolean).length);

	// Number of meteogram panels, so the chart area holds its height before the
	// data arrives.
	let enabledChartCount = $derived($storedChartLayout.filter((p) => p.variables.length > 0).length);

	// Height one meteogram takes: the plot plus its chrome (title row, axis
	// labels, legend). Measured from the rendered charts, and it steps twice -
	// the plot itself is shorter on phones, and from lg up the sidebar narrows
	// the charts enough that their chrome takes another line.
	let chartSlotHeight = $derived(
		narrow.current ? chartHeight + 53 : compact.current ? chartHeight + 57 : chartHeight + 73
	);
</script>

{#if part === 'table'}
	<!-- Mirrors the real table: same header bar and the same body height, so the
	     heading doesn't pop in and nothing below moves. -->
	<div
		out:skeletonOut
		class="-mx-3 overflow-hidden border-y border-border/70 bg-card shadow-sm md:mx-0 md:rounded-2xl md:border"
	>
		<div
			class="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/40 px-4 py-2.5"
		>
			<div class="h-6 w-44 animate-pulse rounded bg-muted"></div>
			<div class="flex items-center gap-2">
				<div class="h-8 w-24 animate-pulse rounded-lg bg-muted"></div>
				<div class="h-8 w-20 animate-pulse rounded-lg bg-muted"></div>
			</div>
		</div>
		<!-- one placeholder per row the real table will render, so the body reads
		     as a loading table rather than a blank panel -->
		<div class="divide-y divide-border/50">
			<!-- the time + daylight row, which is taller than the variable rows -->
			<div class="flex items-center gap-4 px-4" style="height: {TABLE_TIME_ROW_PX}px">
				<div class="h-3.5 w-14 shrink-0 animate-pulse rounded bg-muted"></div>
				<div class="h-5 flex-1 animate-pulse rounded bg-muted/70"></div>
			</div>
			{#each { length: enabledTableRows } as _, i (i)}
				<div class="flex items-center gap-4 px-4" style="height: {tableRowPx}px">
					<div class="h-3.5 w-14 shrink-0 animate-pulse rounded bg-muted"></div>
					<div class="h-3.5 flex-1 animate-pulse rounded bg-muted/70"></div>
				</div>
			{/each}
		</div>
	</div>
{:else if part === 'summary'}
	<!-- Same footprint as the written forecast, so it doesn't shove the
	     meteograms down when it arrives. The heights are measured from the real
	     card at each breakpoint (410 / 364 / 340 / 248 px): below md the
	     narrative is clamped to five lines with a fixed toggle row and from lg up
	     the sun/moon column is the taller side, so those three are exact whatever
	     the forecast says. Only md is a judgement call - the text runs free there
	     and the card measures 291 to 364 px across a week, so this is the middle
	     of that range. The sun/moon grid reflows at sm, md and lg, which is why
	     all four are needed. -->
	<section class="mt-6" out:skeletonOut>
		<div
			class="h-102.5 animate-pulse rounded-2xl border border-border/70 bg-card sm:h-91 md:h-85 lg:h-62"
		></div>
	</section>
{:else}
	<!-- reserve the exact chart area height before the first fetch resolves,
	     header row included -->
	<section class="mt-8" out:skeletonOut>
		<!-- The real header wraps to two rows until the controls fit beside the
		     title, which happens at different widths than you would expect because
		     the sidebar takes its share from md up. These min-heights follow the
		     measured wrap points; below md the customise/PNG pair always sits on
		     its own row (a forced break in MeteogramCharts), so the header is three
		     rows there. -->
		<div
			class="mb-3 flex min-h-25.5 flex-wrap items-center justify-between gap-2 lg:min-h-16.5 xl:min-h-7.5"
		>
			<div class="h-7 w-52 animate-pulse rounded bg-muted"></div>
			<div class="flex items-center gap-3">
				<div class="h-7 w-56 animate-pulse rounded-lg bg-muted"></div>
				<div class="h-7 w-24 animate-pulse rounded-lg bg-muted"></div>
			</div>
		</div>
		<!-- The reserved box is the plot plus each chart's own chrome (see
		     chartSlotHeight), or everything below it lands too high. -->
		<ChartContainer loading chartCount={enabledChartCount || 1} chartHeight={chartSlotHeight} />
	</section>
{/if}
