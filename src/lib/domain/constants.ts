/** Validation limits for food and log input. Inclusive on both ends. */
export const MIN_KCAL_PER_100 = 0;
export const MAX_KCAL_PER_100 = 900;
export const MIN_MACRO_PER_100 = 0;
export const MAX_MACRO_PER_100 = 100;
export const MAX_AMOUNT_GRAMS_OR_ML = 5000;
export const MAX_AMOUNT_SERVINGS = 50;
export const MIN_QUICK_KCAL = 0;
export const MAX_QUICK_KCAL = 10000;
export const MAX_QUICK_MACRO_G = 1000;

/** Bounds for the temporary manual target (phase 2). */
export const MAX_MANUAL_TARGET_KCAL = 10000;
export const MAX_WEIGHT_KG = 400;

/** Default macro rules behind the daily targets. */
export const MACRO_RULE_DEFAULTS = { proteinGPerKg: 1.8, fatPct: 0.25, fatMinGPerKg: 0.6 } as const;

/** A cached Open Food Facts entry older than this is refreshed on next use. */
export const OFF_REFRESH_AGE_DAYS = 180;

/** Length of the recents and frequents lists on the log screen. */
export const RECENTS_SIZE = 10;
export const FREQUENTS_SIZE = 10;

/** Frequents count logs from this many past days. */
export const FREQUENTS_WINDOW_DAYS = 30;

/** Recipe and batch limits (phase 3). Maximums are inclusive. */
export const MAX_PORTIONS = 100;
export const MAX_COOKED_WEIGHT_G = 20000;
export const MAX_TARE_G = 10000;
export const MAX_INGREDIENTS = 50;
export const MAX_NOTES = 2000;

/** A batch with no activity for this many days finishes automatically. */
export const BATCH_AUTO_FINISH_DAYS = 7;
