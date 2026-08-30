<script lang="ts">
	import { type Theme, storedTheme } from '$lib/stores/settings';

	import LanguageOptions from '$lib/components/language-options.svelte';
	import UnitOptions from '$lib/components/unit-options.svelte';

	import * as m from '$lib/paraglide/messages';

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
</script>

<div class="flex flex-col gap-4">
	<UnitOptions />

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
