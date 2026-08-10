<script lang="ts">
	import type { Theme } from '$lib/stores/settings';

	interface Props {
		theme: Theme;
		class?: string;
	}

	let { theme, class: className = 'h-4.5 w-4.5' }: Props = $props();
</script>

{#if theme === 'light'}
	<!-- sun -->
	<svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75">
		<circle cx="12" cy="12" r="4" />
		<path
			stroke-linecap="round"
			d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41"
		/>
	</svg>
{:else if theme === 'dark'}
	<!-- moon -->
	<svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75">
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
		/>
	</svg>
{:else}
	<!-- monitor (system) -->
	<svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75">
		<rect x="3" y="4" width="18" height="13" rx="2" />
		<path stroke-linecap="round" d="M8 21h8m-4-4v4" />
	</svg>
{/if}
