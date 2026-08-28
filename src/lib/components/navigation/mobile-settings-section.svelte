<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import SettingsIcon from '@lucide/svelte/icons/settings';

	import * as m from '$lib/paraglide/messages';

	import SettingsContent from './settings-content.svelte';
</script>

<details class="group">
	<summary
		class="flex cursor-pointer list-none items-center rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-foreground opacity-70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:opacity-100 group-open:bg-sidebar-accent group-open:text-sidebar-accent-foreground group-open:opacity-100"
	>
		<SettingsIcon class="h-4.5 w-5 shrink-0" strokeWidth={1.75} />
		<span class="ml-2.5 flex-1">{m.settings_title()}</span>
		<ChevronDownIcon
			class="h-4 w-4 shrink-0 text-sidebar-foreground/60 transition-transform duration-200 group-open:rotate-180"
			strokeWidth={2}
		/>
	</summary>

	<div class="mt-2 rounded-xl border border-sidebar-border bg-background/75 p-3 shadow-inner">
		<SettingsContent />
	</div>
</details>
