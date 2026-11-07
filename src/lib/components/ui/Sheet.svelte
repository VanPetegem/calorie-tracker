<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import IconButton from './IconButton.svelte';
	import { popLayer, pushLayer } from './sheet-stack.ts';

	/**
	 * A modal sheet: a bottom sheet below 640 px, a centered dialog above.
	 *
	 * Not a `<dialog>`: on iOS, Brave and Firefox placed a `showModal()` dialog below the visible screen, and with
	 * `show()` Safari and Brave showed only a strip of the sheet at the bottom. A plain fixed panel is the one
	 * thing every iOS browser placed correctly, so the sheet is a `div` with `role="dialog"` in a fixed layer moved
	 * to the end of the body, and the parts of a modal are added by hand: a scrim, initial focus, and
	 * `sheet-stack.ts` for the rest (newest sheet on top, the page behind `inert`, Escape closes the top sheet).
	 * The slide in is a transition on `data-shown`, set after a forced layout of the start position, not `@starting-style`.
	 *
	 * Focus: on open, the element with `autofocus` (else the first focusable one, else the panel) is focused. The
	 * element focused before is focused again after close, if it is still in the page. Safari does not focus a
	 * button on click or tap, so after a touch open there is no opener to restore.
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

	const FOCUSABLE =
		'button:not([disabled]), a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [contenteditable]:not([contenteditable="false"]), audio[controls], video[controls], iframe, [tabindex]:not([tabindex="-1"])';

	/** In the page (the layer is displayed); `shown` slides it in, `closing` plays the exit. */
	let visible = $state(false);
	let shown = $state(false);
	let closing = $state(false);
	let pressedOutside = false;
	let opener: HTMLElement | null = null;
	let layer = $state<HTMLElement>();
	let panel = $state<HTMLElement>();

	/** Moves the layer to the end of the body, out of any stacking context or `inert` page container. */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return () => {
			popLayer(node);
			node.remove();
		};
	}

	// `open` is the single source of truth. Every way of closing (Escape, scrim, close button, parent) sets it to
	// false, and this effect plays the exit transition before the close. It waits for the bound elements.
	$effect(() => {
		const wantOpen = open;
		const current = layer;
		const el = panel;
		if (!current || !el) return;
		untrack(() => (wantOpen ? show(el, current) : hide(current)));
	});

	async function show(el: HTMLElement, current: HTMLElement) {
		// Read before pushLayer: making the page inert can blur the focused trigger.
		const active = document.activeElement;
		const reopened = visible;
		closing = false;
		pushLayer(current, () => (open = false), !reopened);
		if (reopened) {
			shown = true;
			return;
		}
		opener = active instanceof HTMLElement && active !== document.body ? active : null;
		visible = true;
		await tick();
		// Closed again while this tick ran: hide() owns the sheet now.
		if (!open || closing) return;
		const target =
			el.querySelector<HTMLElement>('[autofocus]') ??
			el.querySelector<HTMLElement>(FOCUSABLE) ??
			el;
		target.focus({ preventScroll: true });
		// The target may not take focus (hidden at this breakpoint, inside a closed <details>): focus the panel.
		if (document.activeElement !== target) el.focus({ preventScroll: true });
		// Lay the panel out at its start position (off screen) now, so setting `data-shown` starts the transition.
		void el.offsetHeight;
		shown = true;
	}

	async function hide(current: HTMLElement) {
		if (!visible || closing) return;
		closing = true;
		shown = false;
		// The sheet below (or the page) takes input again while this one animates out: the closing layer is taken off
		// the stack and lets taps through (`data-closing` on the layer).
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
		closing = false;
		visible = false;
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

<div
	class="layer"
	hidden={!visible}
	data-closing={closing || undefined}
	bind:this={layer}
	{@attach portal}
>
	<!--
		The scrim closes on a tap. Keyboard users close with Escape or the close button, which makes this pointer
		handler an enhancement.
	-->
	<div
		class="scrim duration-300 ease-out data-closing:duration-200 data-closing:ease-in"
		data-shown={shown || undefined}
		data-closing={closing || undefined}
		aria-hidden="true"
		onpointerdown={handlePointerDown}
		onclick={handleClick}
	></div>
	<div
		bind:this={panel}
		role="dialog"
		aria-modal="true"
		aria-labelledby={titleId}
		aria-describedby={description ? descriptionId : undefined}
		tabindex="-1"
		data-sheet
		data-open={visible || undefined}
		data-shown={shown || undefined}
		data-closing={closing || undefined}
		class="sheet rounded-t-lg border-t border-border bg-surface-raised text-text shadow-lg duration-300 ease-out outline-none data-closing:duration-200 data-closing:ease-in sm:rounded-lg sm:border"
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
	</div>
</div>

<style>
	/*
	 * Values Tailwind has no token for. Bottom sheet by default, centered dialog from 640 px.
	 * The base rule is the closed/exit state; [data-shown] is the open state, set after the start position is laid
	 * out so the transition runs. Durations and easings come from the utilities on the elements: 300 ms ease-out in, 200 ms
	 * ease-in out. The global reduced motion rule sets them to 0 ms.
	 */
	/* Page scroll lock. Global because the rule targets the root, which this component does not render. */
	:global(html:has([data-sheet][data-open])) {
		overflow: hidden;
		scrollbar-gutter: stable;
	}

	/* A plain fixed box, like the tab bar, which every iOS browser places correctly; above it and the toasts. */
	.layer {
		position: fixed;
		inset: 0;
		z-index: 60;
	}

	/* A closed layer must not cover the page. */
	.layer[hidden] {
		display: none;
	}

	/* A closing layer lets taps through to what is below it. */
	.layer[data-closing] {
		pointer-events: none;
	}

	.scrim {
		position: absolute;
		inset: 0;
		overflow: hidden;
		overscroll-behavior: contain;
		background-color: transparent;
		transition-property: background-color;
	}

	.scrim[data-shown] {
		background-color: var(--kc-scrim);
	}

	.sheet {
		position: absolute;
		inset: auto 0 0;
		display: flex;
		flex-direction: column;
		width: 100%;
		max-height: 90dvh;
		padding: 0 0 env(safe-area-inset-bottom);
		overflow: hidden;
		overscroll-behavior: contain;
		transform: translateY(100%);
		transition-property: transform, opacity;
	}

	.sheet[data-shown] {
		transform: none;
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

		.sheet[data-shown] {
			opacity: 1;
			transform: none;
		}
	}
</style>
