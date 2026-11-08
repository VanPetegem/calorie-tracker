<script lang="ts">
	import { isHttpError } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import * as v from 'valibot';
	import { MAX_FAT_PCT, MIN_FAT_PCT } from '#lib/domain/constants.ts';
	import { MacroRulesInput } from '#lib/schemas/settings.ts';
	import { Button, Input } from '#lib/components/ui/index.ts';
	import { fieldIssue } from '#lib/components/weight/form.ts';
	import { parseDecimal } from '#lib/utils/decimal.ts';

	/**
	 * Protein per kg of trend weight, fat as a percent of kcal, and under Advanced the energy density of gained weight.
	 * The fields are checked against `MacroRulesInput`, the schema the server uses, when they lose focus and on submit.
	 * Fat is typed as a percent and stored as a share, so its range message is in percent. `onsave` does the write; a
	 * failure keeps the values and offers Retry.
	 */
	type Props = {
		value: MacroRulesInput;
		onsave: (input: MacroRulesInput) => Promise<void>;
	};

	let { value, onsave }: Props = $props();

	// Prefilled once from the saved rules, as the other forms do.
	const start = untrack(() => value);
	let protein = $state(String(start.proteinGPerKg));
	let fat = $state(String(Math.round(start.fatPct * 1000) / 10));
	let energy = $state(String(start.energyDensity));
	let touched = $state({ proteinGPerKg: false, fatPct: false, energyDensity: false });
	let submitted = $state(false);
	let busy = $state(false);
	// The message of the failed save: the server's reason for a 400 or a 409 conflict, else a generic one.
	let failure = $state<string | null>(null);
	// Advanced opens when its field has an error, so a failed save is never hidden inside it.
	let advanced = $state(false);

	// A typed percent becomes the share the schema checks; text that is not a number passes through to fail there.
	const fatShare = $derived.by(() => {
		const percent = parseDecimal(fat);
		return percent === null ? fat : percent / 100;
	});
	const result = $derived(
		v.safeParse(MacroRulesInput, {
			proteinGPerKg: protein,
			fatPct: fatShare,
			energyDensity: energy
		})
	);

	const percentRange = `Enter a percent from ${Math.round(MIN_FAT_PCT * 100)} to ${Math.round(MAX_FAT_PCT * 100)}`;
	const errors = $derived({
		proteinGPerKg: fieldIssue(result.issues, 'proteinGPerKg'),
		fatPct: fieldIssue(result.issues, 'fatPct') ? percentRange : undefined,
		energyDensity: fieldIssue(result.issues, 'energyDensity')
	});
	const shown = (field: keyof typeof errors) =>
		touched[field] || submitted ? errors[field] : undefined;

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		submitted = true;
		if (errors.energyDensity) advanced = true;
		if (!result.success || busy) return;
		busy = true;
		failure = null;
		try {
			await onsave(result.output);
		} catch (cause) {
			failure =
				isHttpError(cause, 400) || isHttpError(cause, 409)
					? cause.body.message
					: 'Could not save. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<form class="flex flex-col gap-4" onsubmit={submit} novalidate>
	<Input
		label="Protein per kg"
		bind:value={protein}
		inputmode="decimal"
		autocomplete="off"
		suffix="g"
		error={shown('proteinGPerKg')}
		onblur={() => (touched.proteinGPerKg = true)}
	/>
	<Input
		label="Fat share of kcal"
		bind:value={fat}
		inputmode="decimal"
		autocomplete="off"
		suffix="%"
		error={shown('fatPct')}
		onblur={() => (touched.fatPct = true)}
	/>
	<details
		class="rounded-md border border-border px-4 py-3"
		open={advanced}
		ontoggle={(event) => (advanced = event.currentTarget.open)}
	>
		<summary class="flex min-h-11 cursor-pointer items-center text-base font-medium text-text">
			Advanced
		</summary>
		<div class="pt-3">
			<Input
				label="Energy density"
				bind:value={energy}
				inputmode="decimal"
				autocomplete="off"
				suffix="kcal/kg"
				error={shown('energyDensity')}
				onblur={() => (touched.energyDensity = true)}
			/>
		</div>
	</details>
	{#if failure !== null}
		<p role="alert" class="text-sm text-danger">{failure}</p>
	{/if}
	<div>
		<Button type="submit" loading={busy}>{failure !== null ? 'Retry' : 'Save rules'}</Button>
	</div>
</form>
