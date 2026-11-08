<script lang="ts">
	import { untrack } from 'svelte';
	import { GOAL_RATES } from '#lib/domain/constants.ts';
	import { goalKgPerWeek } from '#lib/domain/targets.ts';
	import { Button } from '#lib/components/ui/index.ts';
	import { formatSigned } from '#lib/components/weight/chart.ts';

	/**
	 * The goal rate: one of the presets, each with the kg per week it means at the trend. Saving is explicit, so a
	 * failed save keeps the choice and offers Retry. `onsave` does the write and the refresh; it throws when the write
	 * fails. Without a trend the presets show their percent only.
	 */
	type Props = {
		/** The saved goal rate, in percent of trend weight per week. */
		value: number;
		trendKg: number | null;
		onsave: (goalRatePct: number) => Promise<void>;
	};

	let { value, trendKg, onsave }: Props = $props();

	// Starts from the saved rate; a choice stays until it is saved or another one is picked.
	let chosen = $state(untrack(() => value));
	let busy = $state(false);
	let failure = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		failure = false;
		try {
			await onsave(chosen);
		} catch {
			failure = true;
		} finally {
			busy = false;
		}
	}
</script>

<form class="flex flex-col gap-4" onsubmit={submit}>
	<fieldset class="flex flex-col gap-2">
		<legend class="mb-2 text-base font-medium text-text">Rate per week</legend>
		{#each GOAL_RATES as rate (rate)}
			<label
				class={[
					'flex min-h-14 cursor-pointer items-center gap-3 rounded-md border bg-surface px-4 py-3',
					rate === chosen ? 'border-brand-solid' : 'border-border'
				]}
			>
				<input
					type="radio"
					name="goal-rate"
					class="size-5 accent-brand-solid"
					value={rate}
					checked={chosen === rate}
					disabled={busy}
					onchange={() => (chosen = rate)}
				/>
				<span class="flex min-w-0 flex-1 flex-col">
					<span class="text-base font-medium text-text">{rate} % a week</span>
					{#if trendKg !== null}
						<span class="text-sm text-text-muted tabular-nums">
							{formatSigned(goalKgPerWeek(trendKg, rate), 2)} kg/week
						</span>
					{/if}
				</span>
			</label>
		{/each}
	</fieldset>
	{#if failure}
		<p role="alert" class="text-sm text-danger">Could not save. Try again.</p>
	{/if}
	<div>
		<Button type="submit" loading={busy} disabled={chosen === value}>
			{failure ? 'Retry' : 'Save goal'}
		</Button>
	</div>
</form>
