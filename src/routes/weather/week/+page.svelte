<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';

	import { goto } from '$app/navigation';

	import { storedLocation } from '$lib/stores/settings';

	import { buildLocationRoute } from '$lib/utils/location';

	import { href } from '$lib/i18n';

	// at build time this page knows nothing about the visitor, so the redirect
	// target (the persisted location) is resolved in the browser instead of
	// being baked to the default city during prerender
	onMount(() => {
		goto(href('/weather/week/[location]', { location: buildLocationRoute(get(storedLocation)) }), {
			replaceState: true
		});
	});
</script>
