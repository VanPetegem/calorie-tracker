<script lang="ts">
	import DayView from '#lib/components/log/DayView.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<DayView {data} />
