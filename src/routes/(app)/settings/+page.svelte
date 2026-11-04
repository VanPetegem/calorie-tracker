<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { Card, ListItem } from '#lib/components/ui/index.ts';
</script>

<svelte:head>
	<title>Settings · kcal</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<h1 class="text-3xl font-semibold tracking-tight text-text">Settings</h1>
	<Card>
		<p class="text-base text-text-muted">
			Your profile, calorie goal and units will live here. Nothing to set up yet.
		</p>
	</Card>
	<div class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
		<ListItem title="Design system" subtitle="Tokens and components" href="/design">
			{#snippet trailing()}
				<ChevronRight size={20} aria-hidden="true" />
			{/snippet}
		</ListItem>
	</div>
</div>
