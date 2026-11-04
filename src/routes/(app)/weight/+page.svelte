<script lang="ts">
	import Scale from '@lucide/svelte/icons/scale';
	import { Card, EmptyState } from '#lib/components/ui/index.ts';
</script>

<svelte:head>
	<title>Weight · kcal</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<h1 class="text-3xl font-semibold tracking-tight text-text">Weight</h1>
	<Card>
		<EmptyState
			icon={Scale}
			title="No weigh-ins yet"
			body="Log your morning weight to see your trend and weekly gain."
		/>
	</Card>
</div>
