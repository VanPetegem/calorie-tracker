<script lang="ts">
	import { untrack } from 'svelte';
	import { MAX_AMOUNT_GRAMS_OR_ML, MAX_AMOUNT_SERVINGS } from '#lib/domain/constants.ts';
	import { snapshotFor, toGrams } from '#lib/domain/nutrition.ts';
	import type { LogUnit } from '#lib/schemas/fields.ts';
	import type { Food } from '#lib/server/db/schema.ts';
	import { parseDecimal } from '#lib/utils/decimal.ts';
	import { Button, Card, Input, SegmentedControl } from '#lib/components/ui/index.ts';
	import { convertAmount, defaultAmount, unitOptions, type AmountValue } from './amount.ts';

	/**
	 * Amount step of the add sheet and of editing a logged food: unit switch, amount, live preview.
	 *
	 * The preview comes from `snapshotFor` and is display only; the server recomputes the snapshot it stores.
	 * `onsubmit` may reject: the step then shows an inline error and stays open so the person can retry.
	 */
	type Props = {
		food: Pick<
			Food,
			'name' | 'nutritionBasis' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'servingG'
		>;
		/** "Log" adds a new entry, "Save" changes an existing one. */
		mode: 'add' | 'edit';
		/** The last used amount (recents) or the entry's own amount (edit). */
		initial?: { amount: number; unit: string } | null;
		onsubmit: (value: AmountValue) => void | Promise<void>;
		/** Shows a Back button when given. */
		onback?: () => void;
	};

	let { food, mode, initial = null, onsubmit, onback }: Props = $props();

	// The food and initial amount are fixed for one step: the parent mounts a new step for another food.
	const start = untrack(() => defaultAmount(food, initial));
	let unit = $state<LogUnit>(start.unit);
	let text = $state(format(start.amount));
	let touched = $state(false);
	let busy = $state(false);
	let failed = $state(false);

	const options = $derived(unitOptions(food).map((value) => ({ value, label: value })));
	const limit = $derived(unit === 'serving' ? MAX_AMOUNT_SERVINGS : MAX_AMOUNT_GRAMS_OR_ML);
	const amount = $derived(parseDecimal(text));

	const error = $derived.by(() => {
		if (amount === null)
			return text.trim() === '' ? 'Enter an amount.' : 'Enter a number like 1,5 or 1.5.';
		if (amount <= 0) return 'Enter more than 0';
		if (amount > limit) return 'Too much for this unit';
		return undefined;
	});

	const grams = $derived(
		error === undefined && amount !== null ? toGrams(amount, unit, food.servingG) : 0
	);
	const preview = $derived(snapshotFor(food, grams));

	function format(value: number) {
		return String(Math.round(value * 100) / 100);
	}

	function setUnit(next: LogUnit) {
		if (next === unit) return;
		// Keep the same quantity of food: 80 g becomes 2 servings of 40 g.
		if (amount !== null && amount > 0) {
			text = format(convertAmount(amount, unit, next, food.servingG));
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
			await onsubmit({ amount, unit });
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}
</script>

<form class="flex flex-col gap-5" onsubmit={submit} novalidate>
	<p class="text-sm text-text-muted tabular-nums">
		{Math.round(food.kcal)} kcal per 100 {food.nutritionBasis}
	</p>

	<div class="flex flex-col gap-3">
		<SegmentedControl label="Unit" {options} bind:value={() => unit, setUnit} class="w-full" />
		<Input
			label="Amount"
			bind:value={text}
			inputmode="decimal"
			autocomplete="off"
			suffix={unit === 'serving' && food.servingG !== null ? `x ${food.servingG} g` : unit}
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
				{#if unit === 'serving' && grams > 0}
					<p class="text-base text-text-muted tabular-nums">{Math.round(grams * 10) / 10} g</p>
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
		{#if onback}
			<Button variant="secondary" onclick={onback}>Back</Button>
		{/if}
		<Button type="submit" loading={busy} disabled={error !== undefined}>
			{mode === 'add' ? 'Log' : 'Save'}
		</Button>
	</div>
</form>
