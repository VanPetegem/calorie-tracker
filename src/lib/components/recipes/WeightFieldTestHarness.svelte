<script lang="ts">
	import { untrack } from 'svelte';
	import type { ContainerInput } from '#lib/schemas/batch.ts';
	import type { Container } from '#lib/server/db/schema.ts';
	import WeightField from './WeightField.svelte';

	/** WeightField with its bound `value` and `error` printed, so a spec can read them. Only for specs. */
	let {
		value: start = null,
		containers: initial,
		oncreatecontainer
	}: {
		value?: number | null;
		containers: Container[];
		oncreatecontainer: (input: ContainerInput) => Promise<Container>;
	} = $props();

	let value = $state<number | null>(untrack(() => start));
	let error = $state<string | undefined>();
	// The parent of the field keeps the list: a created container joins it.
	let containers = $state(untrack(() => initial));

	async function create(input: ContainerInput) {
		const created = await oncreatecontainer(input);
		containers = [...containers, created];
		return created;
	}
</script>

<WeightField bind:value bind:error {containers} oncreatecontainer={create} />
<output data-testid="value">{value === null ? 'none' : value}</output>
<output data-testid="problem">{error ?? 'none'}</output>
