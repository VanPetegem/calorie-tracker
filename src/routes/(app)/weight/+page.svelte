<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Scale from '@lucide/svelte/icons/scale';
	import { SvelteSet } from 'svelte/reactivity';
	import { invalidateAll } from '$app/navigation';
	import { Button, Card, EmptyState } from '#lib/components/ui/index.ts';
	import EditWeightSheet from '#lib/components/weight/EditWeightSheet.svelte';
	import WeightChart from '#lib/components/weight/WeightChart.svelte';
	import WeightEntry from '#lib/components/weight/WeightEntry.svelte';
	import WeightRow from '#lib/components/weight/WeightRow.svelte';
	import WeightSummary from '#lib/components/weight/WeightSummary.svelte';
	import { formatDay, formatKg } from '#lib/components/weight/chart.ts';
	import { WEIGHT_HISTORY_PAGE } from '#lib/domain/constants.ts';
	import type { TrendPoint } from '#lib/domain/trend.ts';
	import type { WeightInput } from '#lib/schemas/weight.ts';
	import { toasts, withUndo } from '#lib/stores/toasts.svelte.ts';
	import { deleteWeight, logWeightToday, restoreWeight, saveWeight } from './weight.remote.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const history = $derived([...data.series].reverse());
	// How many of the newest weigh-ins the history lists. "Show more" adds a page; a write keeps the count.
	let listed = $state(WEIGHT_HISTORY_PAGE);
	const shownHistory = $derived(history.slice(0, listed));

	function showMore() {
		listed += WEIGHT_HISTORY_PAGE;
	}

	// The sheet is shared: a row edits its weigh-in, "Add weigh-in" opens it with no point.
	let sheetOpen = $state(false);
	let sheetPoint = $state<TrendPoint | null>(null);

	async function refresh() {
		// The write went through: a failed refresh only means the page catches up on its next load.
		try {
			await invalidateAll();
		} catch {
			// ignored on purpose
		}
	}

	/** Toasts a write that went through, then refreshes. */
	async function saved(existed: boolean, kg: number) {
		toasts.show({
			message: `${existed ? 'Updated' : 'Logged'} ${formatKg(kg)} kg`,
			tone: 'success'
		});
		await refresh();
	}

	/** Saves the sheet's weigh-in for its date. A rejected write reaches the sheet, which keeps the value and offers Retry. */
	async function save({ date, kg }: WeightInput) {
		const { existed } = await saveWeight({ date, kg });
		await saved(existed, kg);
	}

	/**
	 * Saves the entry card's weight on the server's today, not on `data.today`, which is fixed at load: a page left
	 * open past midnight, or a Retry after an offline resume, must not overwrite yesterday's weigh-in. The server
	 * says whether that day had one, for the same reason.
	 */
	async function logToday(kg: number) {
		const { existed } = await logWeightToday({ kg });
		await saved(existed, kg);
	}

	function edit(point: TrendPoint) {
		sheetPoint = point;
		sheetOpen = true;
	}

	function add() {
		sheetPoint = null;
		sheetOpen = true;
	}

	// A delete in flight is not started twice (a double tap).
	const deleting = new SvelteSet<string>();

	async function remove(point: TrendPoint) {
		if (deleting.has(point.date)) return;
		deleting.add(point.date);
		const day = formatDay(point.date, { year: true });
		let removed: boolean;
		try {
			({ removed } = await deleteWeight({ date: point.date }));
		} catch {
			const id = toasts.show({
				message: 'Could not delete the weigh-in',
				tone: 'danger',
				action: {
					label: 'Retry',
					run: () => {
						toasts.dismiss(id);
						return remove(point);
					}
				}
			});
			return;
		} finally {
			deleting.delete(point.date);
		}
		// Already gone (deleted elsewhere): nothing to undo, the refresh shows it.
		if (removed) {
			// Undo only fills the day back in: a weigh-in entered for it meanwhile is kept.
			withUndo({
				message: `Deleted weigh-in of ${day}`,
				apply: () => {},
				revert: async () => {
					await restoreWeight({ date: point.date, kg: point.kg });
					await refresh();
				}
			});
		}
		await refresh();
	}
</script>

<svelte:head>
	<title>Weight · kcal</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<h1 class="text-3xl font-semibold tracking-tight text-text">Weight</h1>

	<WeightEntry today={data.today} todayKg={data.todayKg} lastKg={data.lastKg} onsave={logToday} />

	{#if data.series.length === 0}
		<Card>
			<EmptyState
				icon={Scale}
				title="No weigh-ins yet"
				body="Log your morning weight to see your trend and weekly gain."
			/>
		</Card>
	{:else}
		<WeightSummary trendKg={data.trendKg} rate={data.rate} />
		<WeightChart series={data.series} today={data.today} />
	{/if}

	<section class="flex flex-col gap-3" aria-labelledby="history-heading">
		<div class="flex items-center justify-between gap-3">
			<h2 id="history-heading" class="text-lg font-semibold text-text">History</h2>
			<Button variant="secondary" icon={Plus} class="shrink-0" onclick={add}>Add weigh-in</Button>
		</div>
		{#if history.length > 0}
			<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
				{#each shownHistory as point (point.date)}
					<li>
						<WeightRow {point} onedit={edit} ondelete={remove} />
					</li>
				{/each}
			</ul>
			{#if history.length > listed}
				<Button variant="secondary" onclick={showMore}>Show more</Button>
			{/if}
		{/if}
	</section>
</div>

<EditWeightSheet
	bind:open={sheetOpen}
	point={sheetPoint}
	today={data.today}
	kgOn={(date) => data.series.find((point) => point.date === date)?.kg ?? null}
	onsave={save}
/>
