<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		/** Optional muted line under the title (e.g. "Last updated ..."). */
		subtitle?: string;
		children: Snippet;
	}

	let { title, subtitle, children }: Props = $props();
</script>

<svelte:head>
	<title>{title} · Drizz.li</title>
</svelte:head>

<article class="mx-auto max-w-3xl py-2 lg:py-4">
	<h1 class="text-2xl font-bold tracking-tight lg:text-3xl">{title}</h1>
	{#if subtitle}
		<p class="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
	{/if}
	<div class="prose-body mt-6">
		{@render children()}
	</div>
</article>

<style>
	/* Lightweight typography for long-form pages (about / legal), themed with the
	   app tokens so it reads correctly in light and dark. */
	.prose-body {
		line-height: 1.65;
		font-size: 0.95rem;
	}
	.prose-body :global(h2) {
		margin: 2rem 0 0.6rem;
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}
	.prose-body :global(h3) {
		margin: 1.4rem 0 0.4rem;
		font-size: 1rem;
		font-weight: 600;
	}
	.prose-body :global(p) {
		margin: 0.6rem 0;
	}
	.prose-body :global(ul) {
		margin: 0.6rem 0;
		padding-left: 1.4rem;
	}
	.prose-body :global(li) {
		margin: 0.25rem 0;
	}
	.prose-body :global(a) {
		color: var(--primary);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.prose-body :global(strong) {
		font-weight: 600;
	}
	.prose-body :global(address) {
		font-style: normal;
		margin: 0.6rem 0;
		padding: 0.8rem 1rem;
		border: 1px solid var(--border);
		border-radius: 0.625rem;
		background: var(--card);
	}
	.prose-body :global(hr) {
		margin: 2rem 0;
		border: 0;
		border-top: 1px solid var(--border);
	}
</style>
