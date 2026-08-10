import type { TransitionConfig } from 'svelte/transition';

const prefersReducedMotion = () =>
	typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Fades a loading placeholder out *over* the content that replaces it.
 *
 * A plain `out:fade` is not usable on a skeleton: Svelte keeps the node in the
 * layout for the length of the transition, so the real content stacks below the
 * placeholder and the whole page jumps up the moment the placeholder finally
 * unmounts. That is why these placeholders only ever faded in - the swap was
 * abrupt, but at least nothing moved.
 *
 * This pins the placeholder to the box it already occupies and takes it out of
 * flow for the fade instead. The content settles into its final position
 * immediately and the skeleton dissolves on top of it.
 *
 * Requirements at the call site: the placeholder's parent must be positioned
 * (`class="relative"`) and must be the same element that renders the real
 * content, or the overlay lands somewhere else on the page.
 */
export function skeletonOut(node: HTMLElement, { duration = 260 } = {}): TransitionConfig {
	if (prefersReducedMotion()) return { duration: 0 };

	// measured while the node is still in flow, which is when Svelte builds the
	// transition - the values below are what freeze it in place
	const { offsetTop, offsetLeft, offsetWidth, offsetHeight } = node;

	return {
		duration,
		css: (t) => `
			opacity: ${t};
			position: absolute;
			top: ${offsetTop}px;
			left: ${offsetLeft}px;
			width: ${offsetWidth}px;
			height: ${offsetHeight}px;
			margin: 0;
			pointer-events: none;
			z-index: 5;
		`
	};
}
