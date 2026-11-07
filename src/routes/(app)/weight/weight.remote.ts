import { command } from '$app/server';
import { DeleteWeightInput, TodayWeightInput, WeightInput } from '#lib/schemas/weight.ts';
import { appContext } from '#lib/server/context.ts';
import { deleteWeightOn, logWeightTodayOn, saveWeightOn } from '#lib/server/weights/commands.ts';

/*
 * Weight writes. Each command validates its input with the shared schema; the date must be no later than tomorrow in
 * the settings timezone (the schema cannot know it). The page reads through `load`, so callers
 * `await invalidateAll()` after a command resolves.
 */

/** Saves the weigh-in of a date; a date that has one gets the new weight. Undo of a delete calls it too. */
export const saveWeight = command(WeightInput, async (input) => {
	const ctx = await appContext();
	await saveWeightOn(ctx, input);
});

/** Saves the entry card's weight on the server's today, so a stale page cannot overwrite another day. */
export const logWeightToday = command(TodayWeightInput, async (input) => {
	const ctx = await appContext();
	await logWeightTodayOn(ctx, input);
});

/** Deletes the weigh-in of a date. */
export const deleteWeight = command(DeleteWeightInput, async (input) => {
	const ctx = await appContext();
	await deleteWeightOn(ctx, input);
});
