<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { Unit } from '#lib/domain/nutrition.ts';
	import type { FoodInput } from '#lib/schemas/food.ts';
	import type { BatchSummary } from '#lib/server/batches/repo.ts';
	import type { Food } from '#lib/server/db/schema.ts';
	import type { RecentFood } from '#lib/server/foods/repo.ts';
	import { Button, Sheet, Skeleton } from '#lib/components/ui/index.ts';
	import { addSheet } from '#lib/stores/add-sheet.svelte.ts';
	import { toasts } from '#lib/stores/toasts.svelte.ts';
	import { loadSuggestions } from '../../../routes/(app)/foods.remote.ts';
	import { logBatch, logFood } from '../../../routes/(app)/log.remote.ts';
	import AmountStep from './AmountStep.svelte';
	import { batchSource, type AmountValue, type BatchAmountValue } from './amount.ts';
	import FoodForm from './FoodForm.svelte';
	import FoodSearch from './FoodSearch.svelte';
	import QuickAddForm from './QuickAddForm.svelte';
	import ScannerView from './ScannerView.svelte';

	/**
	 * The add sheet: search and recents first, then the amount step for the chosen food.
	 *
	 * Mounted once in the app layout. Whether it is open lives in the `addSheet` store, which the tab bar, the
	 * sidebar and the ⌘K shortcut set. Quick add, New food and Scan are steps of their own; a new food continues to
	 * its amount step so it can be logged at once, and the amount step's "Edit food" opens the food form for that food.
	 * A scanned code goes straight to the amount step when the food is known, else to the new food form with the
	 * barcode (and what Open Food Facts knew) filled in. Active batches sit above the recents; picking one opens its
	 * amount step (portions, or grams for a weighed batch), and `addSheet.openBatch` opens the sheet at that step.
	 * The sheet logs on `day.date` (the day being viewed). Pages that do not load a day (Weight, Settings) pass
	 * `day: null`, and the sheet fetches today and the suggestions itself when it opens.
	 */
	type Props = {
		day: {
			date: string;
			recents: RecentFood[];
			frequents: RecentFood[];
			batches: BatchSummary[];
		} | null;
	};

	let { day }: Props = $props();

	type Last = { amount: number; unit: Unit };
	type Step =
		| { kind: 'search' }
		| { kind: 'amount'; food: Food; last?: Last }
		| { kind: 'batch'; batch: BatchSummary }
		| { kind: 'quick' }
		| { kind: 'new'; initial?: Partial<FoodInput> }
		| { kind: 'scan' }
		| { kind: 'edit'; food: Food; last?: Last };
	// A writable derived: `addSheet.openBatch` sets `addSheet.batch`, which starts the step at that batch; moving on
	// assigns the step as usual, and closing clears the request again (see `reset`).
	let step = $derived.by<Step>(() =>
		addSheet.batch ? { kind: 'batch', batch: addSheet.batch } : { kind: 'search' }
	);
	// Bumping it mounts a fresh search (empty field) the next time the sheet opens.
	let searchKey = $state(0);

	type Fetched = {
		today: string;
		recents: RecentFood[];
		frequents: RecentFood[];
		batches: BatchSummary[];
	};
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
	const batches = $derived(day?.batches ?? fetched?.batches ?? []);

	function title(current: Step): string {
		switch (current.kind) {
			case 'amount':
				return current.food.name;
			case 'batch':
				return current.batch.name;
			case 'quick':
				return 'Quick add';
			case 'new':
				return 'New food';
			case 'scan':
				return 'Scan barcode';
			case 'edit':
				return 'Edit food';
			default:
				return 'Add food';
		}
	}

	const toSearch = () => (step = { kind: 'search' });

	function reset() {
		addSheet.batch = null;
		step = { kind: 'search' };
		searchKey++;
	}

	/** The entry is saved: close, say so, and refresh. A failed refresh only means the page catches up on its next load. */
	async function done(name: string) {
		addSheet.open = false;
		toasts.show({ message: `Logged ${name}`, tone: 'success' });
		try {
			await invalidateAll();
		} catch {
			// ignored on purpose
		}
	}

	async function log(food: Food, { amount, unit }: AmountValue) {
		if (date === null) throw new Error('No date to log on');
		await logFood({ date, foodId: food.id, amount, unit });
		await done(food.name);
	}

	async function logBatchAmount(batch: BatchSummary, { amount, unit }: BatchAmountValue) {
		if (date === null) throw new Error('No date to log on');
		await logBatch({ date, batchId: batch.id, amount, unit });
		await done(batch.name);
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
				{batches}
				active={addSheet.open && step.kind === 'search'}
				onpick={(food, last) => (step = { kind: 'amount', food, last })}
				onquick={() => (step = { kind: 'quick' })}
				onbatch={(batch) => (step = { kind: 'batch', batch })}
				onnew={() => (step = { kind: 'new' })}
				onscan={() => (step = { kind: 'scan' })}
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
			{@render awaitingDate()}
		{/if}
	{:else if step.kind === 'batch'}
		{@const { batch } = step}
		{#if date !== null}
			{#key batch.id}
				<AmountStep
					batch={batchSource(batch)}
					mode="add"
					onback={toSearch}
					onsubmit={(value: BatchAmountValue) => logBatchAmount(batch, value)}
				/>
			{/key}
		{:else}
			{@render awaitingDate()}
		{/if}
	{:else if step.kind === 'new'}
		<FoodForm
			initial={step.initial}
			onsaved={(food) => (step = { kind: 'amount', food })}
			oncancel={toSearch}
		/>
	{:else if step.kind === 'scan'}
		<ScannerView
			onhit={(food, last) => (step = { kind: 'amount', food, last: last ?? undefined })}
			onmiss={(barcode, prefill) => (step = { kind: 'new', initial: { ...prefill, barcode } })}
			onmanual={(barcode) => (step = { kind: 'new', initial: { barcode } })}
			onback={toSearch}
		/>
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

{#snippet awaitingDate()}
	<!-- Pages without a day (Weight, Settings, a batch page) fetch today when the sheet opens; the step needs it. -->
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
{/snippet}
