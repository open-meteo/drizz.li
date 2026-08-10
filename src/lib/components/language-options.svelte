<script lang="ts">
	import { page } from '$app/stores';

	import { LOCALE_LABELS, LOCALE_LIST } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { type Locale, getLocale, localizeHref } from '$lib/paraglide/runtime';

	interface Props {
		/** Called after a language is picked (used to close the menu around it). */
		onSelect?: () => void;
	}

	let { onSelect }: Props = $props();

	let current = $derived.by(() => {
		// re-read on navigation: the URL is what decides the locale
		void $page.url.pathname;
		return getLocale();
	});

	/** The current page, in another language. */
	function switchTo(locale: Locale): string {
		return localizeHref($page.url.pathname + $page.url.search, { locale });
	}
</script>

<div>
	<span
		class="mb-1.5 block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
	>
		{m.language_label()}
	</span>
	<!-- Plain links, not buttons: the locale lives in the URL, so switching
	     language is a navigation. It also means each option is shareable and
	     crawlable. -->
	<div class="grid grid-cols-2 gap-1">
		{#each LOCALE_LIST as locale (locale)}
			{@const active = current === locale}
			<a
				href={switchTo(locale)}
				hreflang={locale}
				data-sveltekit-reload
				class="cursor-pointer rounded-md px-2 py-1.5 text-center text-[13px] font-semibold transition-colors {active
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground hover:text-foreground'}"
				aria-current={active ? 'true' : undefined}
				onclick={onSelect}
			>
				{LOCALE_LABELS[locale]}
			</a>
		{/each}
	</div>
</div>
