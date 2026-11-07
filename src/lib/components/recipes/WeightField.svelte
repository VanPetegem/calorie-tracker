<script lang="ts">
	import { untrack } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import * as v from 'valibot';
	import { MAX_COOKED_WEIGHT_G } from '#lib/domain/constants.ts';
	import { netWeight } from '#lib/domain/batch.ts';
	import { positiveUpTo } from '#lib/schemas/fields.ts';
	import type { ContainerInput } from '#lib/schemas/batch.ts';
	import type { Container } from '#lib/server/db/schema.ts';
	import { parseDecimal } from '#lib/utils/decimal.ts';
	import { Button, Card, Input } from '#lib/components/ui/index.ts';
	import ContainerForm from './ContainerForm.svelte';

	/**
	 * The cooked weight of a batch. `value` is the net weight (bindable), `null` while the field is empty or wrong.
	 *
	 * With no container the typed number is the net weight. With a container the person types the weight on the scale
	 * and sees the net after the container's tare; the batch stores the net. A stored net weight is not a scale
	 * weight: choosing a container while the field still holds it empties the field and keeps `value` until the
	 * scale weight is typed (a number the person typed is read as the scale weight). "New container" shows the container form
	 * inline; `oncreatecontainer` saves it and the new container is selected. `error` (bindable) is the reason the
	 * field holds no usable weight, so the form can keep Save off; it is shown under the field after the field loses
	 * focus.
	 */
	type Props = {
		value: number | null;
		error?: string | undefined;
		containers: Container[];
		oncreatecontainer: (input: ContainerInput) => Promise<Container>;
	};

	let { value = $bindable(), error = $bindable(), containers, oncreatecontainer }: Props = $props();

	const limit = positiveUpTo(MAX_COOKED_WEIGHT_G);

	// Starts from the stored net weight, without a container (the batch does not remember which one was used).
	let text = $state(untrack(() => (value === null ? '' : String(value))));
	let containerId = $state('');
	let touched = $state(false);
	// False while the field holds the stored net weight (or nothing); true once the person typed a number.
	let typed = $state(false);
	let creating = $state(false);

	const container = $derived(containers.find((c) => c.id === containerId));

	const hint = $derived(
		!container
			? 'Weigh the finished dish. Leave it empty to log by portion only.'
			: !typed && value !== null
				? `The net weight stays ${value} g until you enter the weight on the scale.`
				: undefined
	);

	/** The net weight, or why there is none. An empty field is no weight and no problem. */
	const reading = $derived.by((): { net: number | null; problem?: string } => {
		if (text.trim() === '') return { net: null };
		const typed = parseDecimal(text);
		if (typed === null) return { net: null, problem: 'Enter a number' };
		let net = typed;
		if (container) {
			try {
				net = netWeight(typed, container.tareG);
			} catch {
				return { net: null, problem: `More than the container, ${container.tareG} g` };
			}
		}
		const checked = v.safeParse(limit, net);
		return checked.success ? { net } : { net: null, problem: checked.issues[0].message };
	});

	// Reported to the parent whenever the person changes something, not from an effect.
	function report() {
		value = reading.net;
		error = reading.problem;
	}

	/**
	 * The container changed. A stored net weight is not a scale weight, so with a container the field is emptied and
	 * `value` stays as it is; with no container the stored weight is back in the field. A typed number is re-read.
	 */
	function containerChanged() {
		if (typed) {
			report();
			return;
		}
		text = container || value === null ? '' : String(value);
	}

	async function create(input: ContainerInput) {
		const created = await oncreatecontainer(input);
		containerId = created.id;
		creating = false;
		containerChanged();
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex flex-col gap-1.5">
		<label for="weight-container" class="text-sm font-medium text-text">Container</label>
		<select
			id="weight-container"
			bind:value={containerId}
			onchange={containerChanged}
			class="min-h-11 rounded-md border border-border-strong bg-surface px-3 py-2 text-lg text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
		>
			<option value="">None</option>
			{#each containers as option (option.id)}
				<option value={option.id}>{option.name}, {option.tareG} g</option>
			{/each}
		</select>
	</div>

	<Input
		label={container ? 'Weight on the scale' : 'Cooked weight'}
		bind:value={
			() => text,
			(next) => {
				text = next;
				typed = true;
				report();
			}
		}
		inputmode="decimal"
		autocomplete="off"
		suffix="g"
		{hint}
		error={touched ? reading.problem : undefined}
		onblur={() => (touched = true)}
	/>

	{#if container && reading.net !== null}
		<p role="status" class="text-base font-medium text-text tabular-nums">
			Net weight {reading.net} g
		</p>
	{/if}

	{#if creating}
		<Card>
			<ContainerForm onsave={create} oncancel={() => (creating = false)} />
		</Card>
	{:else}
		<div>
			<Button variant="secondary" icon={Plus} onclick={() => (creating = true)}>
				New container
			</Button>
		</div>
	{/if}
</div>
