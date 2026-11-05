<script lang="ts">
	import './layout.css';
	import { Toaster } from '#lib/components/ui/index.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<title>kcal</title>
</svelte:head>

{@render children()}

<Toaster />
