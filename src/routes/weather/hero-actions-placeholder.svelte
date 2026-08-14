<!--
	Holds the space the hero controls will take, until the page that owns them
	has mounted and handed them over (see hero.svelte.ts).

	Every page under this layout puts a control of the same footprint here - the
	model selector, or something built to match it - which is what makes one
	placeholder enough. Without it the row is built at heading height and grows
	by roughly 30px the moment the control lands, pushing the whole page down;
	on a first load that happens across the redirect, well after the page has
	been painted.

	The box below is the model selector's trigger with its text replaced by bars:
	same classes, same three lines, so it reserves the same height at every
	breakpoint rather than a number that has to be kept in sync by hand.
-->
<div class="flex w-full min-w-0 items-center gap-3 sm:w-auto" aria-hidden="true">
	<div
		class="flex h-auto min-h-12 w-full min-w-0 flex-1 items-center gap-2.5 rounded-xl border-2 border-border/60 bg-card py-1.5 ps-2.5 pe-3 sm:min-h-14 sm:w-80 sm:flex-none sm:gap-3 sm:py-2"
	>
		<div class="size-8 shrink-0 animate-pulse rounded-lg bg-muted sm:size-9"></div>
		<div class="flex min-w-0 flex-1 flex-col items-start gap-0 overflow-hidden">
			<span class="text-[11px] font-semibold tracking-wide uppercase">
				<span class="inline-block h-2 w-14 animate-pulse rounded bg-muted align-middle"></span>
			</span>
			<span class="text-[13px] font-bold sm:text-sm">
				<span class="inline-block h-2.5 w-28 animate-pulse rounded bg-muted align-middle"></span>
			</span>
			<span class="hidden text-[11px] leading-tight sm:block">
				<span class="inline-block h-2 w-20 animate-pulse rounded bg-muted align-middle"></span>
			</span>
		</div>
	</div>
</div>
