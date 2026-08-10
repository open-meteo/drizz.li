<script lang="ts">
	import { onMount } from 'svelte';

	import { goto } from '$app/navigation';

	import { localizeHref } from '$lib/paraglide/runtime';

	// Same reasoning as the root redirect: resolved in the browser so the
	// visitor's language is known (see routes/+page.svelte).
	onMount(() => {
		goto(localizeHref('/weather/week/'), { replaceState: true });
	});
</script>
