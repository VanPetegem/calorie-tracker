<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { Unit } from '#lib/domain/nutrition.ts';
	import type { Food } from '#lib/server/db/schema.ts';
	import type { RecentFood } from '#lib/server/foods/repo.ts';
	import { Sheet } from '#lib/components/ui/index.ts';
	import { addSheet } from '#lib/stores/add-sheet.svelte.ts';
	import { toasts } from '#lib/stores/toasts.svelte.ts';
	import { loadSuggestions } from '../../../routes/(app)/foods.remote.ts';
	import { logFood } from '../../../routes/(app)/log.remote.ts';
	import AmountStep from './AmountStep.svelte';
	import type { AmountValue } from './amount.ts';
	import FoodSearch from './FoodSearch.svelte';

	/**
	 * The add sheet: search and recents first, then the amount step for the chosen food.
	 *
	 * Mounted once in the app layout. Whether it is open lives in the `addSheet` store, which the tab bar, the
	 * sidebar and the ⌘K shortcut set. Later modes (quick add, new food, scan) become more steps here, opened the
	 * same way. The sheet logs on `day.date` (the day being viewed). Pages that do not load a day (Weight,
	 * Settings) pass `day: null`, and the sheet fetches today and the suggestions itself when it opens.
	 */
	type Props = {
		day: { date: string; recents: RecentFood[]; frequents: RecentFood[] } | null;
	};

	let { day }: Props = $props();

	type Step =
		{ kind: 'search' } | { kind: 'amount'; food: Food; last?: { amount: number; unit: Unit } };
	let step = $state.raw<Step>({ kind: 'search' });
	// Bumping it mounts a fresh search (empty field) the next time the sheet opens.
	let searchKey = $state(0);

	type Fetched = { today: string; recents: RecentFood[]; frequents: RecentFood[] };
	let fetched = $state.raw<Fetched | null>(null);

	$effect(() => {
		if (!addSheet.open || day) return;
		// Untracked: calling a remote function reads and writes its own reactive state, which would rerun this effect.
		void untrack(loadSuggestions).then(
			(result) => (fetched = result),
			() => (fetched = null)
		);
	});

	const date = $derived(day ? day.date : (fetched?.today ?? null));
	const recents = $derived(day?.recents ?? fetched?.recents ?? []);
	const frequents = $derived(day?.frequents ?? fetched?.frequents ?? []);

	function reset() {
		step = { kind: 'search' };
		searchKey++;
	}

	async function log(food: Food, { amount, unit }: AmountValue) {
		if (date === null) throw new Error('No date to log on');
		await logFood({ date, foodId: food.id, amount, unit });
		addSheet.open = false;
		toasts.show({
			message: `Logged ${food.name}`,
			tone: 'success'
		});
		// The entry is saved: a failed refresh only means the page catches up on its next load.
		try {
			await invalidateAll();
		} catch {
			// ignored on purpose
		}
	}
</script>

<Sheet
	bind:open={addSheet.open}
	title={step.kind === 'amount' ? step.food.name : 'Add food'}
	description={step.kind === 'amount' ? (step.food.brand ?? undefined) : undefined}
	onclose={reset}
>
	<div hidden={step.kind !== 'search'}>
		{#key searchKey}
			<FoodSearch
				{recents}
				{frequents}
				active={addSheet.open && step.kind === 'search'}
				onpick={(food, last) => (step = { kind: 'amount', food, last })}
			/>
		{/key}
	</div>
	{#if step.kind === 'amount'}
		{@const food = step.food}
		<AmountStep
			{food}
			mode="add"
			initial={step.last}
			onback={() => (step = { kind: 'search' })}
			onsubmit={(value) => log(food, value)}
		/>
	{/if}
</Sheet>
