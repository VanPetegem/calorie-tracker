<script lang="ts">
	import { untrack } from 'svelte';
	import { Toaster } from '#lib/components/ui/index.ts';
	import type { DraftIngredient } from './draft.ts';
	import IngredientList from './IngredientList.svelte';

	/** IngredientList with a bound list next to the Toaster, which the app layout normally provides. Only for specs. */
	let { initial }: { initial: DraftIngredient[] } = $props();

	let ingredients = $state(untrack(() => initial));
</script>

<!-- Fills the list without the picker, for the limit specs. -->
<button
	type="button"
	onclick={() =>
		(ingredients = [...ingredients, { ...ingredients[0]!, key: `filler-${ingredients.length}` }])}
>
	Add filler
</button>
<IngredientList bind:ingredients />
<Toaster />
