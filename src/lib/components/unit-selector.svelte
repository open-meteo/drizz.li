<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import UnitOptions from '$lib/components/unit-options.svelte';

	import * as m from '$lib/paraglide/messages';
</script>

<Popover.Root>
	<Popover.Trigger
		class="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
		aria-label={m.units_aria()}
		title={m.units_title()}
	>
		<!-- gauge icon -->
		<svg
			class="h-4.5 w-4.5"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			stroke-width="1.75"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M4.5 15a7.5 7.5 0 1 1 15 0M12 15l3.2-3.2"
			/>
			<circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
		</svg>
	</Popover.Trigger>
	<Popover.Content align="end" class="w-64 border-border">
		<UnitOptions />
	</Popover.Content>
</Popover.Root>
