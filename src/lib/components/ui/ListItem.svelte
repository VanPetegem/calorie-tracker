<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		subtitle?: string;
		leading?: Snippet;
		trailing?: Snippet;
		href?: string;
		onclick?: (event: MouseEvent) => void;
		class?: string;
	};

	let {
		title,
		subtitle,
		leading,
		trailing,
		href,
		onclick,
		class: className = ''
	}: Props = $props();

	const interactive = $derived(Boolean(href || onclick));
	const rowClass = $derived([
		'flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left',
		interactive &&
			// Inset ring: rows sit in overflow-hidden cards, which would clip the default outside outline.
			'cursor-pointer transition-colors duration-100 ease-out hover:bg-text/5 focus-visible:-outline-offset-2 focus-visible:outline-brand active:bg-text/10',
		className
	]);
</script>

{#snippet body()}
	{#if leading}
		<span class="flex shrink-0 items-center">{@render leading()}</span>
	{/if}
	<span class="flex min-w-0 flex-1 flex-col">
		<span class="truncate text-base text-text">{title}</span>
		{#if subtitle}
			<span class="truncate text-sm text-text-muted">{subtitle}</span>
		{/if}
	</span>
	{#if trailing}
		<span class="flex shrink-0 items-center text-text-muted">{@render trailing()}</span>
	{/if}
{/snippet}

{#if href}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass an already resolved href -->
	<a {href} {onclick} class={rowClass}>{@render body()}</a>
{:else if onclick}
	<button type="button" {onclick} class={rowClass}>{@render body()}</button>
{:else}
	<div class={rowClass}>{@render body()}</div>
{/if}
