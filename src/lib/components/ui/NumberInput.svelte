<script lang="ts">
	import { parseDecimal } from '#lib/utils/decimal.ts';
	import Input from './Input.svelte';

	type Props = {
		label: string;
		value: number | null;
		unit?: string;
		min?: number;
		max?: number;
		/** ArrowUp and ArrowDown change the number by this amount. Typed text is not snapped to it. */
		step?: number;
		/** Decimal places kept when the text is committed. */
		decimals?: number;
		/** Error from the parent. It takes precedence over the field's own format and range errors. */
		error?: string;
		hint?: string;
		disabled?: boolean;
		name?: string;
		placeholder?: string;
		class?: string;
	};

	let {
		label,
		value = $bindable(null),
		unit,
		min,
		max,
		step,
		decimals = 1,
		error,
		hint,
		disabled = false,
		name,
		placeholder,
		class: className = ''
	}: Props = $props();

	const formatter = $derived(
		new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals, useGrouping: false })
	);

	function format(v: number | null): string {
		return v === null ? '' : formatter.format(v);
	}

	// What the person typed, kept until the field loses focus. A draft only applies while the bound value
	// is the one it was typed against, so a value set by the parent always wins over stale text.
	type Draft = { text: string; forValue: number | null; error?: string };
	let draft = $state.raw<Draft | null>(null);

	const activeDraft = $derived(draft && draft.forValue === value ? draft : null);
	const text = $derived(activeDraft ? activeDraft.text : format(value));

	function type(next: string) {
		draft = { text: next, forValue: value };
	}

	function commit() {
		if (!activeDraft) return;
		const typed = activeDraft.text;
		if (typed.trim() === '') return accept(null);
		const parsed = parseDecimal(typed);
		if (parsed === null) return reject(typed, 'Enter a number like 72,5 or 72.5.');
		const factor = 10 ** decimals;
		const rounded = Math.round(parsed * factor) / factor;
		if (min !== undefined && rounded < min) return reject(typed, `Enter ${min} or more.`);
		if (max !== undefined && rounded > max) return reject(typed, `Enter ${max} or less.`);
		accept(rounded);
	}

	function onkeydown(event: KeyboardEvent) {
		if (step === undefined || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
		event.preventDefault();
		const base = parseDecimal(text) ?? min ?? 0;
		const factor = 10 ** decimals;
		let next = Math.round((base + (event.key === 'ArrowUp' ? step : -step)) * factor) / factor;
		if (min !== undefined) next = Math.max(min, next);
		if (max !== undefined) next = Math.min(max, next);
		accept(next);
	}

	function accept(next: number | null) {
		value = next;
		draft = null;
	}

	// An invalid entry commits null, so the parent never submits a stale number next to an error.
	function reject(typed: string, message: string) {
		value = null;
		draft = { text: typed, forValue: null, error: message };
	}
</script>

<Input
	{label}
	{hint}
	{disabled}
	{name}
	{placeholder}
	bind:value={() => text, type}
	error={error ?? activeDraft?.error}
	suffix={unit}
	inputmode="decimal"
	autocomplete="off"
	class={className}
	onblur={commit}
	{onkeydown}
/>
