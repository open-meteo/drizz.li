<script lang="ts">
	import { onMount } from 'svelte';

	import { goto } from '$app/navigation';

	import { localizeHref } from '$lib/paraglide/runtime';

	// Deliberately a client-side redirect, not one from `load`: this page is
	// prerendered, so a redirect resolved at build time would bake in the base
	// locale and every visitor would land on English. Deciding it here lets the
	// locale strategy read the URL, the cookie and finally the browser's own
	// languages before choosing.
	onMount(() => {
		goto(localizeHref('/weather/week/'), { replaceState: true });
	});
</script>
