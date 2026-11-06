<script lang="ts">
	import type { RecipeSummary } from '#lib/server/recipes/repo.ts';
	import { ListItem } from '#lib/components/ui/index.ts';

	/**
	 * One recipe in the Recipes tab: name, portions and ingredient count, and kcal per portion. A link to the recipe
	 * page; the caller wraps it in an `<li>` and passes an already resolved `href`.
	 */
	type Props = {
		recipe: RecipeSummary;
		href: string;
	};

	let { recipe, href }: Props = $props();

	const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
	const subtitle = $derived(
		`${plural(Math.round(recipe.defaultPortions * 100) / 100, 'portion')} · ${plural(recipe.ingredientCount, 'ingredient')}`
	);
</script>

<ListItem title={recipe.name} {subtitle} {href}>
	{#snippet trailing()}
		<span class="flex flex-col items-end">
			<span class="text-base font-medium text-text tabular-nums">
				{Math.round(recipe.perPortion.kcal)} kcal
			</span>
			<span class="text-sm text-text-muted">per portion</span>
		</span>
	{/snippet}
</ListItem>
