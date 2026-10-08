<script lang="ts">
	import { onMount } from 'svelte';
	import { online } from 'svelte/reactivity/window';
	import { fade } from 'svelte/transition';

	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import XIcon from '@lucide/svelte/icons/x';

	import { updated } from '$app/state';

	import { Button } from '$lib/components/ui/button';

	import * as m from '$lib/paraglide/messages';

	interface BeforeInstallPromptEvent extends Event {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	let updateDismissed = $state(false);
	let installPrompt = $state<BeforeInstallPromptEvent | null>(null);
	let status = $derived.by(() => {
		if (online.current === false) return 'offline';
		if (online.current !== true) return null;
		if (updated.current && !updateDismissed) return 'update';
		return installPrompt ? 'install' : null;
	});

	onMount(() => {
		let returningVisit = false;
		try {
			const visits = Number(localStorage.getItem('app_visits') ?? '0');
			returningVisit = visits > 0;
			localStorage.setItem('app_visits', String(visits + 1));
		} catch {
			// Installation still works when storage is disabled; only the delayed
			// suggestion is skipped.
		}

		const onInstallPrompt = (event: Event) => {
			const prompt = event as BeforeInstallPromptEvent;
			prompt.preventDefault();
			if (returningVisit) installPrompt = prompt;
		};
		window.addEventListener('beforeinstallprompt', onInstallPrompt);
		const onInstalled = () => (installPrompt = null);
		window.addEventListener('appinstalled', onInstalled);

		return () => {
			window.removeEventListener('beforeinstallprompt', onInstallPrompt);
			window.removeEventListener('appinstalled', onInstalled);
		};
	});

	async function install(): Promise<void> {
		const prompt = installPrompt;
		if (!prompt) return;
		await prompt.prompt();
		await prompt.userChoice;
		installPrompt = null;
	}
</script>

{#if status}
	<div
		transition:fade={{ duration: 200 }}
		class="app-status fixed right-3 left-3 z-55 flex justify-center md:right-4 md:bottom-4 md:left-auto"
	>
		<div
			class="relative flex min-h-11 max-w-md items-center gap-3 rounded-2xl border border-border bg-card/95 px-3.5 py-2 text-sm shadow-xl backdrop-blur"
			role="status"
			aria-live="polite"
		>
			{#if status === 'offline'}
				<span class="relative flex h-2.5 w-2.5 shrink-0">
					<span
						class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60"
					></span>
					<span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500"></span>
				</span>
				<span class="font-medium">{m.app_offline()}</span>
			{:else if status === 'update'}
				<div class="flex flex-col gap-3 pr-6 sm:flex-row sm:items-center">
					<div class="grid gap-1">
						<div class="font-semibold">{m.update_title()}</div>
						<div>{m.update_message()}</div>
					</div>
					<Button
						variant="outline"
						class="h-8 shrink-0 gap-2 self-start sm:self-auto"
						onclick={() => location.reload()}
					>
						<RefreshCwIcon class="size-3.5" />
						{m.update_reload()}
					</Button>
				</div>
				<Button
					variant="ghost"
					class="absolute top-1 right-1 size-7 rounded-md p-0 text-foreground/50 hover:text-foreground"
					aria-label={m.update_dismiss()}
					onclick={() => (updateDismissed = true)}
				>
					<XIcon class="size-4" />
				</Button>
			{:else if status === 'install'}
				<svg
					class="h-5 w-5 shrink-0 text-primary"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					stroke-width="1.75"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14"
					/>
				</svg>
				<button type="button" class="cursor-pointer font-bold text-primary" onclick={install}>
					{m.app_install()}
				</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	@media (max-width: 767px) {
		.app-status {
			bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
