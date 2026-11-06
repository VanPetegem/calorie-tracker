<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { isHttpError } from '@sveltejs/kit';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import NotebookPen from '@lucide/svelte/icons/notebook-pen';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import * as v from 'valibot';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { BatchInput, type ContainerInput } from '#lib/schemas/batch.ts';
	import type { BatchDetail } from '#lib/server/batches/repo.ts';
	import type { Container } from '#lib/server/db/schema.ts';
	import { addSheet } from '#lib/stores/add-sheet.svelte.ts';
	import { toasts } from '#lib/stores/toasts.svelte.ts';
	import { UnsavedGuard } from '#lib/stores/unsaved.svelte.ts';
	import { parseDecimal } from '#lib/utils/decimal.ts';
	import { Badge, Button, Card, Input, Sheet } from '#lib/components/ui/index.ts';
	import {
		deleteBatch,
		finishBatch,
		reopenBatch,
		saveBatch,
		saveContainer
	} from '../../../routes/(app)/recipes/batches.remote.ts';
	import { draftTotals, type BatchDraft, type DraftIngredient } from './draft.ts';
	import IngredientList from './IngredientList.svelte';
	import NutritionSummary from './NutritionSummary.svelte';
	import WeightField from './WeightField.svelte';

	/**
	 * Creates or edits a batch: name, date cooked, portions, cooked weight (with a container), the ingredient list and
	 * a live summary. One Save writes the whole batch. With `batch` (the stored batch) it also shows the header
	 * (portions left, per portion, per 100 g) and the actions: Log (opens the add sheet at this batch), Finish or
	 * Reopen, and Delete, which is off, with the reason, while the batch has live log entries.
	 *
	 * The fields are checked against `BatchInput`, the schema the server uses, when they lose focus. Save stays
	 * disabled, with the reason, while the batch is invalid. Existing lines keep their `id` through every edit, so the
	 * server keeps their snapshot; new lines have none and are snapshotted at save time. The form is not editable
	 * while a save runs, so no edit can slip in between the save and the ids the server gives new lines. Unsaved
	 * changes ask before an in app navigation and trigger the browser prompt on reload or close.
	 *
	 * A line the server refuses on save comes back with its index and is marked in the list until that line changes.
	 */
	type Props = {
		draft: BatchDraft;
		/** The stored batch, for the header and actions. Absent on the new batch page. */
		batch?: Omit<BatchDetail, 'ingredients'>;
		containers: Container[];
	};

	let { draft, batch, containers }: Props = $props();

	// The form is prefilled once: another batch mounts a new form.
	const start = untrack(() => draft);
	let savedId = $state(start.id);
	let moved = start.id !== undefined;
	let root = $state<HTMLElement>();

	const text = (value: number | string | null | undefined) => (value == null ? '' : String(value));

	let name = $state(text(start.name));
	let cookedOn = $state(start.cookedOn);
	let portions = $state(text(start.portions));
	let weight = $state<number | null>(start.cookedWeightG);
	let weightProblem = $state<string | undefined>();
	let ingredients = $state<DraftIngredient[]>(start.ingredients);

	// Containers made on this page join the list at once; the loaded list catches up after the refresh.
	let created = $state<Container[]>([]);
	const allContainers = $derived([
		...containers,
		...created.filter((made) => !containers.some((known) => known.id === made.id))
	]);

	const FIELDS = ['name', 'cookedOn', 'portions'] as const;
	type Field = (typeof FIELDS)[number];

	let touched = $state<Partial<Record<Field, boolean>>>({});
	let submitted = $state(false);
	let busy = $state(false);
	let failure = $state<string | null>(null);
	let finishing = $state(false);
	let deleting = $state(false);
	let confirmDelete = $state(false);

	const input = $derived({
		...(savedId === undefined ? {} : { id: savedId }),
		recipeId: start.recipeId,
		name,
		cookedOn,
		portions,
		cookedWeightG: weight,
		ingredients: ingredients.map(({ id, food, amount, unit }) => ({
			...(id === undefined ? {} : { id }),
			foodId: food.id,
			amount,
			unit
		}))
	});
	const result = $derived(v.safeParse(BatchInput, input));

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
		cookedOn: 'Enter the date cooked',
		portions: 'Enter the portions'
	};

	/** Why Save is off. The ingredient messages are the schema's own ("Add at least one ingredient"). */
	const blocker = $derived.by(() => {
		if (!result.success) {
			const [issue] = result.issues;
			const key = issue?.path?.[0]?.key;
			return (typeof key === 'string' && REASONS[key]) || issue?.message || 'Check the batch';
		}
		return weightProblem ? 'Check the cooked weight' : undefined;
	});

	// What the form holds, compared with what it held when it was loaded or last saved.
	const current = $derived(
		JSON.stringify([
			name,
			cookedOn,
			portions,
			weight,
			ingredients.map((i) => [i.food.id, i.amount, i.unit])
		])
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

	const attention = $derived(Object.keys(lineErrors).length);
	const totals = $derived(draftTotals(ingredients));
	const portionCount = $derived(parseDecimal(portions));
	// Per 100 g of the weight typed now, as the saved batch will have it.
	const per100g = $derived(
		weight === null
			? null
			: {
					kcal: (totals.kcal / weight) * 100,
					protein: (totals.protein / weight) * 100,
					carbs: (totals.carbs / weight) * 100,
					fat: (totals.fat / weight) * 100,
					fiber: totals.fiber === null ? null : (totals.fiber / weight) * 100
				}
	);

	async function refresh() {
		// Saved: a failed refresh only means the lists catch up on their next load.
		try {
			await invalidateAll();
		} catch {
			// ignored on purpose
		}
	}

	/** Brings a marked row into view; no animation when the person prefers reduced motion. */
	async function showRow(key: string) {
		await tick();
		const row = root?.querySelector(`[data-ingredient-key="${CSS.escape(key)}"]`);
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		row?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
	}

	async function save() {
		submitted = true;
		if (!result.success || weightProblem || busy) return;
		const output = result.output;
		const sent = current;
		const sentLines = [...ingredients];
		busy = true;
		failure = null;
		lineError = null;
		let outcome;
		try {
			outcome = await saveBatch(output);
		} catch (cause) {
			failure = isHttpError(cause, 404) ? cause.body.message : 'Could not save. Try again.';
			busy = false;
			return;
		}
		if (!outcome.ok) {
			busy = false;
			const line = sentLines[outcome.index];
			if (line) {
				lineError = {
					key: line.key,
					amount: line.amount,
					unit: line.unit,
					message: outcome.message
				};
				await showRow(line.key);
			}
			return;
		}
		// Busy stays on until the form has settled (refresh, and the move to a new batch's address), so a second tap on
		// Save cannot start another save in between.
		try {
			savedId = outcome.id;
			baseline = sent;
			toasts.show({ message: 'Batch saved', tone: 'success' });
			await refresh();
			if (!moved) {
				moved = true;
				await goto(resolve('/(app)/recipes/batches/[id]', { id: outcome.id }), {
					replaceState: true
				});
			}
		} finally {
			busy = false;
		}
	}

	async function createContainer(container: ContainerInput): Promise<Container> {
		const made = await saveContainer(container);
		created = [...created, made];
		await refresh();
		return made;
	}

	async function toggleFinished() {
		if (!batch || finishing) return;
		const reopening = batch.finishedAt !== null;
		finishing = true;
		try {
			await (reopening ? reopenBatch({ id: batch.id }) : finishBatch({ id: batch.id }));
		} catch {
			toasts.show({
				message: `Could not ${reopening ? 'reopen' : 'finish'}. Try again.`,
				tone: 'danger'
			});
			finishing = false;
			return;
		}
		toasts.show({ message: reopening ? 'Batch reopened' : 'Batch finished', tone: 'success' });
		await refresh();
		finishing = false;
	}

	async function remove() {
		if (!batch || deleting) return;
		deleting = true;
		let outcome;
		try {
			outcome = await deleteBatch({ id: batch.id });
		} catch {
			toasts.show({ message: 'Could not delete. Try again.', tone: 'danger' });
			deleting = false;
			return;
		}
		confirmDelete = false;
		if (!outcome.ok) {
			toasts.show({ message: outcome.message, tone: 'danger' });
			await refresh();
			deleting = false;
			return;
		}
		// Leaving on purpose: unsaved edits of a deleted batch are not worth a question.
		guard.allow();
		toasts.show({ message: `Deleted ${batch.name}`, tone: 'success' });
		await refresh();
		await goto(resolve('/(app)/recipes'));
	}

	const round1 = (value: number) => Math.round(value * 10) / 10;
	const portionsLeftText = $derived.by(() => {
		if (!batch) return '';
		const total = round1(batch.portions);
		return `${round1(Math.max(0, batch.portionsLeft))} of ${total} ${total === 1 ? 'portion' : 'portions'} left`;
	});
	const deleteReason = 'Logged batches can be finished, not deleted';
</script>

<svelte:window onbeforeunload={guard.onbeforeunload} />

<!-- Not a <form>: the ingredient list holds sheets with forms of their own, and forms cannot nest. -->
<div bind:this={root} class="flex flex-col gap-6">
	{#if batch}
		<Card>
			<div class="flex flex-col gap-4">
				<div class="flex flex-col gap-1">
					<div class="flex flex-wrap items-center gap-2">
						<p class="text-2xl font-semibold text-text" data-testid="portions-left">
							{portionsLeftText}
						</p>
						{#if batch.finishedAt !== null}
							<Badge>Finished</Badge>
						{/if}
					</div>
					<p class="text-base text-text-muted tabular-nums">
						<span data-testid="header-per-portion">{Math.round(batch.perPortion.kcal)} kcal</span>
						per portion{#if batch.per100g}
							·
							<span data-testid="header-per-100g">{Math.round(batch.per100g.kcal)} kcal</span> per 100
							g{/if}
					</p>
				</div>
				<div class="flex flex-wrap gap-2">
					<Button icon={NotebookPen} onclick={() => addSheet.openBatch(batch)}>Log</Button>
					<Button
						variant="secondary"
						icon={batch.finishedAt === null ? CircleCheck : RotateCcw}
						loading={finishing}
						onclick={toggleFinished}
					>
						{batch.finishedAt === null ? 'Finish' : 'Reopen'}
					</Button>
					<Button
						variant="destructive"
						icon={Trash2}
						disabled={batch.liveEntryCount > 0}
						disabledReason={deleteReason}
						onclick={() => (confirmDelete = true)}
					>
						Delete
					</Button>
				</div>
			</div>
		</Card>
	{/if}

	<!-- Inert while a save runs: nothing can change between the saved batch and the ids its new lines get. -->
	<div class="flex flex-col gap-6" inert={busy}>
		<div class="flex flex-col gap-3">
			<Input
				label="Name"
				bind:value={name}
				autocomplete="off"
				error={shown('name')}
				onblur={blur('name')}
			/>
			<Input
				label="Cooked on"
				type="date"
				bind:value={cookedOn}
				error={shown('cookedOn')}
				onblur={blur('cookedOn')}
			/>
			<Input
				label="Portions"
				bind:value={portions}
				inputmode="decimal"
				autocomplete="off"
				hint="How many portions the whole batch makes."
				error={shown('portions')}
				onblur={blur('portions')}
			/>
			<WeightField
				bind:value={weight}
				bind:error={weightProblem}
				containers={allContainers}
				oncreatecontainer={createContainer}
			/>
		</div>

		<section class="flex flex-col gap-3" aria-labelledby="ingredients-heading">
			<h2 id="ingredients-heading" class="text-lg font-semibold text-text">Ingredients</h2>
			<IngredientList bind:ingredients errors={lineErrors} />
		</section>

		<NutritionSummary {totals} portions={portionCount} {per100g} />

		{#if failure}
			<p role="alert" class="text-sm text-danger">{failure}</p>
		{/if}

		<div class="flex flex-col">
			<!-- One status node for every state, so the summary is announced when it appears. Empty, it takes no space. -->
			<p role="status" class="text-sm text-danger not-empty:mb-2">
				{#if attention > 0}{attention}
					{attention === 1 ? 'ingredient needs' : 'ingredients need'} attention{/if}
			</p>
			<Button
				loading={busy}
				disabled={blocker !== undefined}
				disabledReason={blocker}
				onclick={save}
				class="w-full"
			>
				{failure || attention > 0 ? 'Retry' : 'Save batch'}
			</Button>
		</div>
	</div>
</div>

<Sheet
	bind:open={guard.open}
	title="Discard changes?"
	description="Your changes to this batch are not saved."
	onclose={() => guard.keep()}
>
	<p class="text-base text-text-muted">Leaving now throws them away.</p>
	{#snippet footer()}
		<Button variant="secondary" onclick={() => guard.keep()}>Keep editing</Button>
		<Button variant="destructive" onclick={() => guard.discard()}>Discard</Button>
	{/snippet}
</Sheet>

<Sheet
	bind:open={confirmDelete}
	title="Delete this batch?"
	description="Its ingredients go with it. This cannot be undone."
>
	<p class="text-base text-text-muted">{batch?.name}</p>
	{#snippet footer()}
		<Button variant="secondary" onclick={() => (confirmDelete = false)}>Keep it</Button>
		<Button variant="destructive" loading={deleting} onclick={remove}>Delete</Button>
	{/snippet}
</Sheet>
