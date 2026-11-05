<script lang="ts">
	import { page } from '$app/state';
	import AddSheet from '#lib/components/log/AddSheet.svelte';
	import Sidebar from '#lib/components/shell/Sidebar.svelte';
	import TabBar from '#lib/components/shell/TabBar.svelte';
	import { addSheet } from '#lib/stores/add-sheet.svelte.ts';
	import type { DayData } from '#lib/server/log/day.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The day pages carry the day, recents and frequents; other pages leave them out and the sheet fetches its own.
	const day = $derived(
		'recents' in page.data && 'date' in page.data ? (page.data as unknown as DayData) : null
	);

	// ⌘K on a Mac, Ctrl+K elsewhere.
	function onkeydown(event: KeyboardEvent) {
		if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey)
			return;
		event.preventDefault();
		addSheet.show();
	}
</script>

<!-- Below 1024 px a tab bar; from 1024 px a sidebar. The hidden one is display: none, so only one landmark exists. -->
<svelte:window {onkeydown} />

<Sidebar pathname={page.url.pathname} onadd={() => addSheet.show()} class="hidden lg:flex" />
<TabBar pathname={page.url.pathname} onadd={() => addSheet.show()} class="lg:hidden" />

<div class="shell">
	<main class="content">
		{@render children()}
	</main>
</div>

<AddSheet {day} />

<style>
	/* Clears the status bar (the app draws under it) and the fixed tab bar: 64 px of bar plus the home indicator inset. */
	.shell {
		padding-top: calc(env(safe-area-inset-top) + 24px);
		padding-bottom: calc(env(safe-area-inset-bottom) + 64px + 24px);
		padding-inline: max(16px, env(safe-area-inset-left)) max(16px, env(safe-area-inset-right));
	}

	.content {
		margin-inline: auto;
		max-width: 640px;
	}

	/* The sidebar is 240 px wide and fixed; the content centers in the space to its right. */
	@media (min-width: 1024px) {
		.shell {
			padding-bottom: 32px;
			padding-inline: calc(240px + 32px) 32px;
		}
	}
</style>
