<script lang="ts">
	import { onMount } from 'svelte';

	import { type Theme, storedTheme } from '$lib/stores/settings';

	import * as Popover from '$lib/components/ui/popover';

	import LanguageOptions from '$lib/components/language-options.svelte';
	import UnitOptions from '$lib/components/unit-options.svelte';

	import * as m from '$lib/paraglide/messages';

	import ThemeIcon from './theme-icon.svelte';

	// The topbar has room for one control on a phone, so units, theme and
	// language share this menu instead of each carrying its own trigger.
	const THEMES: { value: Theme; label: () => string }[] = [
		{ value: 'system', label: m.theme_system },
		{ value: 'light', label: m.theme_light },
		{ value: 'dark', label: m.theme_dark }
	];

	let open = $state(false);
	let canShare = $state(false);

	onMount(() => {
		canShare = typeof navigator.share === 'function';
	});

	async function shareForecast(): Promise<void> {
		if (!canShare) return;
		await navigator.share({ title: document.title, url: window.location.href }).catch(() => {});
		open = false;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground md:h-9 md:w-9"
		aria-label={m.settings_title()}
		title={m.settings_title()}
	>
		<!-- gear -->
		<svg
			class="h-4.5 w-4.5"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			stroke-width="1.75"
		>
			<circle cx="12" cy="12" r="3" />
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
			/>
		</svg>
	</Popover.Trigger>

	<Popover.Content align="end" class="w-72 border-border">
		<div class="flex flex-col gap-4">
			{#if canShare}
				<button
					type="button"
					class="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
					onclick={shareForecast}
				>
					<svg
						class="h-4.5 w-4.5 text-primary"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="1.75"
					>
						<circle cx="18" cy="5" r="3" />
						<circle cx="6" cy="12" r="3" />
						<circle cx="18" cy="19" r="3" />
						<path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
					</svg>
					{m.share_forecast()}
				</button>
			{/if}

			<UnitOptions />

			<div>
				<span
					class="mb-1.5 block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
				>
					{m.theme_label()}
				</span>
				<div class="flex gap-1 rounded-lg bg-muted p-0.5">
					{#each THEMES as option (option.value)}
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

			<LanguageOptions onSelect={() => (open = false)} />
		</div>
	</Popover.Content>
</Popover.Root>
