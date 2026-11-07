<script lang="ts">
	import { untrack } from 'svelte';
	import * as v from 'valibot';
	import { WEIGHT_STEP_KG } from '#lib/domain/constants.ts';
	import { addDays, isAllowedLogDate } from '#lib/domain/dates.ts';
	import type { WeighIn } from '#lib/domain/trend.ts';
	import { WeightInput } from '#lib/schemas/weight.ts';
	import { Button, Input, NumberInput, Sheet } from '#lib/components/ui/index.ts';
	import { formatDay, formatKg } from './chart.ts';
	import { commitFocusedInput, fieldIssue } from './form.ts';

	/**
	 * Edits the weight of a stored weigh-in, or adds one for a day (`point` null). A stored weigh-in keeps its date,
	 * so saving only ever replaces its weight; a new one takes a day up to tomorrow, as the log does, and starts on
	 * yesterday (today has the entry card), with a hint when the chosen day already has a weigh-in. The fields start
	 * from `point` each time the sheet opens. `onsave` does the write (and the toast and refresh); the sheet closes
	 * when it resolves, and when it fails stays open with the values and offers Retry.
	 */
	type Props = {
		open: boolean;
		point: WeighIn | null;
		/** Today in the settings timezone, `YYYY-MM-DD`. */
		today: string;
		/** The weight stored for a date, or null: the add form says when saving would replace it. */
		kgOn: (date: string) => number | null;
		onsave: (input: WeightInput) => Promise<void>;
	};

	let { open = $bindable(false), point, today, kgOn, onsave }: Props = $props();

	// The day of a new weigh-in, yesterday at first; a stored one keeps `point.date`.
	let kg = $state<number | null>(untrack(() => point?.kg ?? null));
	let date = $state(untrack(() => addDays(today, -1)));
	let dateTouched = $state(false);
	let submitted = $state(false);
	let busy = $state(false);
	let failure = $state(false);
	// Bumped after every close: the number field keeps what was typed (an invalid entry stays as text), so the form is
	// mounted anew once the sheet is gone. Not on open: that would destroy the focused element of a sheet that is
	// shown again during its exit, which `Sheet` does not refocus.
	let openings = $state(0);
	let form = $state<HTMLFormElement>();

	// Each opening starts from the point it was opened for.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			kg = point?.kg ?? null;
			date = addDays(today, -1);
			dateTouched = false;
			submitted = false;
			failure = false;
		});
	});

	const day = $derived(point ? point.date : date);
	const result = $derived(v.safeParse(WeightInput, { date: day, kg }));
	const dateError = $derived(
		fieldIssue(result.issues, 'date') ??
			(isAllowedLogDate(day, today) ? undefined : 'Choose a day up to tomorrow')
	);
	const dateShown = $derived(dateTouched || submitted ? dateError : undefined);
	const replaced = $derived(point ? null : kgOn(date));
	const kgError = $derived(kg !== null || submitted ? fieldIssue(result.issues, 'kg') : undefined);

	// A changed weight is a new attempt: the old failure and Retry go.
	function change(next: number | null) {
		kg = next;
		failure = false;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		commitFocusedInput(form);
		submitted = true;
		if (!result.success || dateError) return;
		busy = true;
		failure = false;
		try {
			await onsave(result.output);
			open = false;
		} catch {
			failure = true;
		} finally {
			busy = false;
		}
	}
</script>

<Sheet
	bind:open
	onclose={() => openings++}
	title={point ? 'Edit weigh-in' : 'Add weigh-in'}
	description={point ? formatDay(point.date, { year: true }) : undefined}
>
	{#key openings}
		<form class="flex flex-col gap-4" onsubmit={submit} bind:this={form} novalidate>
			{#if !point}
				<Input
					label="Date"
					type="date"
					bind:value={date}
					onblur={() => (dateTouched = true)}
					error={dateShown}
					hint={replaced === null
						? 'Up to tomorrow.'
						: `This day has ${formatKg(replaced)} kg; saving replaces it`}
				/>
			{/if}
			<NumberInput
				label="Weight"
				unit="kg"
				bind:value={() => kg, change}
				step={WEIGHT_STEP_KG}
				error={kgError}
			/>
			{#if failure}
				<p role="alert" class="text-sm text-danger">Could not save. Try again.</p>
			{/if}
			<div class="flex gap-2">
				<Button variant="secondary" disabled={busy} onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" loading={busy}>{failure ? 'Retry' : 'Save'}</Button>
			</div>
		</form>
	{/key}
</Sheet>
