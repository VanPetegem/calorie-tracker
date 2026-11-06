/** Nutrition values per 100 g or ml. Fiber is null when the source has no value. */
export type Per100 = {
	kcal: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number | null;
};

/** Totals for an amount of food, stored on log entries. */
export type Nutrients = Per100;

export type Unit = 'g' | 'ml' | 'serving' | 'portion';

/** Rounds to one decimal, the precision of every stored nutrition value. */
export function round1(value: number): number {
	return Math.round(value * 10) / 10;
}

/**
 * Converts a logged amount to grams. `unitG` is the weight of one serving or one portion, which the unit needs. Grams
 * and millilitres are taken as they are.
 */
export function toGrams(amount: number, unit: Unit, unitG: number | null): number {
	if (unit === 'g' || unit === 'ml') return amount;
	if (unitG === null) throw new RangeError(`A ${unit} needs a weight`);
	if (unit === 'serving' || unit === 'portion') return amount * unitG;
	throw new RangeError(`Unit ${unit} is not supported`);
}

/** Nutrition for an amount of food, rounded to one decimal. */
export function snapshotFor(per100: Per100, grams: number): Nutrients {
	const scale = (value: number) => round1((value * grams) / 100);
	return {
		kcal: scale(per100.kcal),
		protein: scale(per100.protein),
		carbs: scale(per100.carbs),
		fat: scale(per100.fat),
		fiber: per100.fiber === null ? null : scale(per100.fiber)
	};
}

/** Rescales a snapshot from its old grams to new grams, as when a logged amount is edited. */
export function scaleSnapshot(s: Nutrients, oldGrams: number, newGrams: number): Nutrients {
	if (oldGrams <= 0) throw new RangeError('The old amount must be greater than zero');
	const factor = newGrams / oldGrams;
	const scale = (value: number) => round1(value * factor);
	return {
		kcal: scale(s.kcal),
		protein: scale(s.protein),
		carbs: scale(s.carbs),
		fat: scale(s.fat),
		fiber: s.fiber === null ? null : scale(s.fiber)
	};
}

/** The values per 100 g that a stored snapshot of `grams` implies, for previewing an edit of a logged entry. */
export function per100FromSnapshot(s: Nutrients, grams: number): Per100 {
	if (grams <= 0) throw new RangeError('The weight must be greater than zero');
	const factor = 100 / grams;
	return {
		kcal: s.kcal * factor,
		protein: s.protein * factor,
		carbs: s.carbs * factor,
		fat: s.fat * factor,
		fiber: s.fiber === null ? null : s.fiber * factor
	};
}

/** Converts a label's per serving values to per 100 g. */
export function perServingToPer100(perServing: Per100, servingG: number): Per100 {
	if (servingG <= 0) throw new RangeError('The serving weight must be greater than zero');
	const factor = 100 / servingG;
	return {
		kcal: perServing.kcal * factor,
		protein: perServing.protein * factor,
		carbs: perServing.carbs * factor,
		fat: perServing.fat * factor,
		fiber: perServing.fiber === null ? null : perServing.fiber * factor
	};
}

/** Adds up snapshots. Null fiber counts as zero, so the total fiber is always a number. */
export function sumNutrients(list: Nutrients[]): Nutrients {
	const total = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
	for (const n of list) {
		total.kcal += n.kcal;
		total.protein += n.protein;
		total.carbs += n.carbs;
		total.fat += n.fat;
		total.fiber += n.fiber ?? 0;
	}
	return {
		kcal: round1(total.kcal),
		protein: round1(total.protein),
		carbs: round1(total.carbs),
		fat: round1(total.fat),
		fiber: round1(total.fiber)
	};
}
