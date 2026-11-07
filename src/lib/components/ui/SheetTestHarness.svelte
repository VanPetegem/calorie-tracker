<script lang="ts">
	import Sheet from './Sheet.svelte';

	let { onclose }: { onclose?: () => void } = $props();
	let open = $state(false);
	let second = $state(false);
</script>

<button type="button" onclick={() => (open = true)}>Open sheet</button>
<output data-testid="state">{open ? 'open' : 'closed'}</output>

<Sheet bind:open title="Delete entry" description="This removes it from today." {onclose}>
	<p>Body text</p>
	<button type="button" onclick={() => (second = true)}>Open second</button>
	{#snippet footer()}
		<button type="button" onclick={() => (open = false)}>Cancel</button>
	{/snippet}
</Sheet>

<Sheet bind:open={second} title="Second sheet">
	<p>Second body</p>
</Sheet>
