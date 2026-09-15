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
</script>

<Select.Root
	name="model_selection"
	type="single"
	value={selectedModel}
	onValueChange={(val) => {
		if (val) onModelChange(val);
	}}
>
	<Select.Trigger
		aria-label={m.model_selector_aria({ label })}
		title={modelLabel}
		class="min-w-0 max-w-full cursor-pointer items-baseline gap-1 rounded-md border-0 bg-sidebar-accent p-0 text-xl leading-tight font-medium tracking-tight text-muted-foreground shadow-none hover:bg-primary/15 hover:text-primary data-[size=default]:h-auto data-[state=open]:bg-primary/15 data-[state=open]:text-primary md:text-3xl dark:bg-sidebar-accent dark:hover:bg-primary/15 [&_svg]:self-center"
	>
		<span class="min-w-0 whitespace-normal text-left md:hidden">
			{m.forecast_mobile_model({ model: modelLabel })}
		</span>
		<span class="hidden min-w-0 whitespace-normal text-left md:inline">
			{selectedModel === 'best_match'
				? m.forecast_using_automatic()
				: m.forecast_using_model({ model: modelLabel })}
		</span>
	</Select.Trigger>
	<Select.Content
		preventScroll={false}
		class="max-h-[min(480px,60vh)] w-80 max-w-[calc(100vw-2rem)] border-border"
	>
		{#each groups as group (group.value)}
			<Select.Group>
				<Select.GroupHeading
					class="text-[10.5px] font-bold tracking-wider text-primary/80 uppercase"
				>
					{groupLabel(group)}
				</Select.GroupHeading>
				{#each group.models as mo (mo.value)}
					<Select.Item class="group/model-option cursor-pointer" value={mo.value} label={mo.label}>
						<!-- div, not span: the item base styles force flex row on spans -->
						<div class="flex w-full flex-col items-start gap-0 leading-tight">
							<span class="font-medium">{mo.label}</span>
							{#if mo.resolution && mo.resolution !== 'varies'}
								<span
									class="text-[11px] text-muted-foreground group-data-[highlighted]/model-option:text-accent-foreground"
								>
									{mo.resolution}{mo.update ? ` · ${updateLabel(mo.update)}` : ''}
								</span>
							{:else if mo.value === 'best_match'}
								<span
									class="text-[11px] text-muted-foreground group-data-[highlighted]/model-option:text-accent-foreground"
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
