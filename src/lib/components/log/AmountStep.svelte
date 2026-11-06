<script lang="ts">
	import { untrack } from 'svelte';
	import {
		MAX_AMOUNT_GRAMS_OR_ML,
		MAX_AMOUNT_SERVINGS,
		MAX_PORTIONS
	} from '#lib/domain/constants.ts';
	import { snapshotFor, toGrams, type Nutrients, type Per100 } from '#lib/domain/nutrition.ts';
	import type { BatchLogUnit, FoodLogUnit } from '#lib/schemas/fields.ts';
	import type { Food } from '#lib/server/db/schema.ts';
	import { parseDecimal } from '#lib/utils/decimal.ts';
	import Pencil from '@lucide/svelte/icons/pencil';
	import { Button, Card, Input, SegmentedControl } from '#lib/components/ui/index.ts';
	import {
		batchUnitOptions,
		convertAmount,
		convertBatchAmount,
		defaultAmount,
		defaultBatchAmount,
		previewBatchAmount,
		unitOptions,
		type AmountValue,
		type BatchAmountSource,
		type BatchAmountValue
	} from './amount.ts';

	/**
	 * Amount step of the add sheet and of editing a logged entry: unit switch, amount, live preview. It prices either a
	 * food (units g or ml, and serving) or a batch (units portion, and g when the batch has a weight).
	 *
	 * The preview comes from `snapshotFor` (food) or `batchEntrySnapshot` (batch) and is display only; the server
	 * recomputes the snapshot it stores. `onsubmit` may reject: the step then shows an inline error and stays open so the
	 * person can retry. A batch step with a unit that is off (grams without a cooked weight) shows the reason under the
	 * unit switch.
	 */
	type Common = {
		/** "Log" adds a new entry, "Save" changes an existing one. */
		mode: 'add' | 'edit';
		/** Overrides the submit button's label, e.g. "Add" for a recipe ingredient. */
		submitLabel?: string;
		/** The last used amount (recents) or the entry's own amount (edit). */
		initial?: { amount: number; unit: string; grams?: number | null } | null;
		/** Shows a Back button when given. */
		onback?: () => void;
	};
	type FoodProps = Common & {
		food: Pick<
			Food,
			'name' | 'nutritionBasis' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'servingG'
		>;
		/**
		 * The values per 100 the preview scales. Defaults to the food's own; editing a logged entry passes the ones its
		 * stored snapshot implies, which is what the server rescales.
		 */
		per100?: Per100;
		batch?: undefined;
		onsubmit: (value: AmountValue) => void | Promise<void>;
		/** Shows an "Edit food" button when given. Editing the food never changes entries already logged. */
		onedit?: () => void;
	};
	type BatchProps = Common & {
		/** The batch to log, or the entry being edited, priced from its own snapshot (see `entryBatchSource`). */
		batch: BatchAmountSource;
		food?: undefined;
		per100?: undefined;
		onsubmit: (value: BatchAmountValue) => void | Promise<void>;
		onedit?: undefined;
	};
	type Props = FoodProps | BatchProps;

	const props: Props = $props();
	const uid = $props.id();
	const hintId = `${uid}-unit-hint`;

	type StepUnit = FoodLogUnit | BatchLogUnit;
	const NO_NUTRIENTS: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: null };

	// The food or batch and the initial amount are fixed for one step: the parent mounts a new step for another one.
	const start = untrack((): { amount: number; unit: StepUnit } =>
		props.batch
			? defaultBatchAmount(props.batch, props.initial)
			: defaultAmount(props.food, props.initial)
	);
	let unit = $state<StepUnit>(start.unit);
	let text = $state(format(start.amount));
	let touched = $state(false);
	let busy = $state(false);
	let failed = $state(false);

	const unitChoices = $derived(
		props.batch
			? batchUnitOptions(props.batch).map(({ value, disabled }) => ({
					value: value as StepUnit,
					label: value,
					disabled: disabled !== undefined
				}))
			: unitOptions(props.food).map((value) => ({ value: value as StepUnit, label: value }))
	);
	// Why a unit of a batch is off, shown under the switch.
	const unitHint = $derived(
		props.batch
			? batchUnitOptions(props.batch).find((option) => option.disabled !== undefined)?.disabled
			: undefined
	);
	const limit = $derived(
		unit === 'serving'
			? MAX_AMOUNT_SERVINGS
			: unit === 'portion'
				? MAX_PORTIONS
				: MAX_AMOUNT_GRAMS_OR_ML
	);
	const amount = $derived(parseDecimal(text));

	const error = $derived.by(() => {
		if (amount === null)
			return text.trim() === '' ? 'Enter an amount.' : 'Enter a number like 1,5 or 1.5.';
		if (amount <= 0) return 'Enter more than 0';
		if (amount > limit) return 'Too much for this unit';
		return undefined;
	});

	/** Nutrition and grams of the typed amount; nothing while the amount is not valid. */
	const priced = $derived.by((): { nutrients: Nutrients; grams: number | null } => {
		if (error !== undefined || amount === null) return { nutrients: NO_NUTRIENTS, grams: null };
		if (props.batch) {
			// The guard above keeps zero and non numbers out of `batchEntrySnapshot`, which throws on them.
			return (
				previewBatchAmount(props.batch, amount, unit as BatchLogUnit) ?? {
					nutrients: NO_NUTRIENTS,
					grams: null
				}
			);
		}
		const grams = toGrams(amount, unit as FoodLogUnit, props.food.servingG);
		return { nutrients: snapshotFor(props.per100 ?? props.food, grams), grams };
	});
	const preview = $derived(priced.nutrients);
	// The weight of what the amount means, shown when the unit hides it: servings of a food, portions of a batch.
	const shownGrams = $derived(
		(unit === 'serving' || unit === 'portion') && priced.grams !== null && priced.grams > 0
			? Math.round(priced.grams * 10) / 10
			: null
	);

	const header = $derived.by(() => {
		if (props.batch) {
			const { totals, portions, cookedWeightG } = props.batch.shape;
			// A gram entry of a batch that lost its weight has no portion size: show per 100 g instead.
			return props.batch.unavailable.portion !== undefined && cookedWeightG !== null
				? `${Math.round((totals.kcal * 100) / cookedWeightG)} kcal per 100 g`
				: `${Math.round(totals.kcal / portions)} kcal per portion`;
		}
		return `${Math.round((props.per100 ?? props.food).kcal)} kcal per 100 ${props.food.nutritionBasis}`;
	});
	const suffix = $derived(
		props.food && unit === 'serving' && props.food.servingG !== null
			? `x ${props.food.servingG} g`
			: unit
	);

	function format(value: number) {
		return String(Math.round(value * 100) / 100);
	}

	function setUnit(next: StepUnit) {
		if (next === unit) return;
		// Keep the same quantity: 80 g becomes 2 servings of 40 g, 1,5 portions of 400 g become 600 g.
		if (amount !== null && amount > 0) {
			text = format(
				props.batch
					? convertBatchAmount(props.batch, amount, unit as BatchLogUnit, next as BatchLogUnit)
					: convertAmount(amount, unit as FoodLogUnit, next as FoodLogUnit, props.food.servingG)
			);
		}
		unit = next;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		touched = true;
		if (error !== undefined || amount === null || busy) return;
		busy = true;
		failed = false;
		try {
			// The props pair `onsubmit` with `batch`: a batch step submits a batch unit, a food step a food unit.
			const send = props.onsubmit as (value: {
				amount: number;
				unit: StepUnit;
			}) => void | Promise<void>;
			await send({ amount, unit });
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}
</script>

<form class="flex flex-col gap-5" onsubmit={submit} novalidate>
	<div class="flex items-center justify-between gap-3">
		<p class="text-sm text-text-muted tabular-nums">{header}</p>
		{#if props.onedit}
			<div class="shrink-0">
				<Button variant="ghost" size="sm" icon={Pencil} onclick={props.onedit}>Edit food</Button>
			</div>
		{/if}
	</div>

	<div class="flex flex-col gap-3">
		<SegmentedControl
			label="Unit"
			options={unitChoices}
			bind:value={() => unit, setUnit}
			describedby={unitHint ? hintId : undefined}
			class="w-full"
		/>
		{#if unitHint}
			<p id={hintId} class="text-sm text-text-muted">{unitHint}</p>
		{/if}
		<Input
			label="Amount"
			bind:value={text}
			inputmode="decimal"
			autocomplete="off"
			{suffix}
			error={touched ? error : undefined}
			onblur={() => (touched = true)}
		/>
	</div>

	<Card>
		<div class="flex flex-col gap-3">
			<div class="flex items-baseline justify-between gap-3">
				<p class="text-3xl font-semibold text-text tabular-nums" data-testid="preview-kcal">
					{Math.round(preview.kcal)} kcal
				</p>
				{#if shownGrams !== null}
					<p class="text-base text-text-muted tabular-nums">{shownGrams} g</p>
				{/if}
			</div>
			<dl class="grid grid-cols-3 gap-3 text-sm">
				<div class="flex flex-col">
					<dt class="flex items-center gap-1.5 text-text-muted">
						<span class="size-2 rounded-full bg-protein" aria-hidden="true"></span>Protein
					</dt>
					<dd class="text-base text-text tabular-nums">{Math.round(preview.protein)} g</dd>
				</div>
				<div class="flex flex-col">
					<dt class="flex items-center gap-1.5 text-text-muted">
						<span class="size-2 rounded-full bg-carbs" aria-hidden="true"></span>Carbs
					</dt>
					<dd class="text-base text-text tabular-nums">{Math.round(preview.carbs)} g</dd>
				</div>
				<div class="flex flex-col">
					<dt class="flex items-center gap-1.5 text-text-muted">
						<span class="size-2 rounded-full bg-fat" aria-hidden="true"></span>Fat
					</dt>
					<dd class="text-base text-text tabular-nums">{Math.round(preview.fat)} g</dd>
				</div>
			</dl>
		</div>
	</Card>

	{#if failed}
		<p role="alert" class="text-sm text-danger">Could not save. Try again.</p>
	{/if}

	<div class="flex gap-2">
		{#if props.onback}
			<Button variant="secondary" onclick={props.onback}>Back</Button>
		{/if}
		<Button type="submit" loading={busy} disabled={error !== undefined}>
			{props.submitLabel ?? (props.mode === 'add' ? 'Log' : 'Save')}
		</Button>
	</div>
</form>
