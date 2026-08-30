<script lang="ts">
	import HistoryIcon from '@lucide/svelte/icons/history';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TrendingUpIcon from '@lucide/svelte/icons/trending-up';

	import { page } from '$app/stores';

	import { storedLocation } from '$lib/stores/settings';

	import { buildLocationRoute } from '$lib/utils/location';

	import { href, routePath } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let currentPath = $derived(routePath($page.url.pathname));
	let locationRoute = $derived(buildLocationRoute($storedLocation));

	const links = [
		{
			title: m.nav_seasonal,
			path: '/weather/seasonal',
			href: () => href('/weather/seasonal/[location]', { location: locationRoute }),
			icon: TrendingUpIcon
		},
		{
			title: m.nav_historical,
			path: '/weather/historical',
			href: () => href('/weather/historical/[location]', { location: locationRoute }),
			icon: HistoryIcon
		},
		{
			title: m.legal_about,
			path: '/about',
			href: () => href('/about'),
			icon: InfoIcon
		}
	];

	const isActive = (path: string) => currentPath === path || currentPath.startsWith(`${path}/`);
</script>

<div class="min-h-0 overflow-y-auto bg-sidebar">
	<nav class="space-y-1 px-2 py-3" aria-label={m.nav_more()}>
		{#each links as link (link.path)}
			{@const active = isActive(link.path)}
			<a
				href={link.href()}
				class="relative flex items-center rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-foreground opacity-70 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:opacity-100 {active
					? 'bg-sidebar-accent text-sidebar-primary! opacity-100! font-semibold! nav-active'
					: ''}"
				onclick={onClose}
				aria-current={active ? 'page' : undefined}
			>
				<link.icon class="h-4.5 w-5 shrink-0" strokeWidth={1.75} />
				<span class="ml-2.5">{link.title()}</span>
			</a>
		{/each}
	</nav>

	<nav
		aria-label={m.legal_nav()}
		class="flex flex-wrap gap-x-3 gap-y-1 border-t border-sidebar-border px-4 py-3 text-[11px] text-sidebar-foreground/70"
	>
		<a
			class="hover:text-sidebar-foreground hover:underline"
			href={href('/legal/imprint')}
			onclick={onClose}>{m.legal_imprint()}</a
		>
		<a
			class="hover:text-sidebar-foreground hover:underline"
			href={href('/legal/privacy')}
			onclick={onClose}>{m.legal_privacy()}</a
		>
	</nav>
</div>

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
