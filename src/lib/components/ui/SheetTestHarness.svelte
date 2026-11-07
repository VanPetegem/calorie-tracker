<script lang="ts">
	import Sheet from './Sheet.svelte';

	let {
		onclose,
		secondFirst = false,
		startOpen = false
	}: { onclose?: () => void; secondFirst?: boolean; startOpen?: boolean } = $props();
	// svelte-ignore state_referenced_locally
	let open = $state(startOpen);
	let second = $state(false);
</script>

<button type="button" onclick={() => (open = true)}>Open sheet</button>
<output data-testid="state">{open ? 'open' : 'closed'}</output>

{#snippet secondSheet()}
	<Sheet bind:open={second} title="Second sheet">
		<p>Second body</p>
	</Sheet>
{/snippet}

{#if secondFirst}{@render secondSheet()}{/if}

<Sheet bind:open title="Delete entry" description="This removes it from today." {onclose}>
	<p>Body text</p>
	<button type="button" onclick={() => (second = true)}>Open second</button>
	{#snippet footer()}
		<button type="button" onclick={() => (open = false)}>Cancel</button>
	{/snippet}
</Sheet>

{#if !secondFirst}{@render secondSheet()}{/if}
