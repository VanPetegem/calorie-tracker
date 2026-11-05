<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteSet } from 'svelte/reactivity';
	import UtensilsCrossed from '@lucide/svelte/icons/utensils-crossed';
	import { addDays } from '#lib/domain/dates.ts';
	import { sumNutrients } from '#lib/domain/nutrition.ts';
	import type { LogEntry } from '#lib/server/db/schema.ts';
	import type { DayData } from '#lib/server/log/day.ts';
	import { Button, Card, EmptyState, Sheet } from '#lib/components/ui/index.ts';
	import { toasts, withUndo } from '#lib/stores/toasts.svelte.ts';
	import { removeEntry, restoreEntry } from '../../../routes/(app)/log.remote.ts';
	import DateSwitcher from './DateSwitcher.svelte';
	import DayHero from './DayHero.svelte';
	import EditEntrySheet from './EditEntrySheet.svelte';
	import EntryRow from './EntryRow.svelte';
	import { swipeDirection } from './swipe.ts';

	type Props = { data: DayData };

	let { data }: Props = $props();

	// Entries removed on screen before (or without) the page data catching up. Undo takes them out again.
	const hidden = new SvelteSet<string>();
	const entries = $derived(data.entries.filter((entry) => !hidden.has(entry.id)));
	const totals = $derived(
		entries.length === data.entries.length ? data.totals : sumNutrients(entries)
	);

	const isToday = $derived(data.date === data.today);

	function showDay(date: string) {
		void goto(date === data.today ? resolve('/(app)') : resolve('/(app)/day/[date]', { date }));
	}

	// Tap on a row: food entries open the amount step. Task 9 opens the quick add form for quick entries.
	let editEntry = $state<LogEntry | null>(null);
	let editOpen = $state(false);

	function edit(entry: LogEntry) {
		if (entry.kind !== 'food' || entry.foodId === null) return;
		editEntry = entry;
		editOpen = true;
	}

	/** Reloads the page data. A failed refresh is not an error of the write before it: the next load catches up. */
	async function refresh() {
		try {
			await invalidateAll();
		} catch {
			// ignored on purpose
		}
	}

	function labelOf(entry: LogEntry) {
		return entry.label ?? 'Quick add';
	}

	async function remove(entry: LogEntry) {
		if (hidden.has(entry.id)) return;
		hidden.add(entry.id);
		let removed: LogEntry | null;
		try {
			removed = await removeEntry(entry.id);
		} catch {
			hidden.delete(entry.id);
			const id = toasts.show({
				message: `Could not delete ${labelOf(entry)}`,
				tone: 'danger',
				action: {
					label: 'Retry',
					run: () => {
						toasts.dismiss(id);
						return remove(entry);
					}
				}
			});
			return;
		}
		// Already gone on the server (another device): the row is gone here too, nothing to undo.
		if (removed) {
			withUndo({
				message: `Deleted ${labelOf(entry)}`,
				apply: () => {},
				revert: async () => {
					await restoreEntry({ id: entry.id });
					try {
						await refresh();
					} finally {
						// Restored on the server: show the row again whether or not the refresh went through.
						hidden.delete(entry.id);
					}
				}
			});
		}
		await refresh();
	}

	// Row menu: one sheet for the whole list.
	let menuEntry = $state<LogEntry | null>(null);
	let menuOpen = $state(false);

	function openMenu(entry: LogEntry) {
		menuEntry = entry;
		menuOpen = true;
	}

	function deleteFromMenu() {
		const entry = menuEntry;
		menuOpen = false;
		if (entry) void remove(entry);
	}

	// Day swipe. A left swipe that starts on a row belongs to the row (it deletes).
	let swipeStart: { x: number; y: number; onRow: boolean } | null = null;

	function swipeDown(event: PointerEvent) {
		if (event.pointerType === 'mouse') return;
		const onRow = event.target instanceof Element && event.target.closest('[data-swipe-row]');
		swipeStart = { x: event.clientX, y: event.clientY, onRow: Boolean(onRow) };
	}

	function swipeUp(event: PointerEvent) {
		const start = swipeStart;
		swipeStart = null;
		if (!start) return;
		const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y);
		if (direction === 'right') showDay(addDays(data.date, -1));
		else if (direction === 'left' && !start.onRow && data.date < addDays(data.today, 1))
			showDay(addDays(data.date, 1));
	}
</script>

<svelte:head>
	<title>{isToday ? 'Today' : data.date} · kcal</title>
</svelte:head>

<div
	class="flex touch-pan-y flex-col gap-6"
	onpointerdown={swipeDown}
	onpointerup={swipeUp}
	onpointercancel={() => (swipeStart = null)}
	role="presentation"
>
	<DateSwitcher date={data.date} today={data.today} onselect={showDay} />
	<DayHero {totals} target={data.target} />

	{#if entries.length > 0}
		<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
			{#each entries as entry (entry.id)}
				<EntryRow {entry} onedit={edit} ondelete={remove} onmenu={openMenu} />
			{/each}
		</ul>
	{:else}
		<Card>
			<EmptyState
				icon={UtensilsCrossed}
				title="Nothing logged yet"
				body={isToday
					? 'Food you log today shows up here with your calories and macros.'
					: 'Nothing was logged on this day.'}
			/>
		</Card>
	{/if}
</div>

<EditEntrySheet entry={editEntry} bind:open={editOpen} />

<Sheet
	bind:open={menuOpen}
	title={menuEntry ? labelOf(menuEntry) : 'Entry'}
	description={menuEntry ? `${Math.round(menuEntry.kcal)} kcal` : undefined}
>
	<p class="text-base text-text-muted">
		Deleting removes it from this day. You can undo it for a few seconds.
	</p>
	{#snippet footer()}
		<Button variant="secondary" onclick={() => (menuOpen = false)}>Cancel</Button>
		<Button variant="destructive" onclick={deleteFromMenu}>Delete</Button>
	{/snippet}
</Sheet>
