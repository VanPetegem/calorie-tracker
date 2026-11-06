<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import { IconButton } from '#lib/components/ui/index.ts';
	import type { DraftIngredient } from './draft.ts';

	/**
	 * One ingredient of a recipe or batch: name, amount with unit and kcal. Tap the row to change the amount; the
	 * menu button opens the row's actions. The caller supplies the kcal, so a batch can show its snapshot. An `error`
	 * (the server refused this line on save) marks the row and is read out as the row button's description.
	 */
	type Props = {
		ingredient: DraftIngredient;
		kcal: number;
		onedit: () => void;
		onmenu: () => void;
		error?: string;
	};

	let { ingredient, kcal, onedit, onmenu, error }: Props = $props();

	const errorId = $props.id();

	const detail = $derived.by(() => {
		const { amount, unit } = ingredient;
		const shown = Math.round(amount * 100) / 100;
		return `${shown} ${unit === 'serving' ? (amount === 1 ? 'serving' : 'servings') : unit}`;
	});
</script>

<li class={['bg-surface', error && 'border-l-4 border-danger']}>
	<div class="flex min-h-14 items-center gap-1 pl-4">
		<button
			type="button"
			class="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 text-left focus-visible:-outline-offset-2"
			aria-describedby={error ? errorId : undefined}
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
	</div>
	{#if error}
		<p id={errorId} role="alert" class="flex items-start gap-1.5 px-4 pb-3 text-sm text-danger">
			<CircleAlert size={16} class="mt-px shrink-0" aria-hidden="true" />
			<span>{error}</span>
		</p>
	{/if}
</li>
