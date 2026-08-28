<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { fade, fly } from 'svelte/transition';

	import { afterNavigate, onNavigate } from '$app/navigation';
	import { page } from '$app/stores';

	import {
		mapTransitionCover,
		markPageLoading,
		markPageReady,
		pageContentReady
	} from '$lib/stores/page-transition.svelte';
	import { hasStoredLocation, storedTheme } from '$lib/stores/settings';

	import {
		canStartViewTransition,
		startViewTransition,
		supportsViewTransitions
	} from '$lib/utils/view-transition';

	import AppStatus from '$lib/components/app-status.svelte';
	import Footer from '$lib/components/navigation/footer.svelte';
	import Header from '$lib/components/navigation/header.svelte';
	import WeatherNav from '$lib/components/navigation/weather-nav.svelte';

	import { routePath } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { initialLocation } from '$lib/services/geolocation';

	import './layout.css';

	let { children } = $props();

	// Pages that name a location settle the topbar themselves, and the redirect
	// stubs do it before they redirect. What is left is a first visit landing
	// straight on a page that names none - the map, the legal pages - where the
	// topbar would otherwise sit on its placeholder for the whole visit. Ask
	// once here; the answer is shared with whatever asks next.
	onMount(() => {
		if (!get(page).data.location && !hasStoredLocation()) void initialLocation();
	});

	// keep the .dark class in sync with the persisted theme; in 'system' mode
	// follow the OS preference live
	let themeSettled = false;
	let themeTimer = 0;
	$effect(() => {
		const theme = $storedTheme;
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const apply = () => {
			const root = document.documentElement;
			const dark = theme === 'dark' || (theme === 'system' && mq.matches);
			const paint = () => {
				root.classList.toggle('dark', dark);
			};

			// The very first application is just painting the stored theme - only
			// an actual switch afterwards is worth cross-fading.
			const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			if (!themeSettled || reduced) {
				themeSettled = true;
				paint();
				return;
			}

			if (canStartViewTransition() && !onMapsPage()) {
				// one cross-fade of the whole document; component transitions untouched
				void startViewTransition(paint);
				return;
			}

			// A navigation transition already owns the screen: repaint under it
			// rather than skipping it (which would flash), and fall back to the
			// colour transition below when the browser has none at all.
			if (supportsViewTransitions()) {
				paint();
				return;
			}

			// no view transitions: fall back to fading the colours for one window
			root.classList.add('theme-transition');
			clearTimeout(themeTimer);
			themeTimer = window.setTimeout(() => root.classList.remove('theme-transition'), 400);
			paint();
		};

		apply();
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	});

	// ── Page cross-fade ───────────────────────────────────────────────────────
	// A real cross-fade needs the outgoing page still on screen while the
	// incoming one appears - so the view transition is opened at navigation and
	// held open for a short grace period, waiting for the new page to report that
	// its data has landed. A cached or fast response lands inside that window and
	// the old page fades straight into the finished one, no skeleton in between.
	//
	// Past the grace period the wait gives up and the loading overlay takes over:
	// holding the old page frozen any longer looks like a dead click, and the
	// overlay is the honest answer - something is happening, it just isn't here
	// yet. Note the order: the overlay has to be in the DOM *before* the
	// transition captures the incoming state, because a running view transition
	// freezes the page and nothing painted after that point can appear.
	//
	// There is deliberately no fade for browsers without view transitions. The
	// old fallback dimmed the outgoing page to nothing and brought the new one
	// back up, which on a single layer is a flash of the bare background rather
	// than a cross-fade. Swapping outright and letting the overlay carry the
	// "loading" message is quieter and honest.
	const READY_HOLD_MS = 350;
	// Nothing reports ready when a fetch fails outright, so the overlay needs its
	// own way out rather than sitting on top of an error message forever.
	const OVERLAY_CEILING_MS = 15000;

	// The map is a cross-origin iframe, and a browser does not paint one into a
	// view transition snapshot - captured bare, any transition with the maps page
	// on either side would animate a hole where the map is. The way out is to
	// make sure the map is never what gets captured: the maps page keeps an
	// opaque cover over the iframe while the map boots (so an arrival fades into
	// a clean panel, and the map fades up once ready), and raises the same cover
	// again just before a departure is captured (see mapTransitionCover). Both
	// snapshots then hold real pixels and the maps page transitions like any
	// other route.
	const MAPS_ROUTE = '/weather/maps';
	const onMapsPage = () => routePath(get(page).url.pathname).startsWith(MAPS_ROUTE);

	let loadingOverlay = $state(false);
	let overlayCeilingTimer = 0;
	// A view transition freezes the page, so a Svelte in-transition started under
	// one cannot play - the overlay would be captured at opacity 0 and pop in
	// afterwards. Inside a transition the cross-fade does the fading instead.
	let overlayFadesIn = $state(true);

	function showOverlay(animate: boolean): void {
		overlayFadesIn = animate;
		loadingOverlay = true;
		clearTimeout(overlayCeilingTimer);
		overlayCeilingTimer = window.setTimeout(() => (loadingOverlay = false), OVERLAY_CEILING_MS);
	}

	function hideOverlay(): void {
		clearTimeout(overlayCeilingTimer);
		loadingOverlay = false;
	}

	/**
	 * Manual dismissal. The overlay reports on a fetch it does not control, so
	 * "stuck" is always a possibility (a page that never reports ready, a request
	 * that neither resolves nor rejects) - and the page behind it still works.
	 * Whatever was loading carries on; only the veil goes.
	 */
	function dismissOverlay(): void {
		hideOverlay();
	}

	function onWindowKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && loadingOverlay) dismissOverlay();
	}

	/** The page that just mounted has its data: whatever we were waiting for is in. */
	$effect(() => {
		if ($pageContentReady) hideOverlay();
	});

	// Routes that are not finished on arrival: the five that fetch a forecast
	// after mounting, the maps page (whose map is a cross-origin iframe that has
	// to load first), and the redirect stubs, which render nothing at all and
	// bounce to a located URL from `onMount`. Knowing this up front is what makes
	// the wait reliable - the layout clears the ready flag before the swap rather
	// than trusting the incoming page to have done it.
	const PENDING_ROUTES = new Set([
		'/',
		'/weather/week',
		'/weather/14-day',
		'/weather/compare',
		'/weather/seasonal',
		'/weather/historical',
		'/weather/maps',
		'/weather/week/[location]',
		'/weather/14-day/[location]',
		'/weather/compare/[location]',
		'/weather/seasonal/[location]',
		'/weather/historical/[location]'
	]);

	/**
	 * The subset of those that render nothing at all: `/` and every bare
	 * `/weather/<view>/` page, which bounce to a located URL from `onMount`.
	 *
	 * Leaving one of these must not open a transition. There is nothing to
	 * cross-fade *from* - the outgoing snapshot is a blank content column - and
	 * holding a blank page over the incoming one is exactly what hid the
	 * placeholders on a first visit: the week page mounts inside the capture,
	 * its skeletons are in the DOM, but nothing painted after the snapshot can
	 * appear until the animation is over. Their fade-in is captured at opacity 0
	 * on top of that, so even the snapshot holds no placeholders. A visitor
	 * landing on `/` got a blank column for the length of the chain and then the
	 * finished forecast - the same page, force-reloaded, shows its skeletons
	 * immediately because a reload has no transition to hide them.
	 *
	 * Arriving *at* a stub is a different case and still transitions: there the
	 * outgoing page is real content, and the capture is deliberately held open
	 * across the redirect that follows (see startViewTransition) so the old page
	 * stays up until the located page has its data.
	 */
	const STUB_ROUTES = new Set([
		'/',
		'/weather/week',
		'/weather/14-day',
		'/weather/compare',
		'/weather/seasonal',
		'/weather/historical'
	]);

	/**
	 * Resolves once the freshly mounted page has its data, or once the grace
	 * period is up - in which case the overlay goes up first, so it is part of
	 * the state the transition is about to snapshot.
	 */
	async function waitForContent(underTransition: boolean): Promise<void> {
		const deadline = Date.now() + READY_HOLD_MS;
		while (!get(pageContentReady) && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
		if (!get(pageContentReady)) showOverlay(!underTransition);
		// one more frame so the page paints its data before the snapshot is taken
		await tick();
	}

	/**
	 * True when the navigation lands on the route and params the page is already
	 * showing - the sidebar's home link from the week page it points at, or a
	 * link that differs only in the query string.
	 *
	 * SvelteKit keeps the page component mounted for those, and nothing it holds
	 * changes: its forecast is already fetched, so the readiness effect it
	 * registered never re-runs and never re-announces. Clearing the flag for such
	 * a navigation strands it cleared, and the overlay sits there until its
	 * ceiling. There is genuinely nothing to wait for, so don't clear it.
	 */
	function landsOnCurrentPage(navigation: {
		from: { route: { id: string | null }; params: Record<string, string> | null } | null;
		to: { route: { id: string | null }; params: Record<string, string> | null } | null;
	}): boolean {
		const from = navigation.from;
		const to = navigation.to;
		if (!from?.route.id || from.route.id !== to?.route.id) return false;
		return JSON.stringify(from.params ?? {}) === JSON.stringify(to.params ?? {});
	}

	onNavigate(async (navigation) => {
		const pending =
			PENDING_ROUTES.has(navigation.to?.route?.id ?? '') && !landsOnCurrentPage(navigation);
		// Either way the flag is set explicitly: leaving a page that never resolved
		// for one that has nothing to load would otherwise strand the overlay.
		if (pending) markPageLoading();
		else markPageReady();

		// `startViewTransition` decides whether a transition is possible at all
		// (support, reduced motion, one already capturing) and runs the update
		// inline when it is not - so there is exactly one path from here down.
		// The one case it cannot know about is a departure from a redirect stub,
		// which has no pixels worth animating (see STUB_ROUTES).
		const underTransition =
			canStartViewTransition() && !STUB_ROUTES.has(navigation.from?.route?.id ?? '');

		// Leaving the maps page: cover the iframe before the outgoing state is
		// captured, so the snapshot holds a clean panel instead of a hole where
		// the map was. The tick makes sure the cover is actually in the DOM by
		// the time the capture reads it.
		if (underTransition && navigation.from?.route?.id === MAPS_ROUTE) {
			mapTransitionCover.set(true);
			await tick();
		}

		return new Promise<void>((swap) => {
			void startViewTransition(
				async () => {
					// hand control back so SvelteKit swaps the DOM underneath the
					// frozen snapshot of the old page
					swap();
					// A superseded navigation (a redirect, or a fast second click)
					// rejects this promise; that is not an error worth surfacing,
					// and leaving it unhandled shows up as "navigation aborted".
					await navigation.complete.catch(() => {});
					if (pending) await waitForContent(underTransition);
				},
				// pins the chrome that is the same on both sides (routes/layout.css)
				{ rootClass: 'page-switch', enabled: underTransition }
			);
		});
	});

	let mainEl = $state<HTMLElement | null>(null);

	afterNavigate((navigation) => {
		// The departure snapshot (if any) is taken by now, so the maps cover has
		// done its job; lowering it here also means a later visit to the maps page
		// starts from its own boot cover rather than a stuck one.
		mapTransitionCover.set(false);

		// The page scrolls inside <main>, not the window, so SvelteKit's own scroll
		// handling never touches it and a new page would open half way down.
		// Back/forward and in-page anchors keep their position.
		if (navigation.type !== 'popstate' && !navigation.to?.url.hash) {
			mainEl?.scrollTo({ top: 0 });
		}
	});

	// the maps page embeds a full-bleed map: no padding, no scrolling
	let fullBleed = $derived(routePath($page.url.pathname).startsWith('/weather/maps'));

	let sidebarCollapsed = $state(false);
	let mobileMenuOpen = $state(false);

	const toggleSidebar = () => {
		sidebarCollapsed = !sidebarCollapsed;
	};

	const toggleMobileMenu = () => {
		mobileMenuOpen = !mobileMenuOpen;
	};

	const closeMobileMenu = () => {
		mobileMenuOpen = false;
	};
</script>

<svelte:head>
	<!-- the icon itself lives in app.html, so the SPA fallback carries it too -->
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<!-- Page-wide loading veil. Deliberately `pointer-events-none`: it is a status
     indicator, not a modal, so the nav and the search stay usable while a slow
     forecast is still on its way. It is also always dismissable - Escape or the
     close button - because a veil nobody can get rid of is worse than no veil,
     and the page underneath is perfectly usable either way. -->
<svelte:window onkeydown={onWindowKeydown} />

{#if loadingOverlay}
	<div
		class="pointer-events-none fixed inset-0 z-60 flex items-center justify-center bg-background/55 backdrop-blur-[2px]"
		in:fade={{ duration: overlayFadesIn ? 120 : 0 }}
		out:fade={{ duration: 280 }}
		role="status"
		aria-live="polite"
	>
		<button
			type="button"
			class="pointer-events-auto absolute top-3 right-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-lg transition-colors hover:bg-muted hover:text-foreground md:top-4 md:right-4"
			onclick={dismissOverlay}
			aria-label={m.page_loading_dismiss()}
			title={m.page_loading_dismiss()}
		>
			<svg
				class="h-4 w-4"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				stroke-width="2"
				aria-hidden="true"
			>
				<path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
			</svg>
		</button>

		<div
			class="flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2 shadow-lg"
		>
			<svg
				class="h-4 w-4 animate-spin text-primary"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				stroke-width="2.5"
				aria-hidden="true"
			>
				<path stroke-linecap="round" d="M21 12a9 9 0 1 1-6.219-8.56" />
			</svg>
			<span class="text-sm font-semibold">{m.page_loading()}</span>
		</div>
	</div>
{/if}

<AppStatus />

<div class="app-frame flex h-screen overflow-hidden bg-background text-foreground">
	<!-- Desktop sidebar -->
	<div class="sidebar-region hidden h-full shrink-0 md:block">
		<WeatherNav collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
	</div>

	<!-- Mobile overlay -->
	{#if mobileMenuOpen}
		<div class="fixed inset-0 z-50 md:hidden" role="presentation">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="absolute inset-0 bg-black/30"
				transition:fade={{ duration: 150 }}
				onclick={closeMobileMenu}
				onkeydown={closeMobileMenu}
			></div>
			<div
				class="relative z-1 h-full w-55 shadow-lg"
				transition:fly={{ x: -220, duration: 200, opacity: 1 }}
			>
				<WeatherNav collapsed={false} onMobileClose={closeMobileMenu} />
			</div>
		</div>
	{/if}

	<!-- Main area: topbar + content -->
	<div class="flex min-w-0 flex-1 flex-col h-full">
		<Header onMenuToggle={toggleMobileMenu} />

		<!-- The padding stays on <main> itself: the day strip sticks with a
		     negative offset that exactly cancels it, so moving it to an inner
		     wrapper would dock the strip too high and clip its top row.
		     flex-col + flex-1 below keeps the footer on the bottom edge even when
		     the page is too short to fill the viewport. -->
		<main
			bind:this={mainEl}
			class={fullBleed
				? 'flex-1 overflow-hidden'
				: 'flex flex-1 flex-col overflow-y-auto p-3 lg:px-8 lg:py-6'}
		>
			{#if fullBleed}
				{@render children()}
			{:else}
				<!-- cap the content width on very large screens; the footer below
				     gives the page its ending, so only modest bottom room is needed -->
				<div class="mx-auto w-full max-w-[1536px] flex-1 pb-24">
					{@render children()}
				</div>
				<!-- full-bleed footer inside the scroll area (its own inner max-w),
				     cancelling main's padding so it sits flush with the edges -->
				<div class="-mx-3 -mb-3 lg:-mx-8 lg:-mb-6">
					<Footer />
				</div>
			{/if}
		</main>
	</div>
</div>
