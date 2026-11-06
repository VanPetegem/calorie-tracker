<script lang="ts">
	import { snapshotFor, toGrams, type Unit } from '#lib/domain/nutrition.ts';
	import type { Food } from '#lib/server/db/schema.ts';
	import { ListItem } from '#lib/components/ui/index.ts';

	/**
	 * One food in a list of the add sheet. Search results show brand, "per 100 g" and kcal per 100. Recents and
	 * frequents (`last` given) show the amount last logged and the kcal of that amount.
	 */
	type Props = {
		food: Pick<Food, 'name' | 'brand' | 'nutritionBasis' | 'kcal' | 'servingG'>;
		last?: { amount: number; unit: Unit };
		onselect: () => void;
	};

	let { food, last, onselect }: Props = $props();

	const kcal = $derived.by(() => {
		if (!last) return food.kcal;
		try {
			const grams = toGrams(last.amount, last.unit, food.servingG);
			return snapshotFor({ kcal: food.kcal, protein: 0, carbs: 0, fat: 0, fiber: null }, grams)
				.kcal;
		} catch {
			return food.kcal;
		}
	});
	const detail = $derived(
		last ? `${Math.round(last.amount * 10) / 10} ${last.unit}` : `per 100 ${food.nutritionBasis}`
	);
	const subtitle = $derived([food.brand, detail].filter(Boolean).join(' · '));
</script>

<ListItem title={food.name} {subtitle} onclick={onselect}>
	{#snippet trailing()}
		<span class="text-base font-medium text-text tabular-nums">{Math.round(kcal)} kcal</span>
	{/snippet}
</ListItem>
