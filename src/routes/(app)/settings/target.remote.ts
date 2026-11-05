import { command } from '$app/server';
import { ManualTargetInput } from '#lib/schemas/settings.ts';
import { appContext } from '#lib/server/context.ts';
import { saveManualTarget } from '#lib/server/settings/repo.ts';

/**
 * Saves the temporary daily target, or clears it (kcal and weight both null). Today's hero reads it from the page
 * `load`, so callers `await invalidateAll()` after this resolves.
 */
export const saveTarget = command(ManualTargetInput, async (input) => {
	const { db } = await appContext();
	await saveManualTarget(
		db,
		input.kcal === null ? null : { kcal: input.kcal, weightKg: input.weightKg }
	);
});
