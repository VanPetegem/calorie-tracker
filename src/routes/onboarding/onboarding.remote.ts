import { command } from '$app/server';
import { OnboardingInput } from '#lib/schemas/settings.ts';
import { appContext } from '#lib/server/context.ts';
import { completeOnboardingOn } from '#lib/server/targets/commands.ts';

/*
 * Onboarding's one write: the profile, today's weigh-in and the goal rate, saved in one batch with this week's target,
 * which comes back for the result screen. The page does not `invalidateAll` after it: its own load redirects to Today
 * once the profile is complete, which would skip the result. "Start" navigates instead.
 */

export const completeOnboarding = command(OnboardingInput, async (input) => {
	const ctx = await appContext();
	return completeOnboardingOn(ctx, input);
});
