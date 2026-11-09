import * as v from 'valibot';

/** A JPEG data URI from the client resize, at most about 1.5 MB of image (2,000,000 base64 chars). */
export const ReadLabelInput = v.pipe(
	v.string(),
	v.maxLength(2_000_000),
	v.startsWith('data:image/jpeg;base64,')
);

/** Values read from a per 100 g (or 100 ml) column. Null: not printed or out of range. */
export type LabelValues = {
	nutritionBasis: 'g' | 'ml';
	kcal: number;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
	fiber: number | null;
	servingG: number | null;
};

export type ReadLabelResult =
	| { ok: true; values: LabelValues }
	| { ok: false; reason: 'unreadable' | 'rate_limited' | 'unavailable' };
