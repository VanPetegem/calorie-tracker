<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { Food, LogEntry } from '#lib/server/db/schema.ts';
	import { Sheet, Skeleton } from '#lib/components/ui/index.ts';
	import { toasts } from '#lib/stores/toasts.svelte.ts';
	import { loadFood } from '../../../routes/(app)/foods.remote.ts';
	import { editAmount } from '../../../routes/(app)/log.remote.ts';
	import AmountStep from './AmountStep.svelte';
	import type { AmountValue } from './amount.ts';

	/**
	 * Edits the amount of a logged food in the amount step. The entry's food is loaded when the sheet opens, because
	 * the preview needs its nutrition per 100. The server rescales the stored snapshot from the new grams over the
	 * old grams; the entry is never re-read from the food.
	 */
	type Props = {
		/** A food entry. Quick entries have their own form (Task 9). */
		entry: LogEntry | null;
		open: boolean;
	};

	let { entry, open = $bindable(false) }: Props = $props();

	let food = $state.raw<Food | null>(null);
	let failed = $state(false);

	$effect(() => {
		const foodId = entry?.foodId;
		if (!open || !foodId) return;
		food = null;
		failed = false;
		let stale = false;
		// Untracked: calling a remote function reads and writes its own reactive state, which would rerun this effect.
		untrack(() => loadFood(foodId)).then(
			(loaded) => {
				if (stale) return;
				if (loaded) food = loaded;
				else failed = true;
			},
			() => {
				if (!stale) failed = true;
			}
		);
		return () => (stale = true);
	});

	async function save(target: LogEntry, { amount, unit }: AmountValue) {
		await editAmount({ id: target.id, amount, unit });
		open = false;
		toasts.show({ message: `Updated ${target.label ?? 'entry'}`, tone: 'success' });
		// Saved: a failed refresh only means the day catches up on its next load.
		try {
			await invalidateAll();
		} catch {
			// ignored on purpose
		}
	}
</script>

<Sheet bind:open title={entry?.label ?? 'Entry'} description="Change the amount">
	{#if entry && food}
		<AmountStep
			{food}
			mode="edit"
			initial={entry.amount !== null && entry.unit !== null
				? { amount: entry.amount, unit: entry.unit }
				: null}
			onsubmit={(value) => save(entry, value)}
		/>
	{:else if failed}
		<p role="alert" class="text-base text-danger">Could not load this food. Close and try again.</p>
	{:else}
		<div class="flex flex-col gap-3" aria-busy="true">
			<span class="sr-only">Loading</span>
			<Skeleton height="2.75rem" />
			<Skeleton height="6rem" />
		</div>
	{/if}
</Sheet>
