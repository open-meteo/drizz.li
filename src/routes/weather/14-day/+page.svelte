<script lang="ts">
	import { onMount } from 'svelte';

	import { goto } from '$app/navigation';

	import { buildLocationRoute } from '$lib/utils/location';

	import { href } from '$lib/i18n';
	import { initialLocation } from '$lib/services/geolocation';

	// at build time this page knows nothing about the visitor, so the redirect
	// target is resolved in the browser rather than baked to the default city
	// during prerender: the location this browser last looked at, or - on a first
	// visit - the one Cloudflare derives from the request (see initialLocation)
	onMount(() => {
		void initialLocation().then((location) => {
			goto(href('/weather/14-day/[location]', { location: buildLocationRoute(location) }), {
				replaceState: true
			});
		});
	});
</script>
