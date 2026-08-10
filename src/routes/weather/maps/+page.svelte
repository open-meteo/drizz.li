<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	import { mapTransitionCover, reportPageReady } from '$lib/stores/page-transition.svelte';
	import { storedLocation, storedModel, storedTheme } from '$lib/stores/settings';

	import { mapsDomainForModel } from '$lib/utils/maps-domain';

	import * as m from '$lib/paraglide/messages';

	// Hash piping, both directions:
	// - inbound: a #zoom/lat/lng(/bearing/pitch) hash on OUR url seeds the
	//   map, so positions can be bookmarked/shared via drizzli links
	// - outbound: the (cross-origin) map posts its hash here on every moveend;
	//   we mirror it into our url with replaceState. hashOverride is only set
	//   once on mount, so these mirror updates never reload the iframe.
	let hashOverride = $state<string | null>(null);
	let iframeEl = $state<HTMLIFrameElement | null>(null);
	let mapReady = $state(false);
	let frameLoaded = $state(false);

	// The map is a cross-origin iframe: until it has loaded there is nothing here
	// but an empty panel, and a page transition that ends before then cross-fades
	// the old page into that blank. Reporting readiness holds the transition (and
	// then the loading overlay) until there is actually a map to fade into.
	// `om-maps:ready` is the good signal; the iframe's own load event is the
	// backstop, so a map that fails to boot still releases the page.
	reportPageReady(() => mapReady || frameLoaded);

	// The map stays under an opaque cover until it is ready, so it fades up from
	// a clean panel instead of flashing the iframe's white boot document (worst
	// in dark mode). The same cover is what makes navigation transitions work at
	// all here: a cross-origin iframe is never painted into a view transition
	// snapshot, so the cover is raised again just before a departure is captured
	// (see mapTransitionCover) - both snapshots then hold real pixels.
	let revealed = $derived(mapReady || frameLoaded);

	const postToMap = (message: Record<string, unknown>) => {
		iframeEl?.contentWindow?.postMessage(message, MAPS_ORIGIN);
	};

	// Local maps dev server (open-meteo/maps); production: https://maps.open-meteo.com
	// Run drizzli on a different port so the map keeps 5173 to itself.
	// const MAPS_ORIGIN = 'http://localhost:5173';
	const MAPS_ORIGIN = 'https://maps.open-meteo.com';

	const MAP_HASH_RE = /^#\d+(\.\d+)?\/-?\d+(\.\d+)?\/-?\d+(\.\d+)?/;

	onMount(() => {
		const initialHash = window.location.hash;
		hashOverride = MAP_HASH_RE.test(initialHash) ? initialHash : null;

		const onMessage = (event: MessageEvent) => {
			if (event.origin !== MAPS_ORIGIN) return;
			const { type, hash, domains } = (event.data ?? {}) as {
				type?: string;
				hash?: string;
				domains?: string[];
			};
			if (type === 'om-maps:hash') {
				if (!hash || !MAP_HASH_RE.test(hash)) return;
				history.replaceState(history.state, '', hash);
			} else if (type === 'om-maps:ready' && Array.isArray(domains)) {
				// The map is loaded and advertises which domains it can render;
				// switch it to the selected model and our theme. The domain is
				// omitted for best_match and models the map does not serve,
				// keeping the map's own default. Re-fires on iframe reloads.
				mapReady = true;
				const domain = mapsDomainForModel($storedModel, new Set(domains));
				postToMap({ type: 'om-maps:set', ...(domain && { domain }), theme: $storedTheme });
			}
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});

	// the embedded map understands maplibre's #zoom/lat/lng hash, so the iframe
	// opens focused on the selected location (zoomed out to regional scale);
	// picking a new location while on this page recenters the map
	const iframeSrc = $derived(
		`${MAPS_ORIGIN}/${
			hashOverride ??
			`#6/${$storedLocation.latitude.toFixed(3)}/${$storedLocation.longitude.toFixed(3)}`
		}`
	);

	// forward theme switches live; the initial theme travels with the
	// ready response above (the map ignores no-op updates)
	$effect(() => {
		const theme = $storedTheme;
		if (!mapReady) return;
		postToMap({ type: 'om-maps:set', theme });
	});
</script>

<svelte:head>
	<title>{m.page_maps_title()} | Open-Meteo.com</title>
	<link rel="canonical" href="https://open-meteo.com/weather/maps" />
	<meta name="description" content="Interactive weather map powered by Open-Meteo" />
</svelte:head>

<!-- Full-bleed map: the layout drops its padding for this route. The map
     follows our theme through the color-scheme declared on :root/.dark -->
<div class="relative h-full w-full bg-background">
	<!-- allow="cross-origin-isolated" delegates SharedArrayBuffer use to the
	     map; it only takes effect when this site itself is served with
	     COOP/COEP headers (see README, Deployment) -->
	<iframe
		bind:this={iframeEl}
		src={iframeSrc}
		title={m.maps_iframe_title()}
		loading="lazy"
		allowfullscreen
		allow="cross-origin-isolated"
		referrerpolicy="no-referrer"
		onload={() => (frameLoaded = true)}
		class="block h-full w-full border-0"
		class:invisible={$mapTransitionCover}
		sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
	></iframe>

	<!-- No `in:` transition on purpose: when the cover comes back for a
	     departure it has to be at full opacity by the time the snapshot is
	     taken, not fading towards it. The iframe is additionally made
	     invisible then (above), so the capture never has to paint cross-origin
	     content at all - some engines degrade the whole transition over it. -->
	{#if !revealed || $mapTransitionCover}
		<div
			class="absolute inset-0 bg-background"
			out:fade={{ duration: 300 }}
			aria-hidden="true"
		></div>
	{/if}
</div>
