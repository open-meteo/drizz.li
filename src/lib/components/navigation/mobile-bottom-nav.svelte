<script lang="ts">
	import { page } from '$app/stores';

	import { storedLocation } from '$lib/stores/settings';

	import { buildLocationRoute } from '$lib/utils/location';

	import * as Dialog from '$lib/components/ui/dialog';

	import { href, routePath } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		moreOpen?: boolean;
	}

	let { moreOpen = false }: Props = $props();

	const tabs = [
		{
			label: m.nav_forecast,
			url: '/weather/week' as const,
			getHref: () => href('/weather/week/[location]', { location: locationRoute }),
			icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'
		},
		{
			label: m.nav_14day_short,
			url: '/weather/14-day' as const,
			getHref: () => href('/weather/14-day/[location]', { location: locationRoute }),
			icon: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z'
		},
		{
			label: m.nav_compare_short,
			url: '/weather/compare' as const,
			getHref: () => href('/weather/compare/[location]', { location: locationRoute }),
			icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6'
		},
		{
			label: m.nav_maps,
			url: '/weather/maps' as const,
			getHref: () => href('/weather/maps'),
			icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7'
		}
	];

	let currentPath = $derived(routePath($page.url.pathname));
	let locationRoute = $derived(buildLocationRoute($storedLocation));
	const isActive = (url: string) => currentPath === url || currentPath.startsWith(`${url}/`);
	let moreActive = $derived(
		moreOpen ||
			['/weather/seasonal', '/weather/historical', '/about', '/legal'].some((path) =>
				currentPath.startsWith(path)
			)
	);
</script>

<nav
	class="mobile-bottom-nav fixed right-0 bottom-0 left-0 z-45 grid grid-cols-5 border-t border-border/80 bg-background/92 px-1 backdrop-blur-xl md:hidden"
	aria-label={m.mobile_navigation()}
>
	{#each tabs as tab (tab.url)}
		{@const active = isActive(tab.url)}
		<a
			href={tab.getHref()}
			class="relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-colors active:bg-muted {active
				? 'text-primary'
				: 'text-muted-foreground'}"
			aria-current={active ? 'page' : undefined}
		>
			{#if active}<span class="absolute top-1 h-0.5 w-5 rounded-full bg-primary"></span>{/if}
			<svg
				class="h-5 w-5"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				stroke-width={active ? 2.25 : 1.75}
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d={tab.icon} />
			</svg>
			<span class="w-full truncate text-center">{tab.label()}</span>
		</a>
	{/each}

	<Dialog.Trigger
		type="button"
		class="relative flex min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-colors active:bg-muted {moreActive
			? 'text-primary'
			: 'text-muted-foreground'}"
		aria-expanded={moreOpen}
	>
		{#if moreActive}<span class="absolute top-1 h-0.5 w-5 rounded-full bg-primary"></span>{/if}
		<svg
			class="h-5 w-5"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			stroke-width={moreActive ? 2.25 : 1.75}
			aria-hidden="true"
		>
			<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
			<circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
			<circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
		</svg>
		<span>{m.nav_more()}</span>
	</Dialog.Trigger>
</nav>

<style>
	.mobile-bottom-nav {
		height: calc(4rem + env(safe-area-inset-bottom, 0px));
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}
</style>
