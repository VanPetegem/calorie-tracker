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

/** Energy per gram of each macro (Atwater factors). */
export const KCAL_PER_G_PROTEIN = 4;
export const KCAL_PER_G_CARBS = 4;
export const KCAL_PER_G_FAT = 9;

/** Default macro rules behind the daily targets (parent spec 6.8); settings change them within the limits below. */
export const MACRO_RULE_DEFAULTS = { proteinGPerKg: 1.8, fatPct: 0.25 } as const;
/** Fat never goes under this many grams per kg of trend weight, whatever its share of kcal. */
export const FAT_MIN_G_PER_KG = 0.6;

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

/** Weight limits and weight trend constants (phase 4a). Weigh-ins are inclusive between these bounds, in kg. */
export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 400;
export const WEIGHT_STEP_KG = 0.1;
/** Smoothing factor of the weight trend for one day between weigh-ins (parent spec 6.3). */
export const TREND_ALPHA = 0.1;
/** The trend starts at the mean of this many first weigh-ins. */
export const TREND_SEED_WEIGH_INS = 3;
/** The weekly rate compares today's trend with the trend this many days earlier. */
export const RATE_WINDOW_DAYS = 14;
export const DAYS_PER_WEEK = 7;
/** Added to getUTCDay so that Monday maps to 0 modulo DAYS_PER_WEEK. */
export const MONDAY_OFFSET = 6;
/** A percent is one hundredth: a rate of 0.35 percent is 0.35 / PERCENT. */
export const PERCENT = 100;

/** Profile limits (phase 4b). Inclusive on both ends. Age applies at onboarding. */
export const MIN_HEIGHT_CM = 100;
export const MAX_HEIGHT_CM = 250;
export const MIN_AGE_YEARS = 16;
export const MAX_AGE_YEARS = 100;

/** Goal rate presets in percent of trend weight per week (parent spec 6.4). */
export const GOAL_RATES = [0.25, 0.35, 0.5] as const;
export const DEFAULT_GOAL_RATE = 0.35;

/** Macro rule limits. Inclusive on both ends. Fat is a share of kcal. */
export const MIN_PROTEIN_G_PER_KG = 1.2;
export const MAX_PROTEIN_G_PER_KG = 3;
export const MIN_FAT_PCT = 0.15;
export const MAX_FAT_PCT = 0.4;

/** Energy density of gained weight in kcal per kg (parent spec 6.5), and its limits. */
export const DEFAULT_ENERGY_DENSITY = 5000;
export const MIN_ENERGY_DENSITY = 3000;
export const MAX_ENERGY_DENSITY = 7700;

/** The profile's choices, in the order forms list them. Settings columns and their checks use these lists. */
export const SEXES = ['male', 'female'] as const;
export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;

/** Mifflin St Jeor BMR (parent spec 6.1): kcal per kg, per cm, per year of age, and the offset by sex. */
export const BMR_KCAL_PER_KG = 10;
export const BMR_KCAL_PER_CM = 6.25;
export const BMR_KCAL_PER_YEAR = 5;
export const BMR_SEX_OFFSET = { male: 5, female: -161 } as const satisfies Record<
	(typeof SEXES)[number],
	number
>;

/** Physical activity level by activity level: formula TDEE = BMR x PAL (parent spec 6.2). */
export const PAL = {
	sedentary: 1.2,
	light: 1.375,
	moderate: 1.55,
	active: 1.725,
	very_active: 1.9
} as const satisfies Record<(typeof ACTIVITY_LEVELS)[number], number>;

/** Adaptive TDEE (parent spec 6.6). The window is the days before the week's Monday. */
export const ADAPTIVE_WINDOW_DAYS = 21;
export const MIN_VALID_DAYS = 14;
export const MIN_WEIGH_INS = 6;
/** A logged day is valid at or above this share of the window's median logged intake. */
export const VALID_INTAKE_FRACTION = 0.5;
/** The formula TDEE counts as this many days of data in the blend. */
export const BLEND_PRIOR_DAYS = 7;
/** Weight of the previous week's TDEE when smoothing; the new estimate gets the rest. */
export const TDEE_SMOOTHING = 0.7;
/** The TDEE used changes by at most this many kcal from one week to the next. */
export const MAX_WEEKLY_TDEE_CHANGE = 150;

/** Target kcal (parent spec 6.7): clamped to these multiples of the TDEE used, rounded to this step. */
export const TARGET_MIN_FACTOR = 1.05;
export const TARGET_MAX_FACTOR = 1.2;
export const TARGET_ROUND_KCAL = 10;
/** The weight history lists this many of the newest weigh-ins, and "Show more" adds this many more (phase 4b). */
export const WEIGHT_HISTORY_PAGE = 30;
/** Settings lists the newest this many weeks of targets, and "Show all" lists the rest (phase 4b). */
export const TARGETS_HISTORY_LATEST = 26;
