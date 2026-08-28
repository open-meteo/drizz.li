<script lang="ts">
	import SettingsIcon from '@lucide/svelte/icons/settings';

	import * as Popover from '$lib/components/ui/popover';

	import * as m from '$lib/paraglide/messages';

	import SettingsContent from './settings-content.svelte';

	interface Props {
		collapsed?: boolean;
	}

	let { collapsed = false }: Props = $props();

	let open = $state(false);
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="flex w-full cursor-pointer items-center rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-foreground opacity-70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:opacity-100 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground data-[state=open]:opacity-100 {collapsed
			? 'justify-center'
			: ''}"
		aria-label={m.settings_title()}
		title={m.settings_title()}
	>
		<SettingsIcon class="h-4.5 w-5 shrink-0" strokeWidth={1.75} />
		{#if !collapsed}<span class="ml-2.5 whitespace-nowrap">{m.settings_title()}</span>{/if}
	</Popover.Trigger>

	<Popover.Content align="start" side="right" class="w-72 border-border">
		<SettingsContent onLanguageSelect={() => (open = false)} />
	</Popover.Content>
</Popover.Root>
