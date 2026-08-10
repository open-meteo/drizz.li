<script lang="ts">
	import { page } from '$app/stores';

	import LanguageOptions from '$lib/components/language-options.svelte';
	import * as Popover from '$lib/components/ui/popover';

	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	// the URL decides the locale, so re-read it on navigation
	let current = $derived.by(() => {
		void $page.url.pathname;
		return getLocale();
	});

	let open = $state(false);
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border/70 px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
		aria-label={m.language_label()}
		title={m.language_label()}
	>
		<!-- globe -->
		<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75">
			<circle cx="12" cy="12" r="9" />
			<path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
		</svg>
		<span class="uppercase">{current}</span>
	</Popover.Trigger>
	<Popover.Content align="end" class="w-56 border-border">
		<LanguageOptions onSelect={() => (open = false)} />
	</Popover.Content>
</Popover.Root>
