import { error } from '@sveltejs/kit';
import { MAX_AGE_YEARS, MIN_AGE_YEARS } from '../../domain/constants.ts';
import type {
	GoalInput,
	MacroRulesInput,
	OnboardingInput,
	ProfileInput
} from '../../schemas/settings.ts';
import type { Db } from '../db/index.ts';
import type { WeeklyTarget } from '../db/schema.ts';
import { isProfileComplete } from '../settings/repo.ts';
import { loadWeight } from '../weights/commands.ts';
import {
	AgeOutOfRangeError,
	NoWeighInError,
	recomputeCurrentWeek,
	saveOnboarding,
	type TargetContext
} from './repo.ts';

/**
 * Runs a target write and maps the repository's refusals to 400s the person can act on, not 500s: no weigh-in to
 * compute from, or an age out of range on the settings timezone's day (the repository is the single age check).
 */
async function mapRefusals<T>(write: () => Promise<T>): Promise<T> {
	try {
		return await write();
	} catch (cause) {
		if (cause instanceof NoWeighInError) error(400, 'Log a weigh-in first');
		if (cause instanceof AgeOutOfRangeError) {
			error(400, `Age must be ${MIN_AGE_YEARS} to ${MAX_AGE_YEARS}`);
		}
		throw cause;
	}
}

/**
 * A settings write (goal rate or macro rules) that recomputes this week's row. Without any weigh-in the row cannot be
 * made, so nothing is written and the answer is a 400 that says what to do, not a 500.
 */
export function recomputeWeekOn(
	ctx: TargetContext,
	patch: GoalInput | MacroRulesInput
): Promise<WeeklyTarget> {
	return mapRefusals(() => recomputeCurrentWeek(ctx, patch));
}

/**
 * Onboarding: refuses once the profile is complete, so a replayed submit cannot overwrite the profile, goal or
 * weigh-in. Otherwise saves the profile, today's weigh-in and this week's target in one batch.
 */
export async function completeOnboardingOn(
	ctx: TargetContext,
	input: OnboardingInput
): Promise<WeeklyTarget> {
	if (isProfileComplete(ctx.settings)) error(400, 'The profile is already set up');
	return mapRefusals(() => saveOnboarding(ctx, input));
}

/**
 * Settings profile: saves the profile and recomputes this week's target. Without any weigh-in there is no target to
 * compute, which is a 400 the person can act on, not a server error.
 */
export function saveProfileOn(ctx: TargetContext, input: ProfileInput): Promise<WeeklyTarget> {
	return mapRefusals(() => recomputeCurrentWeek(ctx, input));
}

/**
 * The onboarding page's data: today, and the weight it starts from, the latest weigh-in up to today. A weigh-in
 * dated after today is never the prefill.
 */
export async function loadOnboarding(ctx: {
	db: Db;
	today: string;
}): Promise<{ today: string; kg: number | null }> {
	const { lastKg } = await loadWeight(ctx);
	return { today: ctx.today, kg: lastKg };
}
