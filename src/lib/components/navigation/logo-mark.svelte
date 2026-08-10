<script lang="ts">
	// umbrella-with-rain mark (matches the favicon); shared by the sidebar home
	// link and the footer so the brand reads the same in both places
	interface Props {
		class?: string;
	}

	let { class: className = 'h-5 w-5' }: Props = $props();
</script>

<svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.75">
	<!-- rain falls from above onto the canopy -->
	<path stroke-linecap="round" d="M4.5 3v.01M19.5 3v.01M8.5 1.5v.01M15.5 2.5v.01" />
	<path stroke-linecap="round" d="M12 4.5V6" />
	<path
		fill="currentColor"
		stroke="none"
		d="M4 14a8 8 0 0 1 16 0c-.66-1-1.99-1-2.66 0-.67-1-2-1-2.67 0-.67-1-2-1-2.67 0-.67-1-2-1-2.67 0C8.66 13 7.33 13 6.66 14 6 13 4.66 13 4 14Z"
	/>
	<path stroke-linecap="round" d="M12 14v5a1.9 1.9 0 0 1-3.8 0" />
</svg>
