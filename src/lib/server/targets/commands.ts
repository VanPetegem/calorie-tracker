import { error } from '@sveltejs/kit';
import { MAX_AGE_YEARS, MIN_AGE_YEARS } from '../../domain/constants.ts';
import { ageOn } from '../../domain/tdee.ts';
import type { OnboardingInput, ProfileInput } from '../../schemas/settings.ts';
import type { Db } from '../db/index.ts';
import type { WeeklyTarget } from '../db/schema.ts';
import { isProfileComplete } from '../settings/repo.ts';
import { loadWeight } from '../weights/commands.ts';
import {
	NoWeighInError,
	recomputeCurrentWeek,
	saveOnboarding,
	type TargetContext
} from './repo.ts';

/**
 * Throws 400 unless the age on `today` (the day in the settings timezone, passed in) is MIN_AGE_YEARS to
 * MAX_AGE_YEARS. The schema checks against the clock, which can be a day off the settings timezone near a birthday.
 */
export function assertAgeOn(birthDate: string, today: string): void {
	const age = ageOn(birthDate, today);
	if (age < MIN_AGE_YEARS || age > MAX_AGE_YEARS) {
		error(400, `Age must be ${MIN_AGE_YEARS} to ${MAX_AGE_YEARS}`);
	}
}

/**
 * Onboarding: refuses once the profile is complete, so a replayed submit cannot overwrite the profile, goal or
 * weigh-in. Otherwise checks the age, then saves the profile, today's weigh-in and this week's target in one batch.
 */
export async function completeOnboardingOn(
	ctx: TargetContext,
	input: OnboardingInput
): Promise<WeeklyTarget> {
	if (isProfileComplete(ctx.settings)) error(400, 'The profile is already set up');
	assertAgeOn(input.birthDate, ctx.today);
	return saveOnboarding(ctx, input);
}

/**
 * Settings profile: checks the age, then saves the profile and recomputes this week's target. Without any weigh-in
 * there is no target to compute, which is a 400 the person can act on, not a server error.
 */
export async function saveProfileOn(
	ctx: TargetContext,
	input: ProfileInput
): Promise<WeeklyTarget> {
	assertAgeOn(input.birthDate, ctx.today);
	try {
		return await recomputeCurrentWeek(ctx, input);
	} catch (cause) {
		if (cause instanceof NoWeighInError) error(400, 'Log a weigh-in first');
		throw cause;
	}
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
