<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import IconButton from './IconButton.svelte';
	import { popLayer, pushLayer } from './sheet-stack.ts';

	/**
	 * A modal sheet on a native `<dialog>`: a bottom sheet below 640 px, a centered dialog above.
	 *
	 * Not `showModal()`: Brave and Firefox on iOS place top layer content below the visible screen, so only the
	 * sheet's title showed. The dialog opens with `show()` inside a fixed layer moved to the end of the body, and
	 * the parts of a modal are added by hand: a scrim instead of `::backdrop`, and `sheet-stack.ts` for the rest
	 * (newest sheet on top, the page behind `inert`, Escape and the Android back gesture close the top sheet).
	 *
	 * Focus: the element focused when the sheet opens is remembered and focused again after it closes, if it is still
	 * in the page. Safari does not focus a button on click or tap, so after a touch open there is no opener to
	 * restore and focus falls back to the browser default (the page body).
	 * Scroll: the page behind is locked with `overflow: hidden` on the root while a sheet is open, because
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
	let layer = $state<HTMLElement>();

	/** Moves the layer to the end of the body, out of any stacking context or `inert` page container. */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return () => {
			popLayer(node);
			node.remove();
		};
	}

	// `open` is the single source of truth. Every way of closing (Escape, scrim, close button, parent) sets it to
	// false, and this attachment, which reruns when `open` changes, plays the exit transition before the close.
	// It also waits for the layer, which is bound after this attachment first runs (a sheet mounted open).
	function sync(el: HTMLDialogElement) {
		const wantOpen = open;
		const current = layer;
		if (!current) return;
		untrack(() => (wantOpen ? show(el, current) : hide(el, current)));
	}

	function show(el: HTMLDialogElement, current: HTMLElement) {
		closing = false;
		pushLayer(current, () => (open = false), !el.open);
		if (el.open) return;
		const active = document.activeElement;
		opener = active instanceof HTMLElement && active !== document.body ? active : null;
		el.show();
	}

	async function hide(el: HTMLDialogElement, current: HTMLElement) {
		if (!el.open || closing) return;
		closing = true;
		// The sheet below (or the page) takes input again while this one animates out.
		popLayer(current);
		await tick();
		const animations = current.getAnimations({ subtree: true });
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

	function handleClose() {
		closing = false;
		open = false;
		// Focus the opener again, if it is still in the page.
		if (opener?.isConnected) opener.focus();
		opener = null;
		onclose?.();
	}

	// Press and release must both land on the scrim, so a text selection that ends there does not dismiss.
	function handlePointerDown(event: PointerEvent) {
		pressedOutside = event.target === event.currentTarget;
	}

	function handleClick(event: MouseEvent) {
		if (event.target === event.currentTarget && pressedOutside) open = false;
		pressedOutside = false;
	}
</script>

<div class="layer" bind:this={layer} {@attach portal}>
	<!--
		The scrim closes on a tap. Keyboard users close with Escape or the close button, which makes this pointer
		handler an enhancement.
	-->
	<div
		class="scrim duration-300 ease-out data-closing:duration-200 data-closing:ease-in"
		data-closing={closing || undefined}
		aria-hidden="true"
		onpointerdown={handlePointerDown}
		onclick={handleClick}
	></div>
	<dialog
		{@attach sync}
		aria-modal="true"
		aria-labelledby={titleId}
		aria-describedby={description ? descriptionId : undefined}
		data-closing={closing || undefined}
		onclose={handleClose}
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
</div>

<style>
	/*
	 * Values Tailwind has no token for. Bottom sheet by default, centered dialog from 640 px.
	 * The base rule is the closed/exit state; the [open] rule is the open state and animates in from the base through
	 * @starting-style. Durations and easings come from the utilities on the elements: 300 ms ease-out in, 200 ms
	 * ease-in out. The global reduced motion rule sets them to 0 ms.
	 */
	/* Page scroll lock. Global because the rule targets the root, which this component does not render. */
	:global(html:has(dialog[data-sheet][open])) {
		overflow: hidden;
		scrollbar-gutter: stable;
	}

	/* Fixed like the tab bar, which Brave and Firefox on iOS place correctly, and above it and the toasts. */
	.layer {
		position: fixed;
		inset: 0;
		z-index: 60;
	}

	/* A closed layer must not cover the page. */
	.layer:not(:has(> dialog[open])) {
		display: none;
	}

	.scrim {
		position: absolute;
		inset: 0;
		overflow: hidden;
		overscroll-behavior: contain;
		background-color: transparent;
		transition-property: background-color;
	}

	.scrim:not([data-closing]) {
		background-color: var(--kc-scrim);

		@starting-style {
			background-color: transparent;
		}
	}

	.sheet {
		position: fixed;
		inset: auto 0 0;
		width: 100%;
		max-width: none;
		max-height: 90dvh;
		margin: 0;
		padding: 0 0 env(safe-area-inset-bottom);
		overflow: hidden;
		overscroll-behavior: contain;
		transform: translateY(100%);
		transition-property: transform, opacity;
	}

	.sheet[open] {
		display: flex;
		flex-direction: column;
	}

	.sheet[open]:not([data-closing]) {
		transform: none;

		@starting-style {
			transform: translateY(100%);
		}
	}

	@media (min-width: 640px) {
		.sheet {
			inset: 0;
			max-width: 480px;
			height: fit-content;
			margin: auto;
			padding-bottom: 0;
			opacity: 0;
			transform: scale(0.96);
		}

		.sheet[open]:not([data-closing]) {
			opacity: 1;
			transform: none;

			@starting-style {
				opacity: 0;
				transform: scale(0.96);
			}
		}
	}
</style>
