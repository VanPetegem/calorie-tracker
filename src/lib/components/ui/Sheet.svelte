<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import IconButton from './IconButton.svelte';

	/**
	 * A modal sheet on a native `<dialog>`: a bottom sheet below 640 px, a centered dialog above.
	 *
	 * Focus: the element focused when the sheet opens is remembered and focused again after it closes, if it is still
	 * in the page. Safari does not focus a button on click or tap, so after a touch open there is no opener to
	 * restore and focus falls back to the browser default (the page body).
	 * Scroll: the page behind is locked with `overflow: hidden` on the root while a sheet is modal, because
	 * `overscroll-behavior` alone does not stop iOS scrolling the page behind a sheet that does not overflow.
	 */
	type Props = {
		open: boolean;
		title: string;
		description?: string;
		children: Snippet;
		/** Actions pinned below the scrolling body. Put the safe action first in the tab order and give it `autofocus`. */
		footer?: Snippet;
		/** Called after the sheet has closed, however it was closed. */
		onclose?: () => void;
	};

	let { open = $bindable(false), title, description, children, footer, onclose }: Props = $props();

	const uid = $props.id();
	const titleId = `${uid}-title`;
	const descriptionId = `${uid}-description`;

	// Max time to wait for the exit transition, in case it never reports as finished.
	const EXIT_TIMEOUT_MS = 400;

	let closing = $state(false);
	let pressedOutside = false;
	let opener: HTMLElement | null = null;

	// `open` is the single source of truth. Every way of closing (Escape, backdrop, close button, parent) sets it to
	// false, and this attachment, which reruns when `open` changes, plays the exit transition before the native close.
	function sync(el: HTMLDialogElement) {
		const wantOpen = open;
		untrack(() => (wantOpen ? show(el) : hide(el)));
	}

	function show(el: HTMLDialogElement) {
		closing = false;
		if (el.open) return;
		const active = document.activeElement;
		opener = active instanceof HTMLElement && active !== document.body ? active : null;
		el.showModal();
	}

	async function hide(el: HTMLDialogElement) {
		if (!el.open || closing) return;
		closing = true;
		await tick();
		const animations = el.getAnimations({ subtree: true });
		if (animations.length > 0) {
			await Promise.race([
				Promise.allSettled(animations.map((animation) => animation.finished)),
				new Promise((resolve) => setTimeout(resolve, EXIT_TIMEOUT_MS))
			]);
		}
		// Reopened while the exit was playing.
		if (!closing) return;
		el.close();
	}

	function outside(event: MouseEvent, el: HTMLDialogElement) {
		const rect = el.getBoundingClientRect();
		return (
			event.clientX < rect.left ||
			event.clientX > rect.right ||
			event.clientY < rect.top ||
			event.clientY > rect.bottom
		);
	}

	function handleCancel(event: Event) {
		// Escape. Close through `open` so the exit transition plays.
		event.preventDefault();
		open = false;
	}

	function handleClose() {
		closing = false;
		open = false;
		// The browser restores focus itself, but not in every case (see the doc comment on Props).
		if (opener?.isConnected) opener.focus();
		opener = null;
		onclose?.();
	}

	// Press and release must both land on the backdrop, so a text selection that ends there does not dismiss.
	function handlePointerDown(event: PointerEvent & { currentTarget: HTMLDialogElement }) {
		const el = event.currentTarget;
		pressedOutside = event.target === el && outside(event, el);
	}

	function handleClick(event: MouseEvent & { currentTarget: HTMLDialogElement }) {
		const el = event.currentTarget;
		if (event.target === el && pressedOutside && outside(event, el)) open = false;
		pressedOutside = false;
	}
</script>

<!--
	The backdrop is part of the dialog element, so a click on it targets the dialog itself. Keyboard users close with
	Escape or the close button, which makes this pointer handler an enhancement.
-->
<dialog
	{@attach sync}
	aria-labelledby={titleId}
	aria-describedby={description ? descriptionId : undefined}
	data-closing={closing || undefined}
	oncancel={handleCancel}
	onclose={handleClose}
	onpointerdown={handlePointerDown}
	onclick={handleClick}
	data-sheet
	class="sheet rounded-t-lg border-t border-border bg-surface-raised text-text shadow-lg duration-300 ease-out data-closing:duration-200 data-closing:ease-in sm:rounded-lg sm:border"
>
	<div
		class="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border-strong sm:hidden"
		aria-hidden="true"
	></div>
	<header class="flex shrink-0 items-start gap-3 pt-2 pr-2 pl-4 sm:pt-3">
		<div class="flex min-w-0 flex-1 flex-col gap-1 py-2">
			<h2 id={titleId} class="text-lg font-semibold text-text">{title}</h2>
			{#if description}
				<p id={descriptionId} class="text-base text-text-muted">{description}</p>
			{/if}
		</div>
		<IconButton label="Close" icon={X} onclick={() => (open = false)} />
	</header>
	<div class="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">
		{@render children()}
	</div>
	{#if footer}
		<footer
			class="flex shrink-0 flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end"
		>
			{@render footer()}
		</footer>
	{/if}
</dialog>

<style>
	/*
	 * Values Tailwind has no token for. Bottom sheet by default, centered dialog from 640 px.
	 * The base rule is the closed/exit state; the :modal rule is the open state and animates in from the base through
	 * @starting-style. Durations and easings come from the utilities on the element: 300 ms ease-out in, 200 ms
	 * ease-in out. The global reduced motion rule sets them to 0 ms.
	 */
	/* Page scroll lock. Global because the rule targets the root, which this component does not render. */
	:global(html:has(dialog[data-sheet]:modal)) {
		overflow: hidden;
		scrollbar-gutter: stable;
	}

	.sheet {
		width: 100%;
		max-width: none;
		max-height: 90dvh;
		margin: auto 0 0;
		padding: 0 0 env(safe-area-inset-bottom);
		overflow: hidden;
		overscroll-behavior: contain;
		transform: translateY(100%);
		transition-property: transform, opacity;
	}

	.sheet:modal {
		display: flex;
		flex-direction: column;
	}

	.sheet:modal:not([data-closing]) {
		transform: none;

		@starting-style {
			transform: translateY(100%);
		}
	}

	.sheet::backdrop {
		overflow: hidden;
		overscroll-behavior: contain;
		background-color: transparent;
		transition-property: background-color;
		transition-duration: inherit;
		transition-timing-function: inherit;
	}

	.sheet:modal:not([data-closing])::backdrop {
		background-color: var(--kc-scrim);

		@starting-style {
			background-color: transparent;
		}
	}

	@media (min-width: 640px) {
		.sheet {
			max-width: 480px;
			margin: auto;
			padding-bottom: 0;
			opacity: 0;
			transform: scale(0.96);
		}

		.sheet:modal:not([data-closing]) {
			opacity: 1;
			transform: none;

			@starting-style {
				opacity: 0;
				transform: scale(0.96);
			}
		}
	}
</style>
