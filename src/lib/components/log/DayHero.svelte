<script lang="ts">
	import type { Nutrients } from '#lib/domain/nutrition.ts';
	import { Card, MacroBar, ProgressBar } from '#lib/components/ui/index.ts';

	type Props = {
		totals: Pick<Nutrients, 'kcal' | 'protein' | 'carbs' | 'fat'>;
		/** The daily target, or null while none is set. Without one there are no bars toward a made up goal. */
		target: {
			kcal: number;
			proteinG: number;
			fatG: number;
			carbsG: number;
			carbsFloored: boolean;
		} | null;
	};

	let { totals, target }: Props = $props();

	const format = (value: number) => Math.round(value).toLocaleString('en-US');

	const eaten = $derived(Math.round(totals.kcal));
	const remaining = $derived(target ? Math.round(target.kcal) - eaten : 0);
	const over = $derived(remaining < 0);

	const eatenMacros = $derived([
		{ macro: 'protein', name: 'Protein', grams: totals.protein, dot: 'bg-protein' },
		{ macro: 'carbs', name: 'Carbs', grams: totals.carbs, dot: 'bg-carbs' },
		{ macro: 'fat', name: 'Fat', grams: totals.fat, dot: 'bg-fat' }
	] as const);
</script>

<Card>
	<div class="flex flex-col gap-4">
		{#if target}
			<div class="flex flex-col gap-1">
				{#if over}
					<p class="text-5xl font-semibold tracking-tight text-success tabular-nums">
						Over by {format(-remaining)}
					</p>
					<p class="text-base text-text-muted">
						kcal, {format(eaten)} of {format(target.kcal)} eaten
					</p>
				{:else}
					<p class="text-5xl font-semibold tracking-tight text-text tabular-nums">
						{format(remaining)}
					</p>
					<p class="text-base text-text-muted">
						kcal remaining, {format(eaten)} of {format(target.kcal)} eaten
					</p>
				{/if}
			</div>
			<ProgressBar value={eaten} max={target.kcal} label="Calories" />
			<div class="flex flex-col gap-3">
				<MacroBar macro="protein" current={totals.protein} target={target.proteinG} />
				<MacroBar macro="carbs" current={totals.carbs} target={target.carbsG} />
				<MacroBar macro="fat" current={totals.fat} target={target.fatG} />
			</div>
			{#if target.carbsFloored}
				<p class="text-sm text-text-muted">
					Protein and fat already use the whole target, so carbs have no room left.
				</p>
			{/if}
		{:else}
			<div class="flex flex-col gap-1">
				<p class="text-5xl font-semibold tracking-tight text-text tabular-nums">{format(eaten)}</p>
				<p class="text-base text-text-muted">kcal eaten</p>
			</div>
			<ul class="grid grid-cols-3 gap-3">
				{#each eatenMacros as item (item.macro)}
					<li class="flex flex-col gap-0.5">
						<span class="flex items-center gap-1.5 text-sm text-text-muted">
							<span class={['size-2 rounded-full', item.dot]} aria-hidden="true"></span>
							{item.name}
						</span>
						<span class="text-lg font-medium text-text tabular-nums">{format(item.grams)} g</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Card>
