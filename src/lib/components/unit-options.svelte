<script lang="ts">
	import { type UnitPrefs, storedUnits } from '$lib/stores/settings';

	import * as m from '$lib/paraglide/messages';

	// each group maps a stored unit key to its selectable options
	const UNIT_GROUPS: {
		key: keyof UnitPrefs;
		label: () => string;
		options: { value: string; label: string }[];
	}[] = [
		{
			key: 'temperature_unit',
			label: m.unit_temperature,
			options: [
				{ value: 'celsius', label: '°C' },
				{ value: 'fahrenheit', label: '°F' }
			]
		},
		{
			key: 'wind_speed_unit',
			label: m.unit_wind_speed,
			options: [
				{ value: 'kmh', label: 'km/h' },
				{ value: 'ms', label: 'm/s' },
				{ value: 'mph', label: 'mph' },
				{ value: 'kn', label: 'kn' }
			]
		},
		{
			key: 'precipitation_unit',
			label: m.unit_precipitation,
			options: [
				{ value: 'mm', label: 'mm' },
				{ value: 'inch', label: 'inch' }
			]
		}
	];

	function setUnit(key: keyof UnitPrefs, value: string) {
		storedUnits.update((u) => ({ ...u, [key]: value }));
	}
</script>

<div class="flex flex-col gap-4">
	{#each UNIT_GROUPS as group (group.key)}
		<div>
			<span
				class="mb-1.5 block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
			>
				{group.label()}
			</span>
			<div class="flex gap-1 rounded-lg bg-muted p-0.5">
				{#each group.options as opt (opt.value)}
					{@const active = $storedUnits[group.key] === opt.value}
					<button
						class="flex-1 cursor-pointer rounded-md px-2 py-1.5 text-[13px] font-semibold transition-colors {active
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'}"
						aria-pressed={active}
						onclick={() => setUnit(group.key, opt.value)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>
	{/each}
</div>
