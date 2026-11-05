<script lang="ts">
	import UtensilsCrossed from '@lucide/svelte/icons/utensils-crossed';
	import { Card, EmptyState } from '#lib/components/ui/index.ts';
</script>

<svelte:head>
	<title>Today · kcal</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<h1 class="text-3xl font-semibold tracking-tight text-text">Today</h1>
	<Card>
		<EmptyState
			icon={UtensilsCrossed}
			title="Nothing logged yet"
			body="Food you log today shows up here with your calories and macros."
		/>
	</Card>
</div>
