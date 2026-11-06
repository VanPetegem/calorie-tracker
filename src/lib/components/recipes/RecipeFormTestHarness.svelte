<script lang="ts">
	import { Toaster } from '#lib/components/ui/index.ts';
	import type { RecipeDraft } from './draft.ts';
	import RecipeForm from './RecipeForm.svelte';

	/** RecipeForm next to the Toaster, which the app layout normally provides. Only for specs. */
	let { recipe, archived = false }: { recipe?: RecipeDraft; archived?: boolean } = $props();
</script>

<RecipeForm {recipe} {archived} />
<Toaster />
