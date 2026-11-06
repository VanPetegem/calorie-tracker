<script lang="ts">
	import type { DayData } from '#lib/server/log/day.ts';
	import { Toaster } from '#lib/components/ui/index.ts';
	import DayView from './DayView.svelte';

	/** DayView next to the Toaster, which the app layout normally provides. Only for DayView.svelte.spec.ts. */
	let { data }: { data: DayData } = $props();
</script>

<DayView {data} />
<Toaster />
