<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import CookingPot from '@lucide/svelte/icons/cooking-pot';
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Card, EmptyState } from '#lib/components/ui/index.ts';
	import BatchRow from '#lib/components/recipes/BatchRow.svelte';
	import RecipeRow from '#lib/components/recipes/RecipeRow.svelte';
	import { toasts } from '#lib/stores/toasts.svelte.ts';
	import { reopenBatch } from './batches.remote.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let reopening = $state<string | null>(null);

	async function reopen(id: string, name: string) {
		if (reopening) return;
		reopening = id;
		try {
			await reopenBatch({ id });
		} catch {
			toasts.show({ message: 'Could not reopen. Try again.', tone: 'danger' });
			reopening = null;
			return;
		}
		toasts.show({ message: `Reopened ${name}`, tone: 'success' });
		// Reopened: a failed refresh only means the lists catch up on their next load.
		try {
			await invalidateAll();
		} catch {
			// ignored on purpose
		}
		reopening = null;
	}
</script>

<svelte:head>
	<title>Recipes · kcal</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex items-center justify-between gap-3">
		<h1 class="text-3xl font-semibold tracking-tight text-text">Recipes</h1>
		<Button href={resolve('/(app)/recipes/new')} icon={Plus} class="shrink-0">New recipe</Button>
	</div>

	<section class="flex flex-col gap-3" aria-labelledby="active-heading">
		<div class="flex items-center justify-between gap-3">
			<h2 id="active-heading" class="text-lg font-semibold text-text">Active batches</h2>
			<Button
				href={resolve('/(app)/recipes/batches/new')}
				variant="secondary"
				icon={Plus}
				class="shrink-0"
			>
				New batch
			</Button>
		</div>
		{#if data.batches.length === 0}
			<p class="text-base text-text-muted">
				No active batches. Cook one from a recipe, or start a one off with New batch.
			</p>
		{:else}
			<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
				{#each data.batches as batch (batch.id)}
					<li>
						<BatchRow {batch} href={resolve('/(app)/recipes/batches/[id]', { id: batch.id })} />
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="flex flex-col gap-3" aria-labelledby="recipes-heading">
		<h2 id="recipes-heading" class="text-lg font-semibold text-text">Recipes</h2>
		{#if data.recipes.length === 0}
			<Card>
				<EmptyState
					icon={CookingPot}
					title="No recipes yet"
					body="Add a recipe from raw ingredients, then cook batches and log portions."
				/>
			</Card>
		{:else}
			<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
				{#each data.recipes as recipe (recipe.id)}
					<li>
						<RecipeRow {recipe} href={resolve('/(app)/recipes/[id]', { id: recipe.id })} />
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if data.finished.length > 0}
		<!-- Collapsed: finished batches are history, one tap away. -->
		<details class="group flex flex-col gap-3" aria-label="Finished batches">
			<summary
				class="details-marker-none flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md text-lg font-semibold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
			>
				Finished
				<ChevronDown
					size={20}
					class="text-text-muted transition-transform duration-100 ease-out group-open:rotate-180 motion-reduce:transition-none"
					aria-hidden="true"
				/>
			</summary>
			<ul
				class="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
			>
				{#each data.finished as batch (batch.id)}
					<li class="flex items-center gap-1 pr-2">
						<div class="min-w-0 flex-1">
							<BatchRow {batch} href={resolve('/(app)/recipes/batches/[id]', { id: batch.id })} />
						</div>
						<Button
							variant="ghost"
							size="sm"
							icon={RotateCcw}
							loading={reopening === batch.id}
							disabled={reopening !== null}
							onclick={() => reopen(batch.id, batch.name)}
						>
							Reopen<span class="sr-only"> {batch.name}</span>
						</Button>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</div>
