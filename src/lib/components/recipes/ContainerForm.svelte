<script lang="ts">
	import { untrack } from 'svelte';
	import * as v from 'valibot';
	import { ContainerInput } from '#lib/schemas/batch.ts';
	import { Button, Input } from '#lib/components/ui/index.ts';

	/**
	 * Name and tare (the weight of the empty container) of a container. Without `container` it creates one, with it
	 * it renames and re-tares. The fields are checked against `ContainerInput`, the schema the server uses, when they
	 * lose focus and on submit. `onsave` does the write; a failure keeps the form as it is and says so.
	 */
	type Props = {
		container?: { id: string; name: string; tareG: number };
		onsave: (input: ContainerInput) => Promise<void>;
		oncancel?: () => void;
		submitLabel?: string;
	};

	let { container, onsave, oncancel, submitLabel = 'Save container' }: Props = $props();

	// Prefilled once: another container mounts a new form.
	const start = untrack(() => container);
	let name = $state(start?.name ?? '');
	let tare = $state(start ? String(start.tareG) : '');
	let touched = $state({ name: false, tareG: false });
	let submitted = $state(false);
	let busy = $state(false);
	let failure = $state(false);

	const result = $derived(
		v.safeParse(ContainerInput, {
			...(start ? { id: start.id } : {}),
			name,
			tareG: tare
		})
	);
	const errors = $derived.by(() => {
		const found: { name?: string; tareG?: string } = {};
		for (const issue of result.issues ?? []) {
			const key = issue.path?.[0]?.key;
			if (key === 'name' || key === 'tareG') found[key] ??= issue.message;
		}
		return found;
	});
	const shown = (field: 'name' | 'tareG') =>
		touched[field] || submitted ? errors[field] : undefined;

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		submitted = true;
		if (!result.success || busy) return;
		busy = true;
		failure = false;
		try {
			await onsave(result.output);
		} catch {
			failure = true;
		} finally {
			busy = false;
		}
	}
</script>

<form class="flex flex-col gap-3" onsubmit={submit} novalidate>
	<Input
		label="Name"
		bind:value={name}
		autocomplete="off"
		error={shown('name')}
		onblur={() => (touched.name = true)}
	/>
	<Input
		label="Weight of the empty container"
		bind:value={tare}
		inputmode="decimal"
		autocomplete="off"
		suffix="g"
		error={shown('tareG')}
		onblur={() => (touched.tareG = true)}
	/>
	{#if failure}
		<p role="alert" class="text-sm text-danger">Could not save. Try again.</p>
	{/if}
	<div class="flex gap-2">
		{#if oncancel}
			<Button variant="secondary" disabled={busy} onclick={oncancel}>Cancel</Button>
		{/if}
		<Button type="submit" loading={busy}>{failure ? 'Retry' : submitLabel}</Button>
	</div>
</form>
