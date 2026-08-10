<script lang="ts">
	import { page } from '$app/stores';

	import { getLocale } from '$lib/paraglide/runtime';

	import type { Component } from 'svelte';

	/**
	 * Picks the content component for the current locale.
	 *
	 * Long-form pages (about, imprint, privacy, terms) are kept as one component
	 * per language rather than as message strings: the prose is full of inline
	 * links, lists and headings, and splitting that into placeholders makes both
	 * the source and the translations harder to read and to keep correct.
	 */
	interface Props {
		variants: Record<string, Component>;
	}

	let { variants }: Props = $props();

	let Content = $derived.by(() => {
		// the URL decides the locale, so re-resolve on navigation
		void $page.url.pathname;
		return variants[getLocale()] ?? variants.en;
	});
</script>

<Content />
