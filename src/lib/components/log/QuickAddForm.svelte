<script lang="ts">
	import { untrack } from 'svelte';
	import * as v from 'valibot';
	import { invalidateAll } from '$app/navigation';
	import { QuickInput } from '#lib/schemas/log.ts';
	import type { LogEntry } from '#lib/server/db/schema.ts';
	import { Button, Input } from '#lib/components/ui/index.ts';
	import { toasts } from '#lib/stores/toasts.svelte.ts';
	import { editQuick, logQuick } from '../../../routes/(app)/log.remote.ts';

	/**
	 * Quick add: a label (optional) and kcal (required) with optional protein, carbs and fat, logged without a food.
	 *
	 * Without `entry` it logs a new quick entry on `date`; with one it edits that entry (`editQuick`), which keeps
	 * its day and time. Each field is checked against `QuickInput` when it loses focus, and all of them when saving.
	 * `ondone` runs after the entry is saved. With `preview` (the /design route) nothing is sent.
	 */
	type Props = {
		entry?: LogEntry;
		date: string;
		ondone: () => void;
		oncancel?: () => void;
		preview?: boolean;
	};

	let { entry, date, ondone, oncancel, preview = false }: Props = $props();

	const FIELDS = ['label', 'kcal', 'protein', 'carbs', 'fat'] as const;
	type Field = (typeof FIELDS)[number];

	// Macros of a quick entry are stored as 0 when left empty, so 0 shows as an empty field again.
	const number = (value: number) => (value === 0 ? '' : String(Math.round(value * 10) / 10));

	// The form is prefilled once: a new form is mounted for another entry.
	const start = untrack(() => entry);
	let values = $state<Record<Field, string>>({
		label: start?.label ?? '',
		kcal: start ? String(Math.round(start.kcal * 10) / 10) : '',
		protein: start ? number(start.protein) : '',
		carbs: start ? number(start.carbs) : '',
		fat: start ? number(start.fat) : ''
	});
	let touched = $state<Partial<Record<Field, boolean>>>({});
	let submitted = $state(false);
	let busy = $state(false);
	let failed = $state(false);
	let previewed = $state(false);

	// The day is not a field of the form, so it is checked with the rest only to reuse the schema.
	const result = $derived(v.safeParse(QuickInput, { ...values, date }));
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

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		submitted = true;
		if (!result.success || busy) return;
		const { date: day, ...input } = result.output;
		if (preview) {
			previewed = true;
			return;
		}
		busy = true;
		failed = false;
		try {
			if (entry) await editQuick({ id: entry.id, ...input });
			else await logQuick({ date: day, ...input });
		} catch {
			failed = true;
			return;
		} finally {
			busy = false;
		}
		toasts.show({
			message: `${entry ? 'Updated' : 'Logged'} ${input.label ?? 'quick add'}`,
			tone: 'success'
		});
		ondone();
		// Saved: a failed refresh only means the day catches up on its next load.
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
			label="Label (optional)"
			bind:value={values.label}
			autocomplete="off"
			placeholder="Restaurant"
			error={shown('label')}
			onblur={blur('label')}
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
		<div class="grid grid-cols-3 gap-3">
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
		</div>
	</div>

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
		<Button type="submit" loading={busy}>{entry ? 'Save' : 'Log'}</Button>
	</div>
</form>
