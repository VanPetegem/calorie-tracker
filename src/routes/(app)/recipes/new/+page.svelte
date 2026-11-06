<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import { resolve } from '$app/paths';
	import RecipeForm from '#lib/components/recipes/RecipeForm.svelte';
</script>

<svelte:head>
	<title>New recipe · kcal</title>
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
		<h1 class="text-3xl font-semibold tracking-tight text-text">New recipe</h1>
	</div>
	<RecipeForm />
</div>
