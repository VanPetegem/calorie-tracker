<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import { IconButton } from '#lib/components/ui/index.ts';
	import type { DraftIngredient } from './draft.ts';

	/**
	 * One ingredient of a recipe or batch: name, amount with unit and kcal. Tap the row to change the amount; the
	 * menu button opens the row's actions. The caller supplies the kcal, so a batch can show its snapshot.
	 */
	type Props = {
		ingredient: DraftIngredient;
		kcal: number;
		onedit: () => void;
		onmenu: () => void;
	};

	let { ingredient, kcal, onedit, onmenu }: Props = $props();

	const detail = $derived.by(() => {
		const { amount, unit } = ingredient;
		const shown = Math.round(amount * 100) / 100;
		return `${shown} ${unit === 'serving' ? (amount === 1 ? 'serving' : 'servings') : unit}`;
	});
</script>

<li class="flex min-h-14 items-center gap-1 bg-surface pl-4">
	<button
		type="button"
		class="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 text-left focus-visible:-outline-offset-2"
		onclick={onedit}
	>
		<span class="flex min-w-0 flex-1 flex-col">
			<span class="truncate text-base text-text">{ingredient.food.name}</span>
			<span class="truncate text-sm text-text-muted tabular-nums">{detail}</span>
		</span>
		<span class="shrink-0 text-base font-medium text-text tabular-nums"
			>{Math.round(kcal)} kcal</span
		>
	</button>
	<IconButton label="More actions for {ingredient.food.name}" icon={Ellipsis} onclick={onmenu} />
</li>
