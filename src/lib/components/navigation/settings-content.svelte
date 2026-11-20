<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

	import {
		type Theme,
		storedRecentTimezones,
		storedTheme,
		storedTimezone
	} from '#lib/stores/settings.js';

	import * as Command from '#lib/components/ui/command/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';

	import LanguageOptions from '#lib/components/language-options.svelte';
	import UnitOptions from '#lib/components/unit-options.svelte';

	import * as m from '#lib/paraglide/messages.js';

	import ThemeIcon from './theme-icon.svelte';

	interface Props {
		onLanguageSelect?: () => void;
	}

	let { onLanguageSelect }: Props = $props();

	const themes: { value: Theme; label: () => string }[] = [
		{ value: 'system', label: m.theme_system },
		{ value: 'light', label: m.theme_light },
		{ value: 'dark', label: m.theme_dark }
	];

	const knownTimezones = Intl.supportedValuesOf?.('timeZone') ?? [];

	// Zones picked before lead the list, then the visitor's own zone and UTC:
	// the likeliest picks out of some four hundred.
	let timezones = $derived([
		...new Set([
			'auto',
			...$storedRecentTimezones,
			Intl.DateTimeFormat().resolvedOptions().timeZone,
			'UTC',
			...knownTimezones
		])
	]);

	// also what the search matches against, so "new york" finds America/New_York
	const timezoneLabel = (zone: string) =>
		zone === 'auto' ? m.timezone_auto() : zone.replaceAll('_', ' ');

	let timezoneOpen = $state(false);

	function selectTimezone(zone: string) {
		storedTimezone.set(zone);
		if (zone !== 'auto') {
			storedRecentTimezones.update((recent) =>
				[zone, ...recent.filter((z) => z !== zone)].slice(0, 5)
			);
		}
		timezoneOpen = false;
	}
</script>

<div class="flex flex-col gap-4">
	<UnitOptions />

	<div>
		<span
			class="mb-1.5 block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
		>
			{m.timezone_label()}
		</span>
		<Popover.Root bind:open={timezoneOpen}>
			<Popover.Trigger
				class="flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-lg bg-muted px-2.5 text-[13px] font-semibold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				role="combobox"
				aria-label={m.timezone_label()}
			>
				<span class="truncate">{timezoneLabel($storedTimezone)}</span>
				<ChevronsUpDownIcon class="h-4 w-4 shrink-0 opacity-50" />
			</Popover.Trigger>
			<Popover.Content class="w-(--bits-popover-anchor-width) border-border p-0">
				<Command.Root>
					<Command.Input placeholder={m.timezone_search()} />
					<Command.List>
						<Command.Empty>{m.timezone_no_results()}</Command.Empty>
						<Command.Group>
							{#each timezones as zone (zone)}
								<Command.Item value={timezoneLabel(zone)} onSelect={() => selectTimezone(zone)}>
									<CheckIcon class={$storedTimezone === zone ? undefined : 'text-transparent'} />
									{timezoneLabel(zone)}
								</Command.Item>
							{/each}
						</Command.Group>
					</Command.List>
				</Command.Root>
			</Popover.Content>
		</Popover.Root>
	</div>

	<div>
		<span
			class="mb-1.5 block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
		>
			{m.theme_label()}
		</span>
		<div class="flex gap-1 rounded-lg bg-muted p-0.5">
			{#each themes as option (option.value)}
				{@const active = $storedTheme === option.value}
				<button
					class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-semibold transition-colors {active
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					aria-pressed={active}
					onclick={() => storedTheme.set(option.value)}
				>
					<ThemeIcon theme={option.value} class="h-4 w-4" />
					{option.label()}
				</button>
			{/each}
		</div>
	</div>

	<LanguageOptions onSelect={onLanguageSelect} />
</div>
