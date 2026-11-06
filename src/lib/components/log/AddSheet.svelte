<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { Unit } from '#lib/domain/nutrition.ts';
	import type { Food } from '#lib/server/db/schema.ts';
	import type { RecentFood } from '#lib/server/foods/repo.ts';
	import { Button, Sheet, Skeleton } from '#lib/components/ui/index.ts';
	import { addSheet } from '#lib/stores/add-sheet.svelte.ts';
	import { toasts } from '#lib/stores/toasts.svelte.ts';
	import { loadSuggestions } from '../../../routes/(app)/foods.remote.ts';
	import { logFood } from '../../../routes/(app)/log.remote.ts';
	import AmountStep from './AmountStep.svelte';
	import type { AmountValue } from './amount.ts';
	import FoodForm from './FoodForm.svelte';
	import FoodSearch from './FoodSearch.svelte';
	import QuickAddForm from './QuickAddForm.svelte';

	/**
	 * The add sheet: search and recents first, then the amount step for the chosen food.
	 *
	 * Mounted once in the app layout. Whether it is open lives in the `addSheet` store, which the tab bar, the
	 * sidebar and the ⌘K shortcut set. Quick add and New food are steps of their own; a new food continues to its
	 * amount step so it can be logged at once, and the amount step's "Edit food" opens the food form for that food.
	 * Scan (phase 2b) becomes one more step. The sheet logs on `day.date` (the day being viewed). Pages that do not load a day (Weight,
	 * Settings) pass `day: null`, and the sheet fetches today and the suggestions itself when it opens.
	 */
	type Props = {
		day: { date: string; recents: RecentFood[]; frequents: RecentFood[] } | null;
	};

	let { day }: Props = $props();

	type Last = { amount: number; unit: Unit };
	type Step =
		| { kind: 'search' }
		| { kind: 'amount'; food: Food; last?: Last }
		| { kind: 'quick' }
		| { kind: 'new' }
		| { kind: 'edit'; food: Food; last?: Last };
	let step = $state.raw<Step>({ kind: 'search' });
	// Bumping it mounts a fresh search (empty field) the next time the sheet opens.
	let searchKey = $state(0);

	type Fetched = { today: string; recents: RecentFood[]; frequents: RecentFood[] };
	let fetched = $state.raw<Fetched | null>(null);
	let fetchFailed = $state(false);
	let latestRequest = 0;

	$effect(() => {
		if (!addSheet.open || day) return;
		fetchFailed = false;
		// A date fetched earlier may be yesterday by now: log nothing until this request answers.
		fetched = null;
		const request = ++latestRequest;
		// Untracked: calling a remote function reads and writes its own reactive state, which would rerun this effect.
		void untrack(loadSuggestions).then(
			(result) => {
				if (request === latestRequest) fetched = result;
			},
			() => {
				if (request !== latestRequest) return;
				fetched = null;
				fetchFailed = true;
			}
		);
	});

	const date = $derived(day ? day.date : (fetched?.today ?? null));
	const recents = $derived(day?.recents ?? fetched?.recents ?? []);
	const frequents = $derived(day?.frequents ?? fetched?.frequents ?? []);

	function title(current: Step): string {
		switch (current.kind) {
			case 'amount':
				return current.food.name;
			case 'quick':
				return 'Quick add';
			case 'new':
				return 'New food';
			case 'edit':
				return 'Edit food';
			default:
				return 'Add food';
		}
	}

	const toSearch = () => (step = { kind: 'search' });

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
	title={title(step)}
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
				onquick={() => (step = { kind: 'quick' })}
				onnew={() => (step = { kind: 'new' })}
			/>
		{/key}
	</div>
	{#if step.kind === 'amount'}
		{@const { food, last } = step}
		<AmountStep
			{food}
			mode="add"
			initial={last}
			onback={toSearch}
			onedit={() => (step = { kind: 'edit', food, last })}
			onsubmit={(value) => log(food, value)}
		/>
	{:else if step.kind === 'quick'}
		{#if date !== null}
			<QuickAddForm {date} ondone={() => (addSheet.open = false)} oncancel={toSearch} />
		{:else}
			<!-- Pages without a day (Weight, Settings) fetch today when the sheet opens; the form needs it. -->
			<div class="flex flex-col gap-4">
				{#if fetchFailed}
					<p role="alert" class="text-base text-danger">
						Could not load today's date. Go back and try again.
					</p>
				{:else}
					<div class="flex flex-col gap-3" aria-busy="true">
						<span class="sr-only">Loading</span>
						<Skeleton height="2.75rem" />
						<Skeleton height="2.75rem" />
					</div>
				{/if}
				<Button variant="secondary" onclick={toSearch}>Back</Button>
			</div>
		{/if}
	{:else if step.kind === 'new'}
		<FoodForm onsaved={(food) => (step = { kind: 'amount', food })} oncancel={toSearch} />
	{:else if step.kind === 'edit'}
		{@const { food, last } = step}
		<FoodForm
			foodId={food.id}
			initial={food}
			onsaved={(saved) => (step = { kind: 'amount', food: saved, last })}
			oncancel={() => (step = { kind: 'amount', food, last })}
		/>
	{/if}
</Sheet>
