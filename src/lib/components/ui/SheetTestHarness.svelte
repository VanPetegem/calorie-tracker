<script lang="ts">
	import { flushSync } from 'svelte';
	import Sheet from './Sheet.svelte';

	let {
		onclose,
		secondFirst = false,
		startOpen = false,
		autofocusCancel = false
	}: {
		onclose?: () => void;
		secondFirst?: boolean;
		startOpen?: boolean;
		autofocusCancel?: boolean;
	} = $props();

	/** Opens and closes again before the sheet's opening tick has finished. */
	function flash() {
		open = true;
		flushSync();
		open = false;
	}
	// svelte-ignore state_referenced_locally
	let open = $state(startOpen);
	let second = $state(false);
</script>

<button type="button" onclick={() => (open = true)}>Open sheet</button>
<button type="button" onclick={flash}>Flash sheet</button>
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
		<!-- svelte-ignore a11y_autofocus -->
		<button type="button" autofocus={autofocusCancel} onclick={() => (open = false)}>Cancel</button>
	{/snippet}
</Sheet>

{#if !secondFirst}{@render secondSheet()}{/if}
