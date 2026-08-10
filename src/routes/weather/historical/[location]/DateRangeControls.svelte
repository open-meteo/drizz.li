<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	interface Props {
		start: string;
		end: string;
		/** Latest selectable date (archive lags real time by a few days). */
		maxDate: string;
		minDate: string;
		onChange: (start: string, end: string) => void;
	}

	let { start, end, maxDate, minDate, onChange }: Props = $props();

	// ─── Presets ────────────────────────────────────────────────────────────────
	const iso = (d: Date): string => d.toISOString().slice(0, 10);
	const addDays = (d: Date, n: number): Date => {
		// local copy inside a pure helper, never held as reactive state
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const c = new Date(d);
		c.setUTCDate(c.getUTCDate() + n);
		return c;
	};

	function applyLastDays(days: number) {
		const endD = new Date(`${maxDate}T00:00:00Z`);
		const startD = addDays(endD, -(days - 1));
		onChange(iso(startD), iso(endD));
	}

	function applyThisMonthLastYear() {
		const end = new Date(`${maxDate}T00:00:00Z`);
		const y = end.getUTCFullYear() - 1;
		const m = end.getUTCMonth();
		const first = new Date(Date.UTC(y, m, 1));
		const last = new Date(Date.UTC(y, m + 1, 0));
		onChange(iso(first), iso(last));
	}

	const presets = [
		{ label: () => m.historical_last_days({ days: 7 }), apply: () => applyLastDays(7) },
		{ label: () => m.historical_last_days({ days: 30 }), apply: () => applyLastDays(30) },
		{ label: () => m.historical_last_days({ days: 90 }), apply: () => applyLastDays(90) },
		{ label: () => m.historical_month_last_year(), apply: applyThisMonthLastYear }
	];

	// ─── Manual inputs ────────────────────────────────────────────────────────────
	// Editable mirrors of the props, re-seeded whenever a preset changes the range.
	let localStart = $state('');
	let localEnd = $state('');
	$effect(() => {
		localStart = start;
		localEnd = end;
	});

	// Keep start <= end and inside the allowed window before emitting.
	function commit() {
		let s = localStart;
		let e = localEnd;
		if (s > e) [s, e] = [e, s];
		if (s < minDate) s = minDate;
		if (e > maxDate) e = maxDate;
		onChange(s, e);
	}
</script>

<div
	class="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-sm sm:flex-row sm:items-end sm:justify-between"
>
	<div class="flex flex-wrap items-end gap-3">
		<div class="grid gap-1">
			<label for="hist-start" class="text-xs font-semibold text-muted-foreground"
				>{m.historical_from()}</label
			>
			<input
				id="hist-start"
				type="date"
				bind:value={localStart}
				min={minDate}
				max={maxDate}
				onchange={commit}
				class="h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
			/>
		</div>
		<div class="grid gap-1">
			<label for="hist-end" class="text-xs font-semibold text-muted-foreground"
				>{m.historical_to()}</label
			>
			<input
				id="hist-end"
				type="date"
				bind:value={localEnd}
				min={minDate}
				max={maxDate}
				onchange={commit}
				class="h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
			/>
		</div>
	</div>

	<div
		class="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-muted p-0.5 text-xs font-semibold"
		role="group"
		aria-label={m.historical_quick_ranges()}
	>
		{#each presets as preset (preset.label())}
			<button
				type="button"
				class="cursor-pointer rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:bg-background hover:text-foreground hover:shadow-sm"
				onclick={preset.apply}
			>
				{preset.label()}
			</button>
		{/each}
	</div>
</div>
