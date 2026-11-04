<script lang="ts">
	import { cubicIn, cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import { toasts, type ToastItem } from '#lib/stores/toasts.svelte.ts';
	import Button from './Button.svelte';

	const toneIcon = {
		neutral: undefined,
		success: { icon: CircleCheck, class: 'text-success' },
		danger: { icon: CircleAlert, class: 'text-danger' }
	} as const;

	// Svelte transitions run in JS, so the global CSS reduced motion rule does not reach them.
	const enter = $derived({
		y: 16,
		duration: prefersReducedMotion.current ? 0 : 300,
		easing: cubicOut
	});
	const exit = $derived({
		y: 16,
		duration: prefersReducedMotion.current ? 0 : 200,
		easing: cubicIn
	});

	async function runAction(item: ToastItem) {
		await item.action?.run();
	}
</script>

<div class="toaster" aria-live="polite">
	{#each toasts.items as item (item.id)}
		{@const tone = toneIcon[item.tone]}
		<div
			class="pointer-events-auto flex w-full items-center gap-3 rounded-md border border-border bg-surface-raised py-1 pr-1 pl-4 text-text shadow-md"
			in:fly={enter}
			out:fly={exit}
		>
			{#if tone}
				<tone.icon size={20} class={['shrink-0', tone.class]} aria-hidden="true" />
			{/if}
			<p class="min-w-0 flex-1 py-2 text-base">{item.message}</p>
			{#if item.action}
				<Button variant="ghost" size="sm" onclick={() => runAction(item)} class="shrink-0">
					{item.action.label}
				</Button>
			{/if}
		</div>
	{/each}
</div>

<style>
	/* Sits above the tab bar below 1024 px, 24 px from the edge above that. Only the toasts take pointer events. */
	.toaster {
		position: fixed;
		z-index: 50;
		right: 0;
		bottom: calc(env(safe-area-inset-bottom) + 72px);
		left: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		margin-inline: auto;
		width: min(100% - 32px, 400px);
		pointer-events: none;
	}

	@media (min-width: 1024px) {
		.toaster {
			bottom: 24px;
		}
	}
</style>
