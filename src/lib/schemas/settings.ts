import * as v from 'valibot';
import {
	ACTIVITY_LEVELS,
	GOAL_RATES,
	MAX_ENERGY_DENSITY,
	MAX_FAT_PCT,
	MAX_HEIGHT_CM,
	MAX_PROTEIN_G_PER_KG,
	MIN_ENERGY_DENSITY,
	MIN_FAT_PCT,
	MIN_HEIGHT_CM,
	MIN_PROTEIN_G_PER_KG,
	SEXES
} from '../domain/constants.ts';
import { decimalIn, decimalOneOf, isoDate } from './fields.ts';
import { WeightInput } from './weight.ts';

/** The goal rate in percent of trend weight per week: one of the presets. */
const goalRatePct = decimalOneOf(GOAL_RATES, 'Choose a goal rate');

/**
 * The profile behind the formula TDEE, as onboarding and Settings edit it. The birth date is only checked for format:
 * the age limit needs the server's day, so `saveOnboarding` and `recomputeCurrentWeek` check it with `ageInRange`.
 */
export const ProfileInput = v.strictObject({
	sex: v.picklist(SEXES, 'Choose one'),
	birthDate: isoDate,
	heightCm: decimalIn(MIN_HEIGHT_CM, MAX_HEIGHT_CM),
	activityLevel: v.picklist(ACTIVITY_LEVELS, 'Choose an activity level')
});

export type ProfileInput = v.InferOutput<typeof ProfileInput>;

/** The refusal onboarding gives once the profile is complete; the page then goes to Today instead of showing it. */
export const PROFILE_ALREADY_SET_UP = 'The profile is already set up';

/** Onboarding: the profile, today's weight and the goal rate. The weigh-in is for the server's today. */
export const OnboardingInput = v.strictObject({
	...ProfileInput.entries,
	kg: WeightInput.entries.kg,
	goalRatePct
});

export type OnboardingInput = v.InferOutput<typeof OnboardingInput>;

export const GoalInput = v.strictObject({ goalRatePct });

export type GoalInput = v.InferOutput<typeof GoalInput>;

/** The macro rules and, under Advanced, the energy density of gained weight. Fat is a share of kcal. */
export const MacroRulesInput = v.strictObject({
	proteinGPerKg: decimalIn(MIN_PROTEIN_G_PER_KG, MAX_PROTEIN_G_PER_KG),
	fatPct: decimalIn(MIN_FAT_PCT, MAX_FAT_PCT),
	energyDensity: decimalIn(MIN_ENERGY_DENSITY, MAX_ENERGY_DENSITY)
});

export type MacroRulesInput = v.InferOutput<typeof MacroRulesInput>;
