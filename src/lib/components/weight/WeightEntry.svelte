<script lang="ts">
	import { untrack } from 'svelte';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import * as v from 'valibot';
	import { MAX_WEIGHT_KG, MIN_WEIGHT_KG, WEIGHT_STEP_KG } from '#lib/domain/constants.ts';
	import { WeightInput } from '#lib/schemas/weight.ts';
	import { Badge, Button, Card, IconButton, NumberInput } from '#lib/components/ui/index.ts';
	import { formatDay } from './chart.ts';

	/**
	 * Today's weigh-in: a number field with a step button for each direction, and Save. The field starts at today's
	 * weigh-in, else the latest one, else empty (the buttons stay off until there is a number to step from). The
	 * weight is checked against `WeightInput`, the schema the server uses, once the field has been committed (when it
	 * loses focus, or on Save), and all of it on Save. `onsave` does the write, and the toast and the refresh: the
	 * component only shows the saving state and, when the write fails, keeps the value and offers Retry. "Logged
	 * today" shows while `todayKg` is set.
	 */
	type Props = {
		/** Today in the settings timezone, `YYYY-MM-DD`. */
		today: string;
		todayKg: number | null;
		lastKg: number | null;
		onsave: (kg: number) => Promise<void>;
	};

	let { today, todayKg, lastKg, onsave }: Props = $props();

	// Prefilled once. Saving updates `todayKg`, which must not move what is in the field.
	let kg = $state<number | null>(untrack(() => todayKg ?? lastKg));
	let submitted = $state(false);
	let busy = $state(false);
	let failure = $state(false);
	let form = $state<HTMLFormElement>();

	// Steps are whole tenths, so 70.2 + 0.1 is 70.3 and not 70.30000000000001.
	const STEPS_PER_KG = Math.round(1 / WEIGHT_STEP_KG);

	const result = $derived(v.safeParse(WeightInput, { date: today, kg }));
	const kgError = $derived(result.issues?.find((issue) => issue.path?.[0]?.key === 'kg')?.message);
	// `kg` only changes when the field commits (blur, Enter, arrow keys), so a number outside the limits shows its
	// error at once, as it does after the field loses focus. An empty field is an error only after Save.
	const shownError = $derived(kg !== null || submitted ? kgError : undefined);

	/** Commits what is typed. The number field commits on blur, and iOS keeps focus in it when a button is tapped. */
	function commitField() {
		const active = document.activeElement;
		if (active instanceof HTMLInputElement && form?.contains(active)) active.blur();
	}

	function step(direction: 1 | -1) {
		commitField();
		if (kg === null) return;
		const next = (Math.round(kg * STEPS_PER_KG) + direction) / STEPS_PER_KG;
		kg = Math.min(MAX_WEIGHT_KG, Math.max(MIN_WEIGHT_KG, next));
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		commitField();
		submitted = true;
		if (!result.success) return;
		busy = true;
		failure = false;
		try {
			await onsave(result.output.kg);
		} catch {
			failure = true;
		} finally {
			busy = false;
		}
	}
</script>

<Card>
	<form class="flex flex-col gap-4" onsubmit={submit} bind:this={form} novalidate>
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 class="text-lg font-semibold text-text">
				Today <time datetime={today} class="font-normal text-text-muted">{formatDay(today)}</time>
			</h2>
			{#if todayKg !== null}
				<Badge tone="success">Logged today</Badge>
			{/if}
		</div>
		<NumberInput
			label="Weight"
			unit="kg"
			bind:value={kg}
			step={WEIGHT_STEP_KG}
			error={shownError}
			hint={kg === null ? `Enter a weight, then adjust it by ${WEIGHT_STEP_KG} kg.` : undefined}
		/>
		<div class="flex items-center gap-2">
			<IconButton
				label="Decrease weight by {WEIGHT_STEP_KG} kg"
				icon={Minus}
				variant="secondary"
				disabled={kg === null || kg <= MIN_WEIGHT_KG}
				onclick={() => step(-1)}
			/>
			<IconButton
				label="Increase weight by {WEIGHT_STEP_KG} kg"
				icon={Plus}
				variant="secondary"
				disabled={kg === null || kg >= MAX_WEIGHT_KG}
				onclick={() => step(1)}
			/>
			<Button type="submit" loading={busy} class="flex-1">{failure ? 'Retry' : 'Save'}</Button>
		</div>
		{#if failure}
			<p role="alert" class="text-sm text-danger">Could not save. Try again.</p>
		{/if}
	</form>
</Card>
