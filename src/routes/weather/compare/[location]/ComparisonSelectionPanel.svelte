<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	import * as m from '$lib/paraglide/messages';

	interface Option {
		value: string;
		label: string;
		metadata?: string;
	}

	interface OptionGroup {
		value: string;
		label: string;
		options: Option[];
	}

	interface Props {
		mode: 'models' | 'variables';
		groups: OptionGroup[];
		selected: string[];
		onToggle: (value: string) => void;
		onToggleGroup: (values: string[], select: boolean) => void;
		onRestoreDefaults?: () => void;
	}

	let { mode, groups, selected, onToggle, onToggleGroup, onRestoreDefaults }: Props = $props();

	let search = $state('');
	let onlySelected = $state(false);
	let normalizedSearch = $derived(search.trim().toLocaleLowerCase());

	let visibleGroups = $derived.by(() =>
		groups.flatMap((group) => {
			const options = group.options.filter((option) => {
				if (onlySelected && !selected.includes(option.value)) return false;
				if (!normalizedSearch) return true;
				return `${group.label} ${option.label} ${option.value} ${option.metadata ?? ''}`
					.toLocaleLowerCase()
					.includes(normalizedSearch);
			});
			return options.length > 0 ? [{ ...group, options }] : [];
		})
	);

	function groupSelection(group: OptionGroup): { count: number; all: boolean; partial: boolean } {
		const count = group.options.filter((option) => selected.includes(option.value)).length;
		return {
			count,
			all: count === group.options.length,
			partial: count > 0 && count < group.options.length
		};
	}
</script>

<div class="mt-3 overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
	<div class="border-b border-border/70 bg-muted/20 p-3 sm:p-4">
		<div class="flex flex-col gap-2 sm:flex-row">
			<Input
				type="search"
				bind:value={search}
				placeholder={mode === 'models' ? m.compare_search_models() : m.compare_search_variables()}
				aria-label={mode === 'models' ? m.compare_search_models() : m.compare_search_variables()}
			/>
			<div
				class="flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold hover:bg-muted"
			>
				<Checkbox id="panel_{mode}_only_selected" bind:checked={onlySelected} />
				<Label for="panel_{mode}_only_selected" class="cursor-pointer text-xs">
					{m.compare_only_selected()}
				</Label>
			</div>
		</div>
	</div>

	<div class="p-3 sm:p-4">
		{#if visibleGroups.length > 0}
			<div class="columns-1 gap-3 md:columns-2">
				{#each visibleGroups as visibleGroup (visibleGroup.value)}
					{@const fullGroup =
						groups.find((group) => group.value === visibleGroup.value) ?? visibleGroup}
					{@const selection = groupSelection(fullGroup)}
					<section
						class="mb-3 inline-block w-full break-inside-avoid overflow-hidden rounded-xl border border-border/70 bg-background align-top"
					>
						<div
							class="flex min-h-11 items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2"
						>
							<Checkbox
								id="panel_{mode}_group_{fullGroup.value}"
								checked={selection.all}
								indeterminate={selection.partial}
								onCheckedChange={() =>
									onToggleGroup(
										fullGroup.options.map((option) => option.value),
										!selection.all
									)}
							/>
							<Label
								for="panel_{mode}_group_{fullGroup.value}"
								class="min-w-0 flex-1 cursor-pointer text-sm font-bold"
							>
								{fullGroup.label}
							</Label>
							<span class="shrink-0 text-[11px] text-muted-foreground tabular-nums">
								{selection.count}/{fullGroup.options.length}
							</span>
						</div>
						<div class="p-2">
							{#each visibleGroup.options as option (option.value)}
								<div class="flex min-h-10 items-center rounded-lg px-1.5 hover:bg-muted/60">
									<Checkbox
										id="panel_{mode}_{option.value}"
										checked={selected.includes(option.value)}
										onCheckedChange={() => onToggle(option.value)}
									/>
									<Label
										for="panel_{mode}_{option.value}"
										class="min-w-0 flex-1 cursor-pointer py-2 pl-2"
									>
										<span class="block text-sm font-medium">{option.label}</span>
										{#if option.metadata}
											<span class="block text-[10px] text-muted-foreground">
												{option.metadata}
											</span>
										{/if}
									</Label>
								</div>
							{/each}
						</div>
					</section>
				{/each}
			</div>
		{:else}
			<div
				class="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground"
			>
				{m.compare_no_matching_options()}
			</div>
		{/if}
	</div>

	{#if mode === 'variables' && onRestoreDefaults}
		<div class="border-t border-border bg-muted/20 px-3 py-3 sm:px-4">
			<button
				type="button"
				class="min-h-9 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
				onclick={onRestoreDefaults}
			>
				{m.compare_restore_defaults()}
			</button>
		</div>
	{/if}
</div>
