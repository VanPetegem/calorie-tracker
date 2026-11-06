<script lang="ts">
	import { tick } from 'svelte';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Carrot from '@lucide/svelte/icons/carrot';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { MAX_INGREDIENTS } from '#lib/domain/constants.ts';
	import type { Food } from '#lib/server/db/schema.ts';
	import { Button, Card, EmptyState, Sheet } from '#lib/components/ui/index.ts';
	import { toasts, withUndo } from '#lib/stores/toasts.svelte.ts';
	import AmountStep from '../log/AmountStep.svelte';
	import type { AmountValue } from '../log/amount.ts';
	import AddIngredientSheet from './AddIngredientSheet.svelte';
	import {
		draftNutrients,
		draftTotals,
		foodPer100,
		newKey,
		type DraftIngredient,
		type Per100Of
	} from './draft.ts';
	import IngredientRow from './IngredientRow.svelte';

	/**
	 * The ingredients of a recipe or batch, shared by both editors. Rows show name, amount and kcal; a tap opens the
	 * amount step, the row menu moves the row up or down or removes it (with Undo that restores the same index), and
	 * "Add ingredient" opens the picker. The list is edited in place through the bound `ingredients`.
	 *
	 * `per100` says which values per 100 an ingredient's nutrition comes from: its food by default, a stored snapshot
	 * for a batch.
	 */
	type Props = {
		ingredients: DraftIngredient[];
		per100?: Per100Of;
	};

	let { ingredients = $bindable(), per100 = foodPer100 }: Props = $props();

	const full = $derived(ingredients.length >= MAX_INGREDIENTS);
	const totalKcal = $derived(Math.round(draftTotals(ingredients, per100).kcal));

	let addOpen = $state(false);

	function add(food: Food, { amount, unit }: AmountValue) {
		const { id, name, nutritionBasis, kcal, protein, carbs, fat, fiber, servingG } = food;
		ingredients = [
			...ingredients,
			{
				key: newKey(),
				food: { id, name, nutritionBasis, kcal, protein, carbs, fat, fiber, servingG },
				amount,
				unit
			}
		];
	}

	// Change the amount: one sheet for the whole list. `editKey` stays after closing so the content does not vanish
	// during the exit transition; `openings` mounts a fresh amount step for each opening.
	let editKey = $state<string | null>(null);
	let editOpen = $state(false);
	let openings = $state(0);
	const editing = $derived(ingredients.find((i) => i.key === editKey));

	function edit(ingredient: DraftIngredient) {
		editKey = ingredient.key;
		openings++;
		editOpen = true;
	}

	function saveAmount(key: string, { amount, unit }: AmountValue) {
		// The stored grams belonged to the old amount: the row is computed from the new one from here on.
		ingredients = ingredients.map((i) =>
			i.key === key ? { key: i.key, food: i.food, amount, unit } : i
		);
		editOpen = false;
	}

	// Row menu: one sheet for the whole list. The name is kept so it stays while the sheet closes.
	let menu = $state<{ key: string; name: string } | null>(null);
	let menuOpen = $state(false);
	const menuIndex = $derived(menu ? ingredients.findIndex((i) => i.key === menu!.key) : -1);

	function openMenu(ingredient: DraftIngredient) {
		menu = { key: ingredient.key, name: ingredient.food.name };
		menuOpen = true;
	}

	function move(by: -1 | 1) {
		const from = menuIndex;
		const to = from + by;
		if (from < 0 || to < 0 || to >= ingredients.length) return;
		const next = [...ingredients];
		[next[from], next[to]] = [next[to]!, next[from]!];
		ingredients = next;
	}

	let list = $state<HTMLElement>();
	let addHost = $state<HTMLElement>();
	// Focus waits for the menu sheet to close: the page behind a modal sheet cannot take focus until then.
	let focusAfterMenu: (() => void) | null = null;

	function focusAfterRemoval(index: number) {
		focusAfterMenu = async () => {
			await tick();
			const rows = list?.querySelectorAll(':scope > li');
			// The next row now sits at `index`; after removing the last row, the previous one is the last.
			const row = rows?.length ? rows[Math.min(index, rows.length - 1)] : null;
			(row ?? addHost)?.querySelector('button')?.focus();
		};
	}

	function menuClosed() {
		const run = focusAfterMenu;
		focusAfterMenu = null;
		run?.();
	}

	// An Undo toast must not outlive the list: Undo would write to a list that is gone.
	const dismissers: (() => void)[] = [];
	$effect(() => () => {
		for (const dismiss of dismissers) dismiss();
	});

	function remove() {
		const index = menuIndex;
		const removed = ingredients[index];
		menuOpen = false;
		if (!removed) return;
		focusAfterRemoval(index);
		dismissers.push(
			withUndo({
				message: `Removed ${removed.food.name}`,
				apply: () => (ingredients = ingredients.filter((i) => i.key !== removed.key)),
				revert: () => {
					if (ingredients.some((i) => i.key === removed.key)) return;
					// Room was used up in the meantime: leave the list as it is and say so.
					if (ingredients.length >= MAX_INGREDIENTS) {
						toasts.show({
							message: `Not restored: at most ${MAX_INGREDIENTS} ingredients`,
							tone: 'danger'
						});
						return;
					}
					const next = [...ingredients];
					next.splice(index, 0, removed);
					ingredients = next;
				}
			})
		);
	}
</script>

<div class="flex flex-col gap-3">
	{#if ingredients.length > 0}
		<ul
			bind:this={list}
			class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
		>
			{#each ingredients as ingredient (ingredient.key)}
				<IngredientRow
					{ingredient}
					kcal={draftNutrients(ingredient, per100).kcal}
					onedit={() => edit(ingredient)}
					onmenu={() => openMenu(ingredient)}
				/>
			{/each}
		</ul>
		<p class="text-right text-base font-medium text-text tabular-nums">Total {totalKcal} kcal</p>
	{:else}
		<Card>
			<EmptyState
				icon={Carrot}
				title="Add the raw ingredients"
				body="Weigh each one before cooking. The totals update as you add them."
			/>
		</Card>
	{/if}
	<div bind:this={addHost}>
		<Button
			variant="secondary"
			icon={Plus}
			disabled={full}
			disabledReason="At most {MAX_INGREDIENTS} ingredients"
			onclick={() => (addOpen = true)}
		>
			Add ingredient
		</Button>
	</div>
</div>

<AddIngredientSheet bind:open={addOpen} onadd={add} />

<Sheet
	bind:open={editOpen}
	title={editing?.food.name ?? 'Ingredient'}
	description="Change the amount"
>
	{#if editing}
		{#key openings}
			<AmountStep
				food={editing.food}
				per100={per100(editing)}
				mode="edit"
				initial={{ amount: editing.amount, unit: editing.unit, grams: editing.grams }}
				onsubmit={(value) => saveAmount(editing.key, value)}
			/>
		{/key}
	{/if}
</Sheet>

<Sheet
	bind:open={menuOpen}
	onclose={menuClosed}
	title={menu?.name ?? 'Ingredient'}
	description={menuIndex >= 0 ? `Position ${menuIndex + 1} of ${ingredients.length}` : undefined}
>
	<div class="flex flex-col gap-2">
		<Button
			variant="secondary"
			icon={ArrowUp}
			disabled={menuIndex <= 0}
			disabledReason="Already the first ingredient"
			class="w-full"
			onclick={() => move(-1)}
		>
			Move up
		</Button>
		<Button
			variant="secondary"
			icon={ArrowDown}
			disabled={menuIndex < 0 || menuIndex >= ingredients.length - 1}
			disabledReason="Already the last ingredient"
			class="w-full"
			onclick={() => move(1)}
		>
			Move down
		</Button>
		<Button variant="destructive" icon={Trash2} class="w-full" onclick={remove}>Remove</Button>
	</div>
</Sheet>
