<script lang="ts">
	import CookingPot from '@lucide/svelte/icons/cooking-pot';
	import { Card, EmptyState } from '#lib/components/ui/index.ts';
</script>

<svelte:head>
	<title>Recipes · kcal</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<h1 class="text-3xl font-semibold tracking-tight text-text">Recipes</h1>
	<Card>
		<EmptyState
			icon={CookingPot}
			title="No recipes yet"
			body="Add a recipe from raw ingredients, then cook batches and log portions."
		/>
	</Card>
</div>
