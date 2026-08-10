<script lang="ts">
	import { fade, fly } from 'svelte/transition';

	import {
		type ChartPanel,
		type ChartRangePref,
		defaultChartLayout,
		storedChartLayout,
		storedChartRange
	} from '$lib/stores/settings';

	import * as m from '$lib/paraglide/messages';

	import { CHART_VARIABLES, VARIABLE_BY_KEY } from './variables';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	let { open, onClose }: Props = $props();

	// Variables not placed in any panel form the "available" pool.
	let usedKeys = $derived(new Set($storedChartLayout.flatMap((p) => p.variables)));

	const RANGE_OPTIONS: { value: ChartRangePref; label: string; hint: string }[] = [
		{ value: 'auto', label: m.default_range_auto(), hint: m.default_range_auto_hint() },
		{ value: 'today', label: m.range_today(), hint: '' },
		{ value: '3d', label: m.range_3_days(), hint: '' },
		{ value: '5d', label: m.range_5_days(), hint: '' },
		{ value: 'all', label: m.range_all(), hint: '' }
	];
	let availableVars = $derived(CHART_VARIABLES.filter((v) => !usedKeys.has(v.key)));

	// ─── Drag state ─────────────────────────────────────────────────────────────

	let dragKey = $state<string | null>(null);
	let dragLabel = $state('');
	let dragColor = $state('');
	let dragPos = $state({ x: 0, y: 0 });
	let dropZone = $state<string | null>(null); // panel id or 'pool'
	let dropIndex = $state(0);
	let pointerStart: { x: number; y: number } | null = null;
	let started = $state(false);

	function beginDrag(e: PointerEvent, key: string): void {
		const def = VARIABLE_BY_KEY.get(key);
		if (!def) return;
		pointerStart = { x: e.clientX, y: e.clientY };
		started = false;
		dragKey = key;
		dragLabel = def.label;
		dragColor = def.color;
		dragPos = { x: e.clientX, y: e.clientY };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onDragMove(e: PointerEvent): void {
		if (dragKey === null || !pointerStart) return;
		if (!started) {
			const dx = Math.abs(e.clientX - pointerStart.x);
			const dy = Math.abs(e.clientY - pointerStart.y);
			if (dx < 5 && dy < 5) return;
			started = true;
		}
		dragPos = { x: e.clientX, y: e.clientY };

		const under = document.elementFromPoint(e.clientX, e.clientY);
		const zoneEl = under?.closest('[data-zone]') as HTMLElement | null;
		if (!zoneEl) {
			dropZone = null;
			return;
		}
		dropZone = zoneEl.dataset.zone ?? null;

		// Insert before the chip whose centre is to the right of the pointer.
		const chips = [...zoneEl.querySelectorAll('[data-chip]')] as HTMLElement[];
		let idx = chips.length;
		for (let i = 0; i < chips.length; i++) {
			const r = chips[i].getBoundingClientRect();
			if (e.clientY < r.top || (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2)) {
				idx = i;
				break;
			}
		}
		dropIndex = idx;
	}

	function endDrag(e: PointerEvent): void {
		if (dragKey === null) return;
		const key = dragKey;
		const zone = started ? dropZone : null;
		(e.currentTarget as HTMLElement)?.releasePointerCapture?.(e.pointerId);
		dragKey = null;
		pointerStart = null;
		if (zone) moveVar(key, zone, dropIndex);
		dropZone = null;
	}

	function moveVar(key: string, toZone: string, toIndex: number): void {
		const layout: ChartPanel[] = $storedChartLayout.map((p) => ({
			id: p.id,
			variables: p.variables.filter((k) => k !== key)
		}));
		if (toZone !== 'pool') {
			const panel = layout.find((p) => p.id === toZone);
			if (panel) panel.variables.splice(Math.min(toIndex, panel.variables.length), 0, key);
		}
		storedChartLayout.set(layout);
	}

	function removeVar(key: string): void {
		moveVar(key, 'pool', 0);
	}

	function addPanel(): void {
		const maxN = $storedChartLayout.reduce((m, p) => {
			const n = parseInt(p.id.replace(/\D/g, ''), 10);
			return Number.isFinite(n) ? Math.max(m, n) : m;
		}, 0);
		storedChartLayout.set([...$storedChartLayout, { id: `panel-${maxN + 1}`, variables: [] }]);
	}

	function deletePanel(id: string): void {
		storedChartLayout.set($storedChartLayout.filter((p) => p.id !== id));
	}

	function resetLayout(): void {
		storedChartLayout.set(structuredClone(defaultChartLayout));
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && open && dragKey === null) onClose();
	}}
/>

{#if open}
	<div class="fixed inset-0 z-50 flex items-stretch justify-center md:items-center md:p-6">
		<div
			class="absolute inset-0 bg-black/40"
			transition:fade={{ duration: 150 }}
			onclick={() => dragKey === null && onClose()}
			onkeydown={onClose}
			role="presentation"
		></div>

		<div
			class="relative flex w-full max-w-3xl flex-col overflow-hidden bg-card shadow-2xl md:rounded-2xl md:border md:border-border"
			transition:fly={{ y: 20, duration: 200 }}
		>
			<div class="flex items-center justify-between border-b border-border px-5 py-4">
				<div>
					<h2 class="text-base font-bold">{m.customize_meteograms()}</h2>
					<p class="text-xs text-muted-foreground">
						{m.customizer_intro()}
					</p>
				</div>
				<button
					class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					onclick={onClose}
					aria-label={m.action_close()}
				>
					<svg
						class="h-4.5 w-4.5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="2"
					>
						<path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			</div>

			<div class="flex-1 space-y-4 overflow-y-auto px-5 py-4">
				<!-- Which slice of the forecast the meteograms open on -->
				<div class="rounded-xl border border-border p-3">
					<div class="mb-2 flex items-baseline justify-between gap-2">
						<span class="text-[11px] font-bold tracking-wider text-primary uppercase">
							{m.default_range_title()}
						</span>
						<span class="text-[11px] text-muted-foreground">
							{RANGE_OPTIONS.find((o) => o.value === $storedChartRange)?.hint}
						</span>
					</div>
					<div class="flex gap-1 rounded-lg bg-muted p-0.5">
						{#each RANGE_OPTIONS as option (option.value)}
							{@const active = $storedChartRange === option.value}
							<button
								type="button"
								class="flex-1 cursor-pointer rounded-md px-2 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors {active
									? 'bg-background text-foreground shadow-sm'
									: 'text-muted-foreground hover:text-foreground'}"
								aria-pressed={active}
								title={option.hint}
								onclick={() => storedChartRange.set(option.value)}
							>
								{option.label}
							</button>
						{/each}
					</div>
				</div>

				{#each $storedChartLayout as panel, i (panel.id)}
					<div
						data-zone={panel.id}
						class="rounded-xl border-2 border-dashed p-3 transition-colors {dropZone === panel.id
							? 'border-primary bg-primary/5'
							: 'border-border'}"
					>
						<div class="mb-2 flex items-center justify-between">
							<span class="text-[11px] font-bold tracking-wider text-primary uppercase"
								>{m.customizer_chart_n({ number: i + 1 })}</span
							>
							<button
								class="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
								onclick={() => deletePanel(panel.id)}
								aria-label={m.customizer_delete_chart({ number: i + 1 })}
							>
								<svg
									class="h-4 w-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									stroke-width="2"
								>
									<path stroke-linecap="round" d="M6 7h12M9 7V5h6v2m-1 0v12H10V7M4 7h16" />
								</svg>
							</button>
						</div>
						<div class="flex min-h-9 flex-wrap gap-2">
							{#each panel.variables as key (key)}
								{@const def = VARIABLE_BY_KEY.get(key)}
								{#if def}
									<div
										data-chip
										role="button"
										tabindex="0"
										aria-label={m.customizer_drag({ variable: def.label })}
										class="flex cursor-grab touch-none items-center gap-1.5 rounded-lg border border-border bg-background py-1.5 pr-1 pl-2.5 text-sm shadow-sm select-none active:cursor-grabbing {dragKey ===
										key
											? 'opacity-30'
											: ''}"
										onpointerdown={(e) => beginDrag(e, key)}
										onpointermove={onDragMove}
										onpointerup={endDrag}
										onpointercancel={endDrag}
									>
										<span
											class="h-2.5 w-2.5 shrink-0 rounded-full"
											style:background-color={def.color}
										></span>
										<span class="font-medium">{def.label}</span>
										<button
											class="ml-0.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
											onpointerdown={(e) => e.stopPropagation()}
											onclick={() => removeVar(key)}
											aria-label={m.customizer_remove({ variable: def.label })}
										>
											<svg
												class="h-3.5 w-3.5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
												stroke-width="2.5"
											>
												<path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
											</svg>
										</button>
									</div>
								{/if}
							{/each}
							{#if panel.variables.length === 0}
								<span class="self-center text-xs text-muted-foreground italic"
									>{m.customizer_drop_here()}</span
								>
							{/if}
						</div>
					</div>
				{/each}

				<button
					class="w-full cursor-pointer rounded-xl border-2 border-dashed border-border py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
					onclick={addPanel}
				>
					{m.customizer_add_chart()}
				</button>

				<div>
					<h3 class="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
						{m.customizer_available()}
					</h3>
					<div
						data-zone="pool"
						class="flex min-h-12 flex-wrap gap-2 rounded-xl border-2 border-dashed p-3 transition-colors {dropZone ===
						'pool'
							? 'border-primary bg-primary/5'
							: 'border-border'}"
					>
						{#each availableVars as def (def.key)}
							<div
								data-chip
								role="button"
								tabindex="0"
								aria-label={m.customizer_drag({ variable: def.label })}
								class="flex cursor-grab touch-none items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-muted-foreground shadow-sm select-none active:cursor-grabbing {dragKey ===
								def.key
									? 'opacity-30'
									: ''}"
								onpointerdown={(e) => beginDrag(e, def.key)}
								onpointermove={onDragMove}
								onpointerup={endDrag}
								onpointercancel={endDrag}
							>
								<span class="h-2.5 w-2.5 shrink-0 rounded-full" style:background-color={def.color}
								></span>
								<span class="font-medium">{def.label}</span>
							</div>
						{/each}
						{#if availableVars.length === 0}
							<span class="self-center text-xs text-muted-foreground italic"
								>{m.customizer_all_in_use()}</span
							>
						{/if}
					</div>
				</div>
			</div>

			<div class="flex items-center justify-between border-t border-border px-5 py-3">
				<button
					class="cursor-pointer text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
					onclick={resetLayout}
				>
					{m.action_reset_defaults()}
				</button>
				<button
					class="cursor-pointer rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
					onclick={onClose}
				>
					{m.action_done()}
				</button>
			</div>
		</div>
	</div>

	<!-- Floating drag preview -->
	{#if dragKey !== null && started}
		<div
			class="pointer-events-none fixed z-60 flex items-center gap-1.5 rounded-lg border border-primary bg-card px-2.5 py-1.5 text-sm font-medium shadow-xl"
			style:left="{dragPos.x + 8}px"
			style:top="{dragPos.y + 8}px"
		>
			<span class="h-2.5 w-2.5 shrink-0 rounded-full" style:background-color={dragColor}></span>
			{dragLabel}
		</div>
	{/if}
{/if}
