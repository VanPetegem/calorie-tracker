import * as v from 'valibot';

export const JPEG_DATA_URI_PREFIX = 'data:image/jpeg;base64,';

/** Longest label photo data URI accepted: about 1.5 MB of image. */
export const LABEL_PHOTO_MAX_CHARS = 2_000_000;

/** A JPEG data URI from the client resize. */
export const ReadLabelInput = v.pipe(
	v.string(),
	v.maxLength(LABEL_PHOTO_MAX_CHARS),
	v.startsWith(JPEG_DATA_URI_PREFIX)
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
