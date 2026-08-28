<script lang="ts">
	import { onMount } from 'svelte';

	import * as m from '$lib/paraglide/messages';

	interface BeforeInstallPromptEvent extends Event {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	let online = $state(true);
	let updateAvailable = $state(false);
	let installPrompt = $state<BeforeInstallPromptEvent | null>(null);
	let registration = $state<ServiceWorkerRegistration | null>(null);
	let reloadOnControllerChange = false;

	onMount(() => {
		online = navigator.onLine;
		const setOnline = () => (online = true);
		const setOffline = () => (online = false);
		window.addEventListener('online', setOnline);
		window.addEventListener('offline', setOffline);

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

		const onControllerChange = () => {
			if (reloadOnControllerChange) window.location.reload();
		};
		navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);

		let disposed = false;
		let updateFound: (() => void) | null = null;
		if ('serviceWorker' in navigator) {
			void navigator.serviceWorker.ready.then((readyRegistration) => {
				if (disposed) return;
				registration = readyRegistration;
				updateAvailable = Boolean(readyRegistration.waiting);
				updateFound = () => {
					const installing = readyRegistration.installing;
					if (!installing) return;
					installing.addEventListener('statechange', () => {
						if (installing.state === 'installed' && navigator.serviceWorker.controller) {
							updateAvailable = true;
						}
					});
				};
				readyRegistration.addEventListener('updatefound', updateFound);
			});
		}

		return () => {
			disposed = true;
			window.removeEventListener('online', setOnline);
			window.removeEventListener('offline', setOffline);
			window.removeEventListener('beforeinstallprompt', onInstallPrompt);
			navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
			if (registration && updateFound) registration.removeEventListener('updatefound', updateFound);
		};
	});

	async function install(): Promise<void> {
		const prompt = installPrompt;
		if (!prompt) return;
		await prompt.prompt();
		await prompt.userChoice;
		installPrompt = null;
	}

	function applyUpdate(): void {
		reloadOnControllerChange = true;
		registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
	}
</script>

{#if !online || updateAvailable || installPrompt}
	<div
		class="app-status fixed right-3 left-3 z-55 flex justify-center md:right-4 md:bottom-4 md:left-auto"
	>
		<div
			class="flex min-h-11 max-w-md items-center gap-3 rounded-2xl border border-border bg-card/95 px-3.5 py-2 text-sm shadow-xl backdrop-blur"
			role="status"
			aria-live="polite"
		>
			{#if !online}
				<span class="relative flex h-2.5 w-2.5 shrink-0">
					<span
						class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60"
					></span>
					<span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500"></span>
				</span>
				<span class="font-medium">{m.app_offline()}</span>
			{:else if updateAvailable}
				<span class="font-medium">{m.app_update_available()}</span>
				<button
					type="button"
					class="min-h-9 cursor-pointer rounded-lg bg-primary px-3 font-bold text-primary-foreground active:scale-[0.98]"
					onclick={applyUpdate}
				>
					{m.app_update_now()}
				</button>
			{:else if installPrompt}
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
