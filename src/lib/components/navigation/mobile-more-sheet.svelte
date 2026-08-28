<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { Dialog as DialogPrimitive } from 'bits-ui';

	import * as Dialog from '$lib/components/ui/dialog';

	import * as m from '$lib/paraglide/messages';

	import MobileMoreMenu from './mobile-more-menu.svelte';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();
</script>

<Dialog.Portal>
	<Dialog.Overlay class="bg-black/30 md:hidden" />
	<DialogPrimitive.Content
		class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom-full data-[state=closed]:slide-out-to-bottom-full fixed right-0 bottom-0 left-0 z-50 flex w-full flex-col overflow-hidden rounded-t-3xl border-t border-sidebar-border bg-sidebar shadow-2xl duration-200 outline-none md:hidden"
		style="max-height:calc(100dvh - env(safe-area-inset-top, 0px) - 0.75rem);padding-bottom:env(safe-area-inset-bottom, 0px)"
	>
		<div
			class="flex h-12 shrink-0 items-center justify-between border-b border-sidebar-border/70 px-4"
		>
			<Dialog.Title class="text-sm font-bold text-sidebar-foreground">{m.nav_more()}</Dialog.Title>
			<Dialog.Close
				class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
				aria-label={m.action_close()}
				title={m.action_close()}
			>
				<XIcon class="h-4 w-4" strokeWidth={2} />
			</Dialog.Close>
		</div>

		<MobileMoreMenu {onClose} />
	</DialogPrimitive.Content>
</Dialog.Portal>
