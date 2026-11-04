<script lang="ts">
	import Sheet from './Sheet.svelte';

	let { onclose }: { onclose?: () => void } = $props();
	let open = $state(false);
</script>

<button type="button" onclick={() => (open = true)}>Open sheet</button>
<output data-testid="state">{open ? 'open' : 'closed'}</output>

<Sheet bind:open title="Delete entry" description="This removes it from today." {onclose}>
	<p>Body text</p>
	{#snippet footer()}
		<button type="button" onclick={() => (open = false)}>Cancel</button>
	{/snippet}
</Sheet>
