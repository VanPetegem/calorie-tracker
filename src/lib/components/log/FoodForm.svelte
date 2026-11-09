<script lang="ts">
	import { untrack } from 'svelte';
	import { online } from 'svelte/reactivity/window';
	import * as v from 'valibot';
	import Camera from '@lucide/svelte/icons/camera';
	import { invalidateAll } from '$app/navigation';
	import { resizeToJpegDataUri } from '#lib/client/resize-image.ts';
	import { FoodInput } from '#lib/schemas/food.ts';
	import type { LabelValues } from '#lib/schemas/label.ts';
	import type { Food } from '#lib/server/db/schema.ts';
	import { Button, Input, SegmentedControl } from '#lib/components/ui/index.ts';
	import { createFood, readLabel, updateFood } from '../../../routes/(app)/foods.remote.ts';

	/**
	 * Creates or edits a food: name, nutrition per 100 g (or ml) and an optional serving weight and barcode.
	 *
	 * Each field is checked against `FoodInput` (the schema the server uses) when it loses focus, and all of them
	 * when saving. Without `foodId` it creates a custom food; with it, it edits that food (an OFF or BLV food keeps
	 * the fix through refreshes). `initial` prefills, e.g. the barcode of an unknown product from the scanner's
	 * miss flow. `onsaved` receives the saved food. With `preview` (the /design route) nothing is sent.
	 *
	 * A new food (no `foodId`) can be filled from a photo of the nutrition label: the values read are written into the
	 * form, each changed field says "From photo" until it is edited, and nothing is saved until the user taps Save.
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

	// Values the label photo wrote, with what the field held before ('' when empty). A marker shows while the field
	// still holds the value the photo wrote, so editing the field removes it.
	let fromPhoto = $state<Partial<Record<Field, { value: string; was: string }>>>({});
	let reading = $state(false);
	let fileInput = $state<HTMLInputElement>();
	let labelMessage = $state('');

	const LABEL_FIELDS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'servingG'] as const;
	const LABEL_ERRORS = {
		unreadable: "Couldn't read the label. It needs a per 100 g column.",
		rate_limited: 'Too many photos, try again in a minute.',
		unavailable: "Couldn't reach the label reader. Try again."
	} as const;

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

	function photoHint(field: Field): string | undefined {
		const marker = fromPhoto[field];
		if (!marker || marker.value !== values[field]) return undefined;
		return marker.was ? `From photo, was ${marker.was}` : 'From photo';
	}

	const sameNumber = (a: string, b: string) =>
		Number(a.trim().replace(',', '.')) === Number(b.trim().replace(',', '.'));

	function applyLabel(label: LabelValues) {
		basis = label.nutritionBasis;
		for (const field of LABEL_FIELDS) {
			const read = label[field];
			if (read === null) continue;
			const was = values[field];
			const value = String(read);
			if (was.trim() !== '' && sameNumber(was, value)) continue;
			values[field] = value;
			fromPhoto[field] = { value, was: was.trim() };
		}
	}

	async function pickLabel(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		// Reset so the same photo can be picked again.
		input.value = '';
		if (!file || reading) return;
		if (preview) {
			labelMessage = 'Preview only, no photo was sent.';
			return;
		}
		reading = true;
		labelMessage = '';
		try {
			let photo: string;
			try {
				photo = await resizeToJpegDataUri(file);
			} catch {
				labelMessage = "Couldn't open that photo.";
				return;
			}
			try {
				const outcome = await readLabel(photo);
				if (outcome.ok) applyLabel(outcome.values);
				else labelMessage = LABEL_ERRORS[outcome.reason];
			} catch {
				labelMessage = LABEL_ERRORS.unavailable;
			}
		} finally {
			reading = false;
		}
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
	{#if !foodId}
		<div class="flex flex-col gap-1.5">
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				capture="environment"
				class="hidden"
				tabindex="-1"
				aria-hidden="true"
				onchange={pickLabel}
			/>
			<Button
				variant="secondary"
				icon={Camera}
				loading={reading}
				disabled={online.current === false}
				onclick={() => fileInput?.click()}
			>
				{reading ? 'Reading label…' : 'Photograph label'}
			</Button>
			{#if online.current === false}
				<p class="text-sm text-text-muted">Needs a connection</p>
			{/if}
			<p
				aria-live="polite"
				class={labelMessage ? ['text-sm', preview ? 'text-text-muted' : 'text-danger'] : 'sr-only'}
			>
				{labelMessage}
			</p>
		</div>
	{/if}

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
			hint={photoHint('kcal')}
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
				hint={photoHint('protein')}
				error={shown('protein')}
				onblur={blur('protein')}
			/>
			<Input
				label="Carbs"
				bind:value={values.carbs}
				inputmode="decimal"
				autocomplete="off"
				suffix="g"
				hint={photoHint('carbs')}
				error={shown('carbs')}
				onblur={blur('carbs')}
			/>
			<Input
				label="Fat"
				bind:value={values.fat}
				inputmode="decimal"
				autocomplete="off"
				suffix="g"
				hint={photoHint('fat')}
				error={shown('fat')}
				onblur={blur('fat')}
			/>
			<Input
				label="Fiber (optional)"
				bind:value={values.fiber}
				inputmode="decimal"
				autocomplete="off"
				suffix="g"
				hint={photoHint('fiber')}
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
			hint={photoHint('servingG') ?? 'Lets you log it in servings.'}
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
