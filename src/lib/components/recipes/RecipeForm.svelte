<script lang="ts">
	import { untrack } from 'svelte';
	import { isHttpError } from '@sveltejs/kit';
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import * as v from 'valibot';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { RecipeInput } from '#lib/schemas/recipe.ts';
	import { UnsavedGuard } from '#lib/stores/unsaved.svelte.ts';
	import { toasts, withUndo } from '#lib/stores/toasts.svelte.ts';
	import { parseDecimal } from '#lib/utils/decimal.ts';
	import { Button, Card, Input, Sheet } from '#lib/components/ui/index.ts';
	import {
		archiveRecipe,
		restoreRecipe,
		saveRecipe
	} from '../../../routes/(app)/recipes/recipes.remote.ts';
	import { draftTotals, type DraftIngredient, type RecipeDraft } from './draft.ts';
	import IngredientList from './IngredientList.svelte';
	import NutritionSummary from './NutritionSummary.svelte';

	/**
	 * Creates or edits a recipe: name, portions, notes, the ingredient list and a live summary. One Save writes the
	 * whole recipe.
	 *
	 * The fields are checked against `RecipeInput` (the schema the server uses) when they lose focus. Save stays
	 * disabled, with the reason, while the recipe is invalid. Without `recipe.id` it creates a recipe and then opens
	 * it at its own address; with one it edits it. Unsaved changes ask before an in app navigation and trigger the
	 * browser prompt on reload or close. An archived recipe shows a banner with Restore; archiving offers Undo.
	 *
	 * A line the server refuses on save (a food that is gone, a serving of a food without serving size) comes back
	 * with its index and is marked in the list until that line changes.
	 */
	type Props = {
		recipe?: RecipeDraft;
		archived?: boolean;
	};

	let { recipe, archived = false }: Props = $props();

	// The form is prefilled once: another recipe mounts a new form.
	const start = untrack(() => recipe);
	const recipeId = start?.id;
	const savedName = start?.name;

	const text = (value: number | string | null | undefined) => (value == null ? '' : String(value));

	let name = $state(text(start?.name));
	let portions = $state(text(start?.defaultPortions ?? 1));
	let notes = $state(text(start?.notes));
	let ingredients = $state<DraftIngredient[]>(start?.ingredients ?? []);

	const FIELDS = ['name', 'defaultPortions', 'notes'] as const;
	type Field = (typeof FIELDS)[number];

	let touched = $state<Partial<Record<Field, boolean>>>({});
	let submitted = $state(false);
	let busy = $state(false);
	/** The message of a failed save; the form stays as it is and the button says Retry. */
	let failure = $state<string | null>(null);
	let archiving = $state(false);
	let restoring = $state(false);

	const input = $derived({
		...(recipeId === undefined ? {} : { id: recipeId }),
		name,
		defaultPortions: portions,
		notes,
		ingredients: ingredients.map(({ food, amount, unit }) => ({ foodId: food.id, amount, unit }))
	});
	const result = $derived(v.safeParse(RecipeInput, input));

	const errors = $derived.by(() => {
		const found: Partial<Record<Field, string>> = {};
		for (const issue of result.issues ?? []) {
			const key = issue.path?.[0]?.key;
			if (typeof key === 'string' && FIELDS.includes(key as Field)) {
				found[key as Field] ??= issue.message;
			}
		}
		return found;
	});

	const shown = (field: Field) => (touched[field] || submitted ? errors[field] : undefined);
	const blur = (field: Field) => () => (touched[field] = true);

	const REASONS: Record<string, string> = {
		name: 'Enter a name',
		defaultPortions: 'Enter the portions',
		notes: 'Shorten the notes'
	};

	/** Why Save is off. The ingredient messages are the schema's own ("Add at least one ingredient"). */
	const blocker = $derived.by(() => {
		if (result.success) return undefined;
		const [issue] = result.issues;
		const key = issue?.path?.[0]?.key;
		return (typeof key === 'string' && REASONS[key]) || issue?.message || 'Check the recipe';
	});

	// What the form holds, compared with what it held when it was loaded or last saved.
	const current = $derived(
		JSON.stringify([name, portions, notes, ingredients.map((i) => [i.food.id, i.amount, i.unit])])
	);
	let baseline = $state(untrack(() => current));
	const dirty = $derived(current !== baseline);

	const guard = new UnsavedGuard(() => dirty);

	// A refused line, marked until it changes or goes away.
	let lineError = $state<{ key: string; amount: number; unit: string; message: string } | null>(
		null
	);
	const lineErrors = $derived.by(() => {
		const marked = lineError;
		if (!marked) return {};
		const line = ingredients.find((i) => i.key === marked.key);
		return line && line.amount === marked.amount && line.unit === marked.unit
			? { [marked.key]: marked.message }
			: {};
	});

	const totals = $derived(draftTotals(ingredients));
	const portionCount = $derived(parseDecimal(portions));

	async function refresh() {
		// Saved: a failed refresh only means the lists catch up on their next load.
		try {
			await invalidateAll();
		} catch {
			// ignored on purpose
		}
	}

	async function save() {
		submitted = true;
		if (!result.success || busy) return;
		const output = result.output;
		const sent = current;
		const sentLines = [...ingredients];
		busy = true;
		failure = null;
		lineError = null;
		let outcome;
		try {
			outcome = await saveRecipe(output);
		} catch (cause) {
			failure = isHttpError(cause, 404) ? cause.body.message : 'Could not save. Try again.';
			return;
		} finally {
			busy = false;
		}
		if (!outcome.ok) {
			const line = sentLines[outcome.index];
			if (line) {
				lineError = {
					key: line.key,
					amount: line.amount,
					unit: line.unit,
					message: outcome.message
				};
			}
			return;
		}
		baseline = sent;
		toasts.show({ message: 'Recipe saved', tone: 'success' });
		await refresh();
		if (recipeId === undefined) {
			await goto(resolve('/(app)/recipes/[id]', { id: outcome.id }), { replaceState: true });
		}
	}

	async function archive() {
		if (recipeId === undefined || archiving) return;
		archiving = true;
		try {
			await archiveRecipe({ id: recipeId });
		} catch {
			toasts.show({ message: 'Could not archive. Try again.', tone: 'danger' });
			archiving = false;
			return;
		}
		// Leaving on purpose: unsaved edits of an archived recipe are not worth a question.
		guard.allow();
		withUndo({
			message: `Archived ${savedName}`,
			apply: () => void goto(resolve('/(app)/recipes')),
			revert: async () => {
				await restoreRecipe({ id: recipeId });
				await refresh();
			}
		});
	}

	async function restore() {
		if (recipeId === undefined || restoring) return;
		restoring = true;
		try {
			await restoreRecipe({ id: recipeId });
		} catch {
			toasts.show({ message: 'Could not restore. Try again.', tone: 'danger' });
			return;
		} finally {
			restoring = false;
		}
		await refresh();
		toasts.show({ message: 'Recipe restored', tone: 'success' });
	}
</script>

<svelte:window onbeforeunload={guard.onbeforeunload} />

<!-- Not a <form>: the ingredient list holds sheets with forms of their own, and forms cannot nest. -->
<div class="flex flex-col gap-6">
	{#if archived}
		<Card>
			<div class="flex flex-col gap-3">
				<p class="text-base text-text">
					This recipe is archived. It is hidden from the list until you restore it.
				</p>
				<div>
					<Button variant="secondary" icon={ArchiveRestore} loading={restoring} onclick={restore}>
						Restore
					</Button>
				</div>
			</div>
		</Card>
	{/if}

	<div class="flex flex-col gap-3">
		<Input
			label="Name"
			bind:value={name}
			autocomplete="off"
			error={shown('name')}
			onblur={blur('name')}
		/>
		<Input
			label="Portions"
			bind:value={portions}
			inputmode="decimal"
			autocomplete="off"
			hint="How many portions the whole recipe makes."
			error={shown('defaultPortions')}
			onblur={blur('defaultPortions')}
		/>
		<Input
			label="Notes (optional)"
			bind:value={notes}
			autocomplete="off"
			error={shown('notes')}
			onblur={blur('notes')}
		/>
	</div>

	<section class="flex flex-col gap-3" aria-labelledby="ingredients-heading">
		<h2 id="ingredients-heading" class="text-lg font-semibold text-text">Ingredients</h2>
		<IngredientList bind:ingredients errors={lineErrors} />
	</section>

	<NutritionSummary {totals} portions={portionCount} />

	{#if failure}
		<p role="alert" class="text-sm text-danger">{failure}</p>
	{/if}

	<div class="flex">
		<Button
			loading={busy}
			disabled={blocker !== undefined}
			disabledReason={blocker}
			onclick={save}
			class="w-full"
		>
			{failure ? 'Retry' : 'Save recipe'}
		</Button>
	</div>

	{#if recipeId !== undefined && !archived}
		<div class="flex">
			<Button variant="ghost" icon={Archive} loading={archiving} onclick={archive} class="w-full">
				Archive recipe
			</Button>
		</div>
	{/if}
</div>

<Sheet
	bind:open={guard.open}
	title="Discard changes?"
	description="Your changes to this recipe are not saved."
	onclose={() => guard.keep()}
>
	<p class="text-base text-text-muted">Leaving now throws them away.</p>
	{#snippet footer()}
		<Button variant="secondary" onclick={() => guard.keep()}>Keep editing</Button>
		<Button variant="destructive" onclick={() => guard.discard()}>Discard</Button>
	{/snippet}
</Sheet>
