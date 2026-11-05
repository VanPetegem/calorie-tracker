<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { per100FromSnapshot } from '#lib/domain/nutrition.ts';
	import type { Food, LogEntry } from '#lib/server/db/schema.ts';
	import { Sheet, Skeleton } from '#lib/components/ui/index.ts';
	import { toasts } from '#lib/stores/toasts.svelte.ts';
	import { loadFood } from '../../../routes/(app)/foods.remote.ts';
	import { editAmount } from '../../../routes/(app)/log.remote.ts';
	import AmountStep from './AmountStep.svelte';
	import type { AmountValue } from './amount.ts';
	import FoodForm from './FoodForm.svelte';
	import QuickAddForm from './QuickAddForm.svelte';

	/**
	 * Edits a logged entry. A food entry opens the amount step; its food is loaded when the sheet opens, for its
	 * serving weight and basis and for "Edit food". The server rescales the stored snapshot from the new grams over
	 * the old grams, and the preview does the same: its per 100 values come from the entry, never from the food. The
	 * amount step's "Edit food" changes the food itself, which never touches this or any other logged entry.
	 * A quick entry opens the quick add form instead.
	 */
	type Props = {
		/** A food or quick entry. */
		entry: LogEntry | null;
		open: boolean;
	};

	let { entry, open = $bindable(false) }: Props = $props();

	let food = $state.raw<Food | null>(null);
	let failed = $state(false);
	let editingFood = $state(false);
	// Forms prefill once, so each opening gets a fresh one: another entry, or the same one after Cancel.
	let openings = $state(0);

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

	// The server rescales the stored snapshot, so the preview must start from it too: per 100 from the entry, while
	// the serving weight, basis and the header line come from the food. An entry without grams uses the food's values.
	const entryPer100 = $derived(
		entry && entry.grams !== null && entry.grams > 0
			? per100FromSnapshot(entry, entry.grams)
			: undefined
	);

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

<Sheet
	bind:open
	onclose={() => {
		editingFood = false;
		openings++;
	}}
	title={entry?.kind === 'quick'
		? 'Edit quick add'
		: editingFood
			? 'Edit food'
			: (entry?.label ?? 'Entry')}
	description={entry?.kind === 'quick' || editingFood ? undefined : 'Change the amount'}
>
	{#if entry?.kind === 'quick'}
		{#key `${entry.id}:${openings}`}
			<QuickAddForm {entry} date={entry.date} ondone={() => (open = false)} />
		{/key}
	{:else if entry && food && editingFood}
		<FoodForm
			foodId={food.id}
			initial={food}
			onsaved={(saved) => {
				food = saved;
				editingFood = false;
			}}
			oncancel={() => (editingFood = false)}
		/>
	{:else if entry && food}
		<AmountStep
			{food}
			per100={entryPer100}
			mode="edit"
			initial={entry.amount !== null && entry.unit !== null
				? { amount: entry.amount, unit: entry.unit }
				: null}
			onsubmit={(value) => save(entry, value)}
			onedit={() => (editingFood = true)}
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
