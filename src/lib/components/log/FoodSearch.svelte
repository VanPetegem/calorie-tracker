<script lang="ts">
	import Globe from '@lucide/svelte/icons/globe';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { Unit } from '#lib/domain/nutrition.ts';
	import type { Food } from '#lib/server/db/schema.ts';
	import type { FoodHit, MappedProduct, RecentFood } from '#lib/server/foods/repo.ts';
	import { Button, Input, ListItem } from '#lib/components/ui/index.ts';
	import { pickOff, searchFoods, searchOff } from '../../../routes/(app)/foods.remote.ts';
	import FoodRow from './FoodRow.svelte';

	/**
	 * The first step of the add sheet: a search field above recents and frequents.
	 *
	 * Typing searches the library (custom, cached OFF, BLV) after 200 ms. Open Food Facts is searched only when the
	 * person presses Enter or taps its row, so typing never spends the OFF quota. A picked OFF product is stored
	 * through `pickOff` first; `onpick` always receives a library food. Below the field, while it is empty, sit the
	 * quick actions: Quick add (kcal without a food), New food and Scan (the barcode scanner).
	 */
	type Props = {
		recents: RecentFood[];
		frequents: RecentFood[];
		/** `last` is the last logged amount, known for recents, frequents and library hits that were logged before. */
		onpick: (food: Food, last?: { amount: number; unit: Unit }) => void;
		onquick: () => void;
		onnew: () => void;
		onscan: () => void;
		/** True while the sheet shows this step: the search field takes focus each time it turns true. */
		active: boolean;
	};

	let { recents, frequents, onpick, onquick, onnew, onscan, active }: Props = $props();

	const DEBOUNCE_MS = 200;
	const uid = $props.id();

	let query = $state('');
	const q = $derived(query.trim());

	type Hits = { query: string; foods: FoodHit[] } | { query: string; failed: true };
	let library = $state.raw<Hits | null>(null);
	let librarySeq = 0;

	// Library search: debounced, and a slow answer to an older query never replaces a newer one.
	$effect(() => {
		const term = q;
		if (term === '') {
			librarySeq++;
			return;
		}
		const timer = setTimeout(async () => {
			const seq = ++librarySeq;
			let result: Hits;
			try {
				result = { query: term, foods: await searchFoods(term) };
			} catch {
				result = { query: term, failed: true };
			}
			if (seq === librarySeq) library = result;
		}, DEBOUNCE_MS);
		return () => clearTimeout(timer);
	});

	// Only an answer to the text now in the field counts; older ones stay on screen while a newer one is on its way.
	const libraryHits = $derived(library && 'foods' in library ? library.foods : []);
	const libraryFailed = $derived(library !== null && 'failed' in library && library.query === q);
	const libraryPending = $derived(library?.query !== q);

	type OffState =
		| { query: string; status: 'loading' }
		| { query: string; status: 'done'; products: MappedProduct[] }
		| { query: string; status: 'unavailable' | 'rate_limited' };
	let off = $state.raw<OffState | null>(null);
	// Only the answer to the text in the field is shown; editing the text hides it.
	const offShown = $derived(off && off.query === q ? off : null);

	async function runOffSearch() {
		const term = q;
		if (term === '' || (off?.query === term && off.status === 'loading')) return;
		off = { query: term, status: 'loading' };
		pickFailed = false;
		let next: OffState;
		try {
			const result = await searchOff(term);
			next = result.ok
				? { query: term, status: 'done', products: result.value }
				: { query: term, status: result.reason };
		} catch {
			next = { query: term, status: 'unavailable' };
		}
		off = next;
	}

	let picking = $state<string | null>(null);
	let pickFailed = $state(false);

	async function pickProduct(product: MappedProduct) {
		if (picking) return;
		picking = product.barcode;
		pickFailed = false;
		try {
			const result = await pickOff(product.barcode);
			if ('unavailable' in result) pickFailed = true;
			else onpick(result);
		} catch {
			pickFailed = true;
		} finally {
			picking = null;
		}
	}

	// Focus the field whenever the step becomes active. The frame lets the dialog finish opening first.
	function focusWhenActive(node: HTMLElement) {
		if (!active) return;
		const frame = requestAnimationFrame(() => node.querySelector('input')?.focus());
		return () => cancelAnimationFrame(frame);
	}
</script>

<div class="flex flex-col gap-5">
	<form
		role="search"
		onsubmit={(event) => {
			event.preventDefault();
			void runOffSearch();
		}}
		{@attach focusWhenActive}
	>
		<Input
			label="Search foods"
			type="search"
			bind:value={query}
			placeholder="Search foods"
			autocomplete="off"
			hint={q === '' ? undefined : 'Press Enter to also search Open Food Facts.'}
		/>
	</form>

	{#if q === ''}
		<!-- Three equal cells, no icons: with them the row is 368 px, wider than the 343 px of a 375 px phone. -->
		<div class="grid grid-cols-3 gap-2">
			<Button variant="secondary" class="w-full" onclick={onquick}>Quick add</Button>
			<Button variant="secondary" class="w-full" onclick={onnew}>New food</Button>
			<Button variant="secondary" class="w-full" onclick={onscan}>Scan</Button>
		</div>
		{#each [{ id: 'recent', title: 'Recent', foods: recents }, { id: 'frequent', title: 'Often logged', foods: frequents }] as group (group.id)}
			{#if group.foods.length > 0}
				<section class="flex flex-col gap-2" aria-labelledby="{uid}-{group.id}">
					<h3 id="{uid}-{group.id}" class="text-sm font-medium text-text-muted">{group.title}</h3>
					<ul
						class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
					>
						{#each group.foods as food (food.id)}
							{@const last = { amount: food.lastAmount, unit: food.lastUnit }}
							<li><FoodRow {food} {last} onselect={() => onpick(food, last)} /></li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
		{#if recents.length === 0 && frequents.length === 0}
			<p class="text-base text-text-muted">
				Search your foods, or Open Food Facts for packaged products.
			</p>
		{/if}
	{:else}
		<section class="flex flex-col gap-2" aria-label="Your foods">
			{#if libraryHits.length > 0}
				<ul
					class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
				>
					{#each libraryHits as food (food.id)}
						{@const last =
							food.lastAmount !== null && food.lastUnit !== null
								? { amount: food.lastAmount, unit: food.lastUnit }
								: undefined}
						<li><FoodRow {food} onselect={() => onpick(food, last)} /></li>
					{/each}
				</ul>
			{:else if libraryFailed}
				<p role="status" class="text-base text-text-muted">
					Your foods could not be searched. Check your connection.
				</p>
			{:else if !libraryPending}
				<p role="status" class="text-base text-text-muted">
					No food in your library matches “{q}”.
				</p>
			{/if}
		</section>

		<section class="flex flex-col gap-2" aria-label="Open Food Facts">
			<ul class="overflow-hidden rounded-lg border border-border bg-surface">
				<li>
					<ListItem
						title="Search Open Food Facts"
						subtitle="“{q}”"
						onclick={() => void runOffSearch()}
					>
						{#snippet leading()}
							{#if offShown?.status === 'loading'}
								<LoaderCircle
									size={20}
									class="animate-spin text-text-muted motion-reduce:animate-none"
									aria-hidden="true"
								/>
							{:else}
								<Globe size={20} class="text-text-muted" aria-hidden="true" />
							{/if}
						{/snippet}
					</ListItem>
				</li>
			</ul>

			{#if offShown?.status === 'unavailable'}
				<p role="status" class="text-base text-text-muted">Product database unreachable</p>
			{:else if offShown?.status === 'rate_limited'}
				<p role="status" class="text-base text-text-muted">
					Too many searches. Try again in a minute.
				</p>
			{:else if offShown?.status === 'done'}
				{#if offShown.products.length === 0}
					<p role="status" class="text-base text-text-muted">No products found.</p>
				{:else}
					<ul
						class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
					>
						{#each offShown.products as product (product.barcode)}
							<li>
								<FoodRow
									food={{
										name: product.name,
										brand: product.brand,
										nutritionBasis: product.nutritionBasis,
										kcal: product.per100.kcal,
										servingG: product.servingG
									}}
									onselect={() => void pickProduct(product)}
								/>
							</li>
						{/each}
					</ul>
				{/if}
				{#if pickFailed}
					<p role="alert" class="text-sm text-danger">Could not load this product</p>
				{/if}
			{/if}
		</section>
	{/if}
</div>
