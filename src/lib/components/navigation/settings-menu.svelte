<script lang="ts">
	import SettingsIcon from '@lucide/svelte/icons/settings';

	import * as Popover from '$lib/components/ui/popover';

	import * as m from '$lib/paraglide/messages';

	import SettingsContent from './settings-content.svelte';

	let open = $state(false);
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground shadow-xs transition-[border-color,box-shadow,color,background-color] hover:border-primary/50 hover:bg-muted hover:text-foreground hover:shadow-md data-[state=open]:border-primary/50 data-[state=open]:bg-muted data-[state=open]:text-foreground md:h-10 md:w-10"
		aria-label={m.settings_title()}
		title={m.settings_title()}
	>
		<SettingsIcon class="h-4.5 w-5 shrink-0" strokeWidth={1.75} />
	</Popover.Trigger>

	<Popover.Content align="end" side="bottom" class="w-72 border-border">
		<SettingsContent onLanguageSelect={() => (open = false)} />
	</Popover.Content>
</Popover.Root>
