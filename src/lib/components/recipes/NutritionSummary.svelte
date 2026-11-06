<script lang="ts">
	import { perPortion } from '#lib/domain/batch.ts';
	import type { Nutrients } from '#lib/domain/nutrition.ts';
	import { Card } from '#lib/components/ui/index.ts';

	/**
	 * The live summary of a recipe or batch: totals, per portion values and, when the cooked weight is known,
	 * values per 100 g. Display only; the server recomputes everything it stores. Portions that are empty, zero,
	 * negative or not a number show the totals alone, with a hint.
	 */
	type Props = {
		totals: Nutrients;
		/** Null while the portions field holds no valid number. */
		portions: number | null;
		/** Values per 100 g of cooked weight, for batches. */
		per100g?: Nutrients | null;
	};

	let { totals, portions, per100g = null }: Props = $props();

	const uid = $props.id();

	const portion = $derived(
		portions !== null && Number.isFinite(portions) && portions > 0
			? perPortion(totals, portions)
			: null
	);
	const portionLabel = $derived(`${Math.round((portions ?? 0) * 100) / 100}`);
</script>

{#snippet macros(values: Nutrients)}
	<dl class="grid grid-cols-3 gap-3 text-sm">
		<div class="flex flex-col">
			<dt class="flex items-center gap-1.5 text-text-muted">
				<span class="size-2 rounded-full bg-protein" aria-hidden="true"></span>Protein
			</dt>
			<dd class="text-base text-text tabular-nums">{Math.round(values.protein)} g</dd>
		</div>
		<div class="flex flex-col">
			<dt class="flex items-center gap-1.5 text-text-muted">
				<span class="size-2 rounded-full bg-carbs" aria-hidden="true"></span>Carbs
			</dt>
			<dd class="text-base text-text tabular-nums">{Math.round(values.carbs)} g</dd>
		</div>
		<div class="flex flex-col">
			<dt class="flex items-center gap-1.5 text-text-muted">
				<span class="size-2 rounded-full bg-fat" aria-hidden="true"></span>Fat
			</dt>
			<dd class="text-base text-text tabular-nums">{Math.round(values.fat)} g</dd>
		</div>
	</dl>
{/snippet}

<Card>
	<!-- One status node for every state, so the hint is announced when it appears. Empty, it takes no space. -->
	<p role="status" class="text-base text-text-muted not-empty:mb-5">
		{#if !portion}Enter portions to see per portion values{/if}
	</p>
	<div class="flex flex-col gap-5">
		{#if portion}
			<section class="flex flex-col gap-2" aria-labelledby="{uid}-portion">
				<h3 id="{uid}-portion" class="text-sm font-medium text-text-muted">
					Per portion, {portionLabel}
					{portions === 1 ? 'portion' : 'portions'}
				</h3>
				<p class="text-3xl font-semibold text-text tabular-nums" data-testid="per-portion-kcal">
					{Math.round(portion.kcal)} kcal
				</p>
				{@render macros(portion)}
			</section>
		{/if}

		<section class="flex flex-col gap-2" aria-labelledby="{uid}-total">
			<h3 id="{uid}-total" class="text-sm font-medium text-text-muted">Total</h3>
			<p
				class={['font-semibold text-text tabular-nums', portion ? 'text-lg' : 'text-3xl']}
				data-testid="total-kcal"
			>
				{Math.round(totals.kcal)} kcal
			</p>
			{@render macros(totals)}
		</section>

		{#if per100g}
			<section class="flex flex-col gap-2" aria-labelledby="{uid}-per100">
				<h3 id="{uid}-per100" class="text-sm font-medium text-text-muted">Per 100 g cooked</h3>
				<p class="text-lg font-semibold text-text tabular-nums" data-testid="per100g-kcal">
					{Math.round(per100g.kcal)} kcal
				</p>
				{@render macros(per100g)}
			</section>
		{/if}
	</div>
</Card>
