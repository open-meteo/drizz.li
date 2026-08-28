<script lang="ts">
	import { page } from '$app/stores';

	import { storedLocation } from '$lib/stores/settings';

	import { buildLocationRoute } from '$lib/utils/location';

	import { href, routePath } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	import LogoMark from './logo-mark.svelte';
	import SettingsMenu from './settings-menu.svelte';

	interface Props {
		collapsed?: boolean;
		onToggle?: () => void;
	}

	let { collapsed = false, onToggle }: Props = $props();

	const links = [
		{
			title: m.nav_week,
			url: '/weather/week' as const,
			route: '/weather/week/[location]' as const,
			iconPaths: [
				'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'
			]
		},
		{
			title: m.nav_compare,
			url: '/weather/compare' as const,
			route: '/weather/compare/[location]' as const,
			iconPaths: ['M13 7h8m0 0v8m0-8l-8 8-4-4-6 6']
		},
		{
			title: m.nav_14day,
			url: '/weather/14-day' as const,
			route: '/weather/14-day/[location]' as const,
			iconPaths: [
				'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z'
			]
		},
		{
			title: m.nav_seasonal,
			url: '/weather/seasonal' as const,
			route: '/weather/seasonal/[location]' as const,
			// rising trend line (long-range outlook)
			iconPaths: ['M3 17l6-6 4 4 7-7', 'M16 8h5v5']
		},
		{
			title: m.nav_historical,
			url: '/weather/historical' as const,
			route: '/weather/historical/[location]' as const,
			// clock with a counter-clockwise arrow (history)
			iconPaths: ['M12 8v4l3 2', 'M3.5 9a9 9 0 1 0 2.2-3.6L3 8m0-4.5V8h4.5']
		},
		{
			title: m.nav_maps,
			url: '/weather/maps' as const,
			// Heroicons "map" outline icon
			iconPaths: [
				'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7'
			]
		}
	];

	// the URL carries a locale prefix; compare the neutral path behind it
	let currentPath = $derived(routePath($page.url.pathname));

	// Link straight to the location page instead of the bare redirect route: it
	// saves a navigation, and the page cross-fade can then wait for the real
	// page's data instead of flashing through an empty redirect stub.
	let locationRoute = $derived(buildLocationRoute($storedLocation));

	const isActive = (url: string) => {
		return currentPath === url || currentPath.startsWith(url + '/');
	};
</script>

<aside
	class="flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200"
	class:w-55={!collapsed}
	class:w-14={collapsed}
>
	<!-- Sidebar header: same height as the topbar so the borders align; the
	     home link fills the entire row, padding included -->
	<div class="flex h-14 shrink-0 items-stretch border-b border-sidebar-border">
		<a
			href={href('/weather/week/[location]', { location: locationRoute })}
			class="flex flex-1 items-center gap-2.5 transition-colors hover:bg-sidebar-accent {collapsed
				? 'justify-center'
				: 'px-4'}"
			aria-label={m.nav_home()}
		>
			<div
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
			>
				<LogoMark />
			</div>
			{#if !collapsed}
				<span class="text-sm font-bold tracking-tight whitespace-nowrap text-sidebar-foreground">
					Drizz.li
				</span>
			{/if}
		</a>
	</div>

	<!-- Navigation links -->
	<nav class="flex-1 space-y-1 px-2 py-3">
		{#each links as link (link.url)}
			{@const active = isActive(link.url)}
			<a
				href={link.route ? href(link.route, { location: locationRoute }) : href(link.url)}
				class="relative flex items-center rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-foreground opacity-70 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:opacity-100 {active
					? 'bg-sidebar-accent text-sidebar-primary! opacity-100! font-semibold! nav-active'
					: ''}"
				title={collapsed ? link.title() : undefined}
			>
				<div class="flex h-5 w-5 shrink-0 items-center justify-center">
					<svg
						class="h-4.5 w-4.5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="1.75"
					>
						{#each link.iconPaths as d (d)}
							<path stroke-linecap="round" stroke-linejoin="round" {d} />
						{/each}
					</svg>
				</div>
				{#if !collapsed}
					<span class="ml-2.5 whitespace-nowrap">{link.title()}</span>
				{/if}
			</a>
		{/each}
	</nav>

	<!-- Settings live with the main navigation so they remain reachable when a
	     full-bleed page (notably Maps) omits the location header. -->
	<div class="border-t border-sidebar-border px-2 py-3">
		<SettingsMenu {collapsed} />
	</div>

	<!-- Collapse toggle (desktop sidebar only; the mobile drawer omits onToggle) -->
	{#if onToggle}
		<div class="border-t border-sidebar-border px-2 py-3">
			<button
				class="relative flex w-full cursor-pointer items-center rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-foreground opacity-70 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:opacity-100"
				onclick={onToggle}
				title={collapsed ? m.nav_expand_sidebar() : m.nav_collapse_sidebar()}
			>
				<div class="flex h-5 w-5 shrink-0 items-center justify-center">
					<svg
						class="h-4.5 w-4.5 transition-transform duration-200"
						class:rotate-180={collapsed}
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						stroke-width="1.75"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
						/>
					</svg>
				</div>
				{#if !collapsed}
					<span class="ml-2.5 whitespace-nowrap">{m.nav_collapse()}</span>
				{/if}
			</button>
		</div>
	{/if}
</aside>

<style>
	.nav-active::before {
		content: '';
		position: absolute;
		left: 0;
		top: 50%;
		transform: translateY(-50%);
		width: 3px;
		height: 60%;
		border-radius: 0 3px 3px 0;
		background: var(--sidebar-primary);
	}
</style>
