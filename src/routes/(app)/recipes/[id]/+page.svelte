<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import { resolve } from '$app/paths';
	import { recipeDraft } from '#lib/components/recipes/draft.ts';
	import RecipeForm from '#lib/components/recipes/RecipeForm.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const draft = $derived(recipeDraft(data.recipe));
</script>

<svelte:head>
	<title>{data.recipe.name} · kcal</title>
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
		<h1 class="text-3xl font-semibold tracking-tight text-text">{data.recipe.name}</h1>
	</div>
	<!-- Keyed by id: another recipe mounts a fresh form. The same recipe reloaded after a save keeps what is typed. -->
	{#key data.recipe.id}
		<RecipeForm recipe={draft} archived={data.recipe.archivedAt !== null} />
	{/key}
</div>
