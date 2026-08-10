<script lang="ts">
	import * as Select from '$lib/components/ui/select';

	import * as m from '$lib/paraglide/messages';

	import { type WeatherModelGroup, modelGroups } from '../../options';

	interface Props {
		selectedModel: string;
		onModelChange: (model: string) => void;
		/** Model list to offer; defaults to the deterministic forecast models */
		groups?: WeatherModelGroup[];
		label?: string;
	}

	let {
		selectedModel,
		onModelChange,
		groups = modelGroups,
		label = m.model_weather()
	}: Props = $props();

	let model = $derived(
		groups.flatMap((group) => group.models).find((mo) => mo.value === selectedModel)
	);
	let modelLabel = $derived(model?.label ?? selectedModel);
	// Provider groups are brand names and stay as they are; the few descriptive
	// ones are the only headings that need translating.
	const GROUP_LABELS: Record<string, () => string> = {
		auto: m.model_group_automatic,
		era5: m.model_group_reanalysis,
		regional: m.model_group_regional_reanalysis
	};
	const groupLabel = (group: { value: string; label: string }) =>
		GROUP_LABELS[group.value]?.() ?? group.label;

	// The catalogue stores update cadences as English shorthand ("every 6 h");
	// map the handful of forms onto messages instead of translating the data.
	function updateLabel(update: string): string {
		const hours = update.match(/^every (\d+) h$/);
		if (hours) return m.model_updated({ cadence: m.cadence_every_hours({ hours: hours[1] }) });
		const named: Record<string, () => string> = {
			'every hour': m.cadence_every_hour,
			daily: m.cadence_daily,
			monthly: m.cadence_monthly,
			varies: m.cadence_varies
		};
		return m.model_updated({ cadence: (named[update] ?? (() => update))() });
	}

	let modelMeta = $derived.by(() => {
		if (model?.resolution && model.resolution !== 'varies') {
			return model.update ? `${model.resolution} · ${updateLabel(model.update)}` : model.resolution;
		}
		return selectedModel === 'best_match' ? m.model_best_match_hint() : '';
	});
</script>

<Select.Root
	name="model_selection"
	type="single"
	value={selectedModel}
	onValueChange={(val) => {
		if (val) onModelChange(val);
	}}
>
	<!-- Fixed width from sm up (mobile stays full-width): the trigger used to hug
	     its content, so its size changed with every model name and differed
	     between pages. One constant footprint, sized for the longest label in
	     the catalogue; anything longer truncates. -->
	<Select.Trigger
		aria-label={m.model_selector_aria({ label })}
		class="group h-auto min-h-12 min-w-0 flex-1 cursor-pointer gap-2.5 rounded-xl border-2 border-primary/35 bg-card py-1.5 ps-2.5 shadow-sm transition-colors hover:border-primary/70 hover:shadow-md data-[size=default]:h-auto data-[state=open]:border-primary sm:min-h-14 sm:w-80 sm:gap-3 sm:py-2 sm:flex-none"
	>
		<div
			class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary sm:size-9"
		>
			<!-- layered-globe icon: weather model -->
			<svg
				class="size-4.5 sm:size-5"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				stroke-width="1.75"
			>
				<circle cx="12" cy="12" r="9" />
				<path
					stroke-linecap="round"
					d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"
				/>
			</svg>
		</div>
		<div class="flex min-w-0 flex-1 flex-col items-start gap-0 overflow-hidden text-left">
			<span class="text-[11px] font-semibold tracking-wide text-primary uppercase">
				{label}
			</span>
			<span class="max-w-full truncate text-[13px] font-bold text-foreground sm:text-sm"
				>{modelLabel}</span
			>
			{#if modelMeta}
				<!-- the meta line is dropped on mobile to keep the trigger compact -->
				<span
					class="hidden max-w-full truncate text-[11px] leading-tight text-muted-foreground sm:block"
				>
					{modelMeta}
				</span>
			{/if}
		</div>
	</Select.Trigger>
	<Select.Content preventScroll={false} class="max-h-[min(480px,60vh)] border-border">
		{#each groups as group (group.value)}
			<Select.Group>
				<Select.GroupHeading
					class="text-[10.5px] font-bold tracking-wider text-primary/80 uppercase"
				>
					{groupLabel(group)}
				</Select.GroupHeading>
				{#each group.models as mo (mo.value)}
					<Select.Item class="cursor-pointer" value={mo.value} label={mo.label}>
						<!-- div, not span: the item base styles force flex row on spans -->
						<div class="flex w-full flex-col items-start gap-0 leading-tight">
							<span class="font-medium">{mo.label}</span>
							{#if mo.resolution && mo.resolution !== 'varies'}
								<span class="text-[11px] text-muted-foreground">
									{mo.resolution}{mo.update ? ` · ${updateLabel(mo.update)}` : ''}
								</span>
							{:else if mo.value === 'best_match'}
								<span class="text-[11px] text-muted-foreground"
									>{m.model_automatic_selection()}</span
								>
							{/if}
						</div>
					</Select.Item>
				{/each}
			</Select.Group>
		{/each}
	</Select.Content>
</Select.Root>
