<script lang="ts">
	import CookingPot from '@lucide/svelte/icons/cooking-pot';
	import Plus from '@lucide/svelte/icons/plus';
	import { resolve } from '$app/paths';
	import { Button, Card, EmptyState } from '#lib/components/ui/index.ts';
	import RecipeRow from '#lib/components/recipes/RecipeRow.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Recipes · kcal</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex items-center justify-between gap-3">
		<h1 class="text-3xl font-semibold tracking-tight text-text">Recipes</h1>
		<Button href={resolve('/(app)/recipes/new')} icon={Plus} class="shrink-0">New recipe</Button>
	</div>

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
</div>
