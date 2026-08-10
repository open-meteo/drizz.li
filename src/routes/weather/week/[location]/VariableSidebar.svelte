<script lang="ts">
	import { fade, fly } from 'svelte/transition';

	import {
		defaultTableRowOrder,
		defaultVariablePrefs,
		mergeTableRowOrder,
		storedTableRowOrder,
		storedVariablePrefs
	} from '$lib/stores/settings';

	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';

	import * as m from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	let { open, onClose }: Props = $props();

	const tableVariableLabels: Record<string, string> = {
		icons: 'Weather icons',
		temperature: 'Temperature',
		feels: 'Feels like',
		dew_point: 'Dew point',
		wind: 'Wind',
		gusts: 'Wind gusts',
		humidity: 'Humidity',
		clouds: 'Cloud cover',
		pressure: 'Pressure',
		uv: 'UV index',
		visibility: 'Visibility',
		precipitation: 'Precipitation',
		snowfall: 'Snowfall'
	};

	// Listed in the same (customizable) order the table renders its rows.
	let tableRowOrder = $derived(mergeTableRowOrder($storedTableRowOrder));

	function toggle(section: 'table' | 'charts', key: string) {
		storedVariablePrefs.update((prefs) => {
			const current = { ...defaultVariablePrefs[section], ...prefs[section] };
			return { ...prefs, [section]: { ...current, [key]: !(current[key] ?? true) } };
		});
	}

	/** Moves a table row up (-1) or down (+1) in the rendered order. */
	function moveRow(key: string, dir: -1 | 1) {
		storedTableRowOrder.update((stored) => {
			const order = mergeTableRowOrder(stored);
			const i = order.indexOf(key);
			const j = i + dir;
			if (i < 0 || j < 0 || j >= order.length) return order;
			[order[i], order[j]] = [order[j], order[i]];
			return order;
		});
	}

	function resetDefaults() {
		storedVariablePrefs.set(structuredClone(defaultVariablePrefs));
		storedTableRowOrder.set([...defaultTableRowOrder]);
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && open) onClose();
	}}
/>

{#if open}
	<div class="fixed inset-0 z-50">
		<div
			class="absolute inset-0 bg-black/30"
			transition:fade={{ duration: 150 }}
			onclick={onClose}
			onkeydown={onClose}
			role="presentation"
		></div>
		<aside
			class="absolute inset-y-0 right-0 flex w-80 max-w-[90vw] flex-col overflow-y-auto border-l border-border bg-card shadow-xl"
			transition:fly={{ x: 320, duration: 200, opacity: 1 }}
			aria-label={m.variables_aria()}
		>
			<div
				class="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-4"
			>
				<h2 class="text-base font-bold">{m.hourly_variables()}</h2>
				<button
					class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					onclick={onClose}
					aria-label={m.variables_close()}
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

			<div class="flex flex-1 flex-col gap-6 px-5 py-4">
				<section>
					<h3 class="mb-2 text-[11px] font-bold tracking-wider text-primary uppercase">
						{m.variables_table_section()}
					</h3>
					<div class="flex flex-col gap-1">
						{#each tableRowOrder as key, i (key)}
							<div class="group flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-muted/60">
								<Checkbox
									id="table_var_{key}"
									class="cursor-pointer"
									checked={$storedVariablePrefs.table?.[key] ?? true}
									onCheckedChange={() => toggle('table', key)}
								/>
								<Label class="flex-1 cursor-pointer text-sm" for="table_var_{key}">
									{tableVariableLabels[key] ?? key}
								</Label>
								<!-- reorder: rows render in this exact order in the table -->
								<div
									class="flex items-center opacity-40 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
								>
									<button
										class="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
										onclick={() => moveRow(key, -1)}
										disabled={i === 0}
										aria-label={m.variables_move_up({ variable: tableVariableLabels[key] ?? key })}
									>
										<svg
											class="h-3.5 w-3.5"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
											stroke-width="2.25"
										>
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 14l7-7 7 7" />
										</svg>
									</button>
									<button
										class="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
										onclick={() => moveRow(key, 1)}
										disabled={i === tableRowOrder.length - 1}
										aria-label={m.variables_move_down({
											variable: tableVariableLabels[key] ?? key
										})}
									>
										<svg
											class="h-3.5 w-3.5"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
											stroke-width="2.25"
										>
											<path stroke-linecap="round" stroke-linejoin="round" d="M19 10l-7 7-7-7" />
										</svg>
									</button>
								</div>
							</div>
						{/each}
					</div>
				</section>

				<p class="text-xs text-muted-foreground">
					{m.variables_charts_hint_before()}
					<span class="font-semibold">{m.meteograms_customize()}</span>
					{m.variables_charts_hint_after()}
				</p>
			</div>

			<div class="border-t border-border px-5 py-3">
				<button
					class="cursor-pointer text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
					onclick={resetDefaults}
				>
					{m.action_reset_defaults()}
				</button>
			</div>
		</aside>
	</div>
{/if}
