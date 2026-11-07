<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import { resolve } from '$app/paths';
	import { batchDraftFromRecipe } from '#lib/components/recipes/draft.ts';
	import BatchForm from '#lib/components/recipes/BatchForm.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const draft = $derived(
		data.recipe ? batchDraftFromRecipe(data.draft, data.recipe) : { ...data.draft, ingredients: [] }
	);
</script>

<svelte:head>
	<title>New batch · kcal</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<a
			href={resolve('/(app)/recipes')}
			class="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-md pr-2 text-base text-text-muted transition-colors duration-100 ease-out hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
		>
			<ChevronLeft size={20} aria-hidden="true" />
			Recipes
		</a>
		<h1 class="text-3xl font-semibold tracking-tight text-text">New batch</h1>
	</div>
	<!-- Keyed by recipe: another recipe mounts a fresh form. The same page reloaded keeps what is typed. -->
	{#key data.draft.recipeId}
		<BatchForm {draft} containers={data.containers} />
	{/key}
</div>
