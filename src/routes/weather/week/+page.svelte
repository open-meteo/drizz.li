<script lang="ts">
	import { onMount } from 'svelte';

	import { goto } from '$app/navigation';

	import { storedUnits } from '$lib/stores/settings';

	import { buildLocationRoute } from '$lib/utils/location';

	import { href } from '$lib/i18n';
	import { initialLocation } from '$lib/services/geolocation';

	import DailyStripSticky from './[location]/DailyStripSticky.svelte';
	import WeekSkeleton from './[location]/WeekSkeleton.svelte';

	// at build time this page knows nothing about the visitor, so the redirect
	// target is resolved in the browser rather than baked to the default city
	// during prerender: the location this browser last looked at, or - on a first
	// visit - the one Cloudflare derives from the request (see initialLocation)
	onMount(() => {
		void initialLocation().then((location) => {
			goto(href('/weather/week/[location]', { location: buildLocationRoute(location) }), {
				replaceState: true
			});
		});
	});

	// Only ever read by the strip's real branch, which this page never renders.
	const placeholderDay = new Date();
</script>

<!-- Asking where the visitor is takes anything from a few milliseconds (a
     remembered location) to a couple of seconds (a first visit, waiting on the
     edge geo lookup and then the geocoder), and this page is what is on screen
     for all of it. It shows the page it is about to hand over to rather than an
     empty column - the same placeholders, from the same component, so the
     located page drops straight into them without a flicker. -->
<div style="timeline-scope: --daystrip-sentinel">
	<DailyStripSticky
		daily={null}
		selectedDay={placeholderDay}
		units={$storedUnits}
		onSelectDay={() => {}}
	/>

	<!-- `relative` on each wrapper is what lets the placeholder dissolve over the
	     real content on the page that replaces this one (see skeletonOut). -->
	<div class="relative"><WeekSkeleton part="table" /></div>
	<div class="relative"><WeekSkeleton part="summary" /></div>
	<div class="relative"><WeekSkeleton part="charts" /></div>
</div>
