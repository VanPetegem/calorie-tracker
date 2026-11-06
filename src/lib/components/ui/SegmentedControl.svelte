<script lang="ts" generics="T extends string">
	type Props = {
		/** A disabled option stays visible (and aria-disabled) but cannot be chosen; the caller says why next to the control. */
		options: { value: T; label: string; disabled?: boolean }[];
		value: T;
		/** Accessible name of the group. */
		label: string;
		/** Id of the element that explains the group, e.g. why an option is disabled. */
		describedby?: string;
		class?: string;
	};

	let { options, value = $bindable(), label, describedby, class: className = '' }: Props = $props();

	function onkeydown(event: KeyboardEvent & { currentTarget: HTMLElement }, index: number) {
		// The next enabled option in a direction, wrapping around; the same one when no other is enabled.
		const step = (from: number, by: 1 | -1) => {
			let at = from;
			for (let tried = 0; tried < options.length; tried++) {
				at = (at + by + options.length) % options.length;
				if (!options[at].disabled) return at;
			}
			return from;
		};
		let next: number;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				next = step(index, 1);
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				next = step(index, -1);
				break;
			case 'Home':
				next = step(options.length - 1, 1);
				break;
			case 'End':
				next = step(0, -1);
				break;
			default:
				return;
		}
		event.preventDefault();
		value = options[next].value;
		// Move focus with the selection (roving tabindex): the radios are the group's only children.
		(event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
	}
</script>

<div
	role="radiogroup"
	aria-label={label}
	aria-describedby={describedby}
	class={['inline-flex rounded-md border border-border-strong bg-surface p-0.5', className]}
>
	{#each options as option, index (option.value)}
		{@const checked = option.value === value}
		<button
			type="button"
			role="radio"
			aria-checked={checked}
			aria-disabled={option.disabled || undefined}
			tabindex={checked ? 0 : -1}
			onclick={() => {
				if (!option.disabled) value = option.value;
			}}
			onkeydown={(event) => onkeydown(event, index)}
			class={[
				'min-h-11 flex-1 rounded-sm px-4 text-base font-medium whitespace-nowrap transition-colors duration-100 ease-out',
				option.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
				checked ? 'bg-brand-solid text-on-brand' : 'text-text',
				!checked && !option.disabled && 'hover:bg-text/5'
			]}
		>
			{option.label}
		</button>
	{/each}
</div>
