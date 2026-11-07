<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { Toaster } from '#lib/components/ui/index.ts';
	import BatchForm from './BatchForm.svelte';

	/** BatchForm next to the Toaster, which the app layout normally provides. Only for specs. */
	let props: ComponentProps<typeof BatchForm> = $props();
</script>

<BatchForm {...props} />
<Toaster />
