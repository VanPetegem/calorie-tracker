<script lang="ts">
	import type { IconComponent } from './types';

	type Props = {
		/** Accessible name. There is no visible text. */
		label: string;
		icon: IconComponent;
		variant?: 'ghost' | 'secondary';
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		onclick?: (event: MouseEvent) => void;
		class?: string;
	};

	let {
		label,
		icon: Icon,
		variant = 'ghost',
		type = 'button',
		disabled = false,
		onclick,
		class: className = ''
	}: Props = $props();

	const variants = {
		ghost: 'text-text hover:bg-text/5',
		secondary: 'border border-border-strong bg-surface text-text hover:bg-text/5'
	} as const;
</script>

<button
	{type}
	{disabled}
	{onclick}
	aria-label={label}
	class={[
		'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md transition duration-100 ease-out',
		'not-disabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-50',
		variants[variant],
		className
	]}
>
	<Icon size={20} aria-hidden="true" />
</button>
