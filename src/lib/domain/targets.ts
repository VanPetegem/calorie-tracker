import { MACRO_RULE_DEFAULTS } from './constants';

export type MacroRules = { proteinGPerKg: number; fatPct: number; fatMinGPerKg: number };

/**
 * Daily macro targets in whole grams. Protein is set per kg of body weight. Fat is the larger of its share
 * of kcal and its per kg minimum. Carbs take the remaining kcal and are floored at zero.
 * Math runs on raw values and rounds only at the end.
 */
export function macroTargets(
	kcal: number,
	weightKg: number,
	rules: MacroRules = MACRO_RULE_DEFAULTS
): { proteinG: number; fatG: number; carbsG: number; carbsFloored: boolean } {
	const proteinG = rules.proteinGPerKg * weightKg;
	// Fat in kcal (9 kcal per gram) avoids float error that would shift carbs across a rounding boundary.
	const fatKcal = Math.max(rules.fatPct * kcal, rules.fatMinGPerKg * weightKg * 9);
	const carbsRaw = (kcal - proteinG * 4 - fatKcal) / 4;
	const carbsFloored = carbsRaw < 0;
	return {
		proteinG: Math.round(proteinG),
		fatG: Math.round(fatKcal / 9),
		carbsG: carbsFloored ? 0 : Math.round(carbsRaw),
		carbsFloored
	};
}
