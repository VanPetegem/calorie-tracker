import { command } from '$app/server';
import { id } from '#lib/schemas/fields.ts';
import {
	EditAmountInput,
	EditQuickInput,
	LogBatchInput,
	LogFoodInput,
	QuickInput,
	RestoreEntryInput
} from '#lib/schemas/log.ts';
import { appContext } from '#lib/server/context.ts';
import * as log from '#lib/server/log/repo.ts';

/*
 * Log writes. Each command validates its input with the shared schema; a date must be no later than tomorrow in
 * the settings timezone. The day's entries, totals and recents come from the page `load`, which a command cannot
 * refresh from the server (single-flight refreshes cover `query` only), so callers `await invalidateAll()` (or
 * the page's `depends` key) after a command resolves.
 */

export const logFood = command(LogFoodInput, async (input) => {
	const ctx = await appContext();
	return log.addFoodEntry(ctx.db, input, ctx);
});

/** Logs portions or grams of a batch, finished or not; the server snapshots the nutrition from the batch. */
export const logBatch = command(LogBatchInput, async (input) => {
	const ctx = await appContext();
	return log.addBatchEntry(ctx.db, input, ctx);
});

export const logQuick = command(QuickInput, async (input) => {
	const ctx = await appContext();
	return log.addQuickEntry(ctx.db, input, ctx);
});

export const editAmount = command(EditAmountInput, async (input) => {
	const { db } = await appContext();
	return log.updateEntryAmount(db, input);
});

export const editQuick = command(EditQuickInput, async ({ id, ...input }) => {
	const { db } = await appContext();
	return log.updateQuickEntry(db, id, input);
});

/** Deletes an entry (softly) and returns it for display, or null when it was already gone. */
export const removeEntry = command(id, async (entryId) => {
	const { db } = await appContext();
	return log.deleteEntry(db, entryId);
});

/** Undo: brings back the entry `removeEntry` deleted, by id. Restoring twice, or an unknown id, does nothing. */
export const restoreEntry = command(RestoreEntryInput, async ({ id }) => {
	const { db } = await appContext();
	await log.restoreEntry(db, id);
});
