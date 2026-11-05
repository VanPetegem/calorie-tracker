<script lang="ts">
	import { untrack } from 'svelte';
	import * as v from 'valibot';
	import { invalidateAll } from '$app/navigation';
	import { FoodInput } from '#lib/schemas/food.ts';
	import type { Food } from '#lib/server/db/schema.ts';
	import { Button, Input, SegmentedControl } from '#lib/components/ui/index.ts';
	import { createFood, updateFood } from '../../../routes/(app)/foods.remote.ts';

	/**
	 * Creates or edits a food: name, nutrition per 100 g (or ml) and an optional serving weight and barcode.
	 *
	 * Each field is checked against `FoodInput` (the schema the server uses) when it loses focus, and all of them
	 * when saving. Without `foodId` it creates a custom food; with it, it edits that food (an OFF or BLV food keeps
	 * the fix through refreshes). `initial` prefills, e.g. the barcode of an unknown product from the scanner's
	 * miss flow. `onsaved` receives the saved food. With `preview` (the /design route) nothing is sent.
	 */
	type Props = {
		initial?: Partial<FoodInput>;
		foodId?: string;
		onsaved: (food: Food) => void;
		oncancel?: () => void;
		preview?: boolean;
	};

	let { initial = {}, foodId, onsaved, oncancel, preview = false }: Props = $props();

	const FIELDS = [
		'name',
		'brand',
		'barcode',
		'kcal',
		'protein',
		'carbs',
		'fat',
		'fiber',
		'servingG'
	] as const;
	type Field = (typeof FIELDS)[number];

	const text = (value: string | number | null | undefined) => (value == null ? '' : String(value));

	// The form is prefilled once: a new form is mounted for another food.
	const start = untrack(() => initial);
	let values = $state<Record<Field, string>>({
		name: text(start.name),
		brand: text(start.brand),
		barcode: text(start.barcode),
		kcal: text(start.kcal),
		protein: text(start.protein),
		carbs: text(start.carbs),
		fat: text(start.fat),
		fiber: text(start.fiber),
		servingG: text(start.servingG)
	});
	let basis = $state<'g' | 'ml'>(start.nutritionBasis ?? 'g');
	let touched = $state<Partial<Record<Field, boolean>>>({});
	let submitted = $state(false);
	let busy = $state(false);
	let failed = $state(false);
	let previewed = $state(false);
	// The food that already has the barcode, when a save was refused for it. The message goes when the barcode changes.
	let barcodeOwner = $state<{ name: string; barcode: string } | null>(null);

	const result = $derived(v.safeParse(FoodInput, { ...values, nutritionBasis: basis }));
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

	function shown(field: Field): string | undefined {
		if (field === 'barcode' && barcodeOwner && barcodeOwner.barcode === values.barcode) {
			return `This barcode is already in your library as ${barcodeOwner.name}.`;
		}
		return touched[field] || submitted ? errors[field] : undefined;
	}

	const blur = (field: Field) => () => (touched[field] = true);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		submitted = true;
		if (!result.success || busy) return;
		const input = result.output;
		if (preview) {
			previewed = true;
			return;
		}
		busy = true;
		failed = false;
		barcodeOwner = null;
		let outcome;
		try {
			outcome = foodId ? await updateFood({ id: foodId, ...input }) : await createFood(input);
		} catch {
			failed = true;
			return;
		} finally {
			busy = false;
		}
		if (!outcome.ok) {
			barcodeOwner = { name: outcome.food.name, barcode: values.barcode };
			return;
		}
		onsaved(outcome.food);
		// Saved: a failed refresh only means the lists catch up on their next load.
		try {
			await invalidateAll();
		} catch {
			// ignored on purpose
		}
	}
</script>

<form class="flex flex-col gap-5" onsubmit={submit} novalidate>
	<div class="flex flex-col gap-3">
		<Input
			label="Name"
			bind:value={values.name}
			autocomplete="off"
			error={shown('name')}
			onblur={blur('name')}
		/>
		<Input
			label="Brand (optional)"
			bind:value={values.brand}
			autocomplete="off"
			error={shown('brand')}
			onblur={blur('brand')}
		/>
	</div>

	<div class="flex flex-col gap-3">
		<SegmentedControl
			label="Nutrition values are per 100"
			options={[
				{ value: 'g', label: 'g' },
				{ value: 'ml', label: 'ml' }
			]}
			bind:value={basis}
			class="w-full"
		/>
		<Input
			label="Calories"
			bind:value={values.kcal}
			inputmode="decimal"
			autocomplete="off"
			suffix="kcal"
			error={shown('kcal')}
			onblur={blur('kcal')}
		/>
		<div class="grid grid-cols-2 gap-3">
			<Input
				label="Protein"
				bind:value={values.protein}
				inputmode="decimal"
				autocomplete="off"
				suffix="g"
				error={shown('protein')}
				onblur={blur('protein')}
			/>
			<Input
				label="Carbs"
				bind:value={values.carbs}
				inputmode="decimal"
				autocomplete="off"
				suffix="g"
				error={shown('carbs')}
				onblur={blur('carbs')}
			/>
			<Input
				label="Fat"
				bind:value={values.fat}
				inputmode="decimal"
				autocomplete="off"
				suffix="g"
				error={shown('fat')}
				onblur={blur('fat')}
			/>
			<Input
				label="Fiber (optional)"
				bind:value={values.fiber}
				inputmode="decimal"
				autocomplete="off"
				suffix="g"
				error={shown('fiber')}
				onblur={blur('fiber')}
			/>
		</div>
	</div>

	<div class="flex flex-col gap-3">
		<Input
			label="Serving size (optional)"
			bind:value={values.servingG}
			inputmode="decimal"
			autocomplete="off"
			suffix="g"
			hint="Lets you log it in servings."
			error={shown('servingG')}
			onblur={blur('servingG')}
		/>
		<Input
			label="Barcode (optional)"
			bind:value={values.barcode}
			inputmode="numeric"
			autocomplete="off"
			error={shown('barcode')}
			onblur={blur('barcode')}
		/>
	</div>

	{#if foodId}
		<p class="text-sm text-text-muted">
			Changes apply to new entries. Days you already logged keep their values.
		</p>
	{/if}

	{#if failed}
		<p role="alert" class="text-sm text-danger">Could not save. Try again.</p>
	{/if}
	{#if previewed}
		<p role="status" class="text-sm text-text-muted">Preview only, nothing was saved.</p>
	{/if}

	<div class="flex gap-2">
		{#if oncancel}
			<Button variant="secondary" onclick={oncancel}>Cancel</Button>
		{/if}
		<Button type="submit" loading={busy}>Save food</Button>
	</div>
</form>
