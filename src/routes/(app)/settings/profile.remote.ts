import { command } from '$app/server';
import { ProfileInput } from '#lib/schemas/settings.ts';
import { appContext } from '#lib/server/context.ts';
import { saveProfileOn } from '#lib/server/targets/commands.ts';

/** Settings profile: saves the profile and recomputes this week's target. Returns the new row. */
export const saveProfile = command(ProfileInput, async (input) => {
	const ctx = await appContext();
	return saveProfileOn(ctx, input);
});
