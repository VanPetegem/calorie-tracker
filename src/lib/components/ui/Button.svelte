<script lang="ts">
	import type { Snippet } from 'svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { IconComponent } from './types';

	type Props = {
		variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
		size?: 'sm' | 'md' | 'lg';
		loading?: boolean;
		disabled?: boolean;
		/** Why the button is disabled. Read out through aria-describedby and shown while focused and for a few seconds after a tap. */
		disabledReason?: string;
		href?: string;
		type?: 'button' | 'submit' | 'reset';
		onclick?: (event: MouseEvent) => void;
		children: Snippet;
		icon?: IconComponent;
		class?: string;
	};

	let {
		variant = 'primary',
		size = 'md',
		loading = false,
		disabled = false,
		disabledReason,
		href,
		type = 'button',
		onclick,
		children,
		icon: Icon,
		class: className = ''
	}: Props = $props();

	const hintId = $props.id();
	let focused = $state(false);
	// iOS Safari does not focus a button on tap, so a tap on a disabled button reveals the reason too.
	let tapped = $state(false);
	let tappedTimer: ReturnType<typeof setTimeout> | undefined;
	const REVEAL_MS = 4000;

	const inactive = $derived(disabled || loading);
	const hint = $derived(disabled ? disabledReason : undefined);

	const variants = {
		primary: {
			base: 'bg-brand-solid text-on-brand',
			hover: 'group-hover:brightness-110 group-active:brightness-95'
		},
		secondary: {
			base: 'border border-border-strong bg-surface text-text',
			hover: 'group-hover:bg-text/5'
		},
		ghost: { base: 'text-text', hover: 'group-hover:bg-text/5' },
		destructive: {
			base: 'border border-danger bg-surface text-danger',
			hover: 'group-hover:bg-danger/10'
		}
	} as const;

	// The interactive element is always at least 44 px tall. Only the inner face shrinks to 36 px for `sm`.
	const faceSizes = {
		sm: 'h-9 px-3 text-sm',
		md: 'h-11 px-4 text-base',
		lg: 'h-13 px-6 text-lg'
	} as const;

	const hitClass =
		'group inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center outline-hidden transition-transform duration-200 ease-out aria-disabled:cursor-not-allowed aria-disabled:opacity-50';
	const hitPress = 'active:scale-98';

	const hitClasses = $derived([hitClass, !inactive && hitPress]);
	const faceClasses = $derived([
		'inline-flex w-full items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition duration-100 ease-out group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-brand',
		faceSizes[size],
		variants[variant].base,
		!inactive && variants[variant].hover
	]);
	const iconSize = $derived(size === 'sm' ? 16 : 20);

	function reveal() {
		tapped = true;
		clearTimeout(tappedTimer);
		tappedTimer = setTimeout(() => (tapped = false), REVEAL_MS);
	}

	function hide() {
		focused = false;
		tapped = false;
		clearTimeout(tappedTimer);
	}

	function handleClick(event: MouseEvent) {
		if (inactive) {
			event.preventDefault();
			if (hint) reveal();
			return;
		}
		onclick?.(event);
	}
</script>

{#snippet face()}
	<span class={faceClasses}>
		{#if loading}
			<LoaderCircle
				size={iconSize}
				class="animate-spin motion-reduce:animate-none"
				aria-hidden="true"
			/>
		{:else if Icon}
			<Icon size={iconSize} aria-hidden="true" />
		{/if}
		{@render children()}
	</span>
{/snippet}

<span class={['relative inline-flex', className]}>
	{#if href}
		<!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass an already resolved href -->
		<a
			{href}
			class={hitClasses}
			aria-disabled={inactive || undefined}
			aria-busy={loading || undefined}
			aria-describedby={hint ? hintId : undefined}
			onclick={handleClick}
			onfocus={() => (focused = true)}
			onblur={hide}
		>
			{@render face()}
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{:else}
		<button
			{type}
			class={hitClasses}
			aria-disabled={inactive || undefined}
			aria-busy={loading || undefined}
			aria-describedby={hint ? hintId : undefined}
			onclick={handleClick}
			onfocus={() => (focused = true)}
			onblur={hide}
		>
			{@render face()}
		</button>
	{/if}
	{#if hint}
		<span
			id={hintId}
			class={focused || tapped
				? 'absolute top-full left-0 z-10 mt-1 text-xs whitespace-nowrap text-text-muted'
				: 'sr-only'}
		>
			{hint}
		</span>
	{/if}
</span>
