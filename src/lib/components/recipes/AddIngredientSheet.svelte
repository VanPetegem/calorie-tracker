<script lang="ts">
	import { untrack } from 'svelte';
	import type { Unit } from '#lib/domain/nutrition.ts';
	import type { FoodInput } from '#lib/schemas/food.ts';
	import type { Food } from '#lib/server/db/schema.ts';
	import type { RecentFood } from '#lib/server/foods/repo.ts';
	import { Sheet } from '#lib/components/ui/index.ts';
	import { loadSuggestions } from '../../../routes/(app)/foods.remote.ts';
	import AmountStep from '../log/AmountStep.svelte';
	import type { AmountValue } from '../log/amount.ts';
	import FoodForm from '../log/FoodForm.svelte';
	import FoodSearch from '../log/FoodSearch.svelte';
	import ScannerView from '../log/ScannerView.svelte';

	/**
	 * Picks a food and an amount for a recipe or batch. The same steps as the add sheet without Quick add: search
	 * (library, Open Food Facts), Scan and New food, then the amount step with an "Add" button. `onadd` receives the
	 * food and the amount; the sheet closes itself afterwards.
	 *
	 * Recents and frequents are fetched each time the sheet opens (the latest request wins), because the pages that
	 * host it do not load them.
	 */
	type Props = {
		open: boolean;
		onadd: (food: Food, value: AmountValue) => void;
	};

	let { open = $bindable(false), onadd }: Props = $props();

	type Last = { amount: number; unit: Unit };
	type Step =
		| { kind: 'search' }
		| { kind: 'amount'; food: Food; last?: Last }
		| { kind: 'new'; initial?: Partial<FoodInput> }
		| { kind: 'scan' };
	let step = $state.raw<Step>({ kind: 'search' });
	// Bumping it mounts a fresh search (empty field) the next time the sheet opens.
	let searchKey = $state(0);

	let recents = $state.raw<RecentFood[]>([]);
	let frequents = $state.raw<RecentFood[]>([]);
	let latestRequest = 0;

	$effect(() => {
		if (!open) return;
		const request = ++latestRequest;
		// Untracked: calling a remote function reads and writes its own reactive state, which would rerun this effect.
		void untrack(loadSuggestions).then(
			(result) => {
				if (request !== latestRequest) return;
				recents = result.recents;
				frequents = result.frequents;
			},
			() => {
				// Suggestions are a convenience: without them the search still works.
			}
		);
	});

	function title(current: Step): string {
		switch (current.kind) {
			case 'amount':
				return current.food.name;
			case 'new':
				return 'New food';
			case 'scan':
				return 'Scan barcode';
			default:
				return 'Add ingredient';
		}
	}

	const toSearch = () => (step = { kind: 'search' });

	function reset() {
		step = { kind: 'search' };
		searchKey++;
	}

	function add(food: Food, value: AmountValue) {
		onadd(food, value);
		open = false;
	}
</script>

<Sheet
	bind:open
	title={title(step)}
	description={step.kind === 'amount' ? (step.food.brand ?? undefined) : undefined}
	onclose={reset}
>
	<div hidden={step.kind !== 'search'}>
		{#key searchKey}
			<FoodSearch
				{recents}
				{frequents}
				active={open && step.kind === 'search'}
				onpick={(food, last) => (step = { kind: 'amount', food, last })}
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
			submitLabel="Add"
			initial={last}
			onback={toSearch}
			onsubmit={(value) => add(food, value)}
		/>
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
	{/if}
</Sheet>
