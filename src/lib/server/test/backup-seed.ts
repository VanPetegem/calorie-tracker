import type { Db } from '../db/index.ts';
import {
	batches,
	batchIngredients,
	containers,
	foods,
	logEntries,
	recipeIngredients,
	recipes,
	settings,
	weeklyTargets,
	weights
} from '../db/schema.ts';

/** Dates that differ per variant, because `weights` and `weekly_targets` are keyed by date. */
const DATES = {
	a: { day: '2026-11-02', monday: '2026-11-02' },
	b: { day: '2026-11-03', monday: '2026-10-26' }
};

/** Values that stress the SQL round trip: quotes, a newline, an emoji, a float that is not exact. */
export const TRICKY_NAME = `O'Neil's "oat"\nbar 🥣`;
export const TRICKY_REAL = 0.1 + 0.2;

/** One row in every app table. Variant `b` shares no key with variant `a`, so both fit in one database. */
export async function seedBackupRows(db: Db, variant: 'a' | 'b' = 'a'): Promise<void> {
	const id = (name: string) => `${variant}-${name}`;
	const { day, monday } = DATES[variant];
	await db.insert(foods).values({
		id: id('food'),
		source: 'custom',
		name: TRICKY_NAME,
		brand: null,
		searchText: TRICKY_NAME.toLowerCase(),
		kcal: TRICKY_REAL,
		protein: 13,
		carbs: 59,
		fat: 7,
		fiber: 1.5
	});
	await db.insert(recipes).values({ id: id('recipe'), name: 'Porridge', defaultPortions: 2 });
	await db.insert(containers).values({ id: id('container'), name: 'Pot', tareG: 850 });
	await db.insert(batches).values({
		id: id('batch'),
		recipeId: id('recipe'),
		name: 'Porridge',
		cookedOn: day,
		portions: 2,
		kcal: 740,
		protein: 26,
		carbs: 118,
		fat: 14
	});
	await db.insert(recipeIngredients).values({
		id: id('recipe-ingredient'),
		recipeId: id('recipe'),
		foodId: id('food'),
		amount: 80,
		unit: 'g',
		grams: 80,
		position: 0
	});
	await db.insert(batchIngredients).values({
		id: id('batch-ingredient'),
		batchId: id('batch'),
		foodId: id('food'),
		name: 'Oats',
		amount: 80,
		unit: 'g',
		grams: 80,
		kcal: 370,
		protein: 13,
		carbs: 59,
		fat: 7,
		position: 0
	});
	await db.insert(logEntries).values({
		id: id('log'),
		date: day,
		loggedAt: `${day}T08:00:00.000Z`,
		kind: 'batch',
		batchId: id('batch'),
		foodId: id('food'),
		amount: 1,
		unit: 'portion',
		kcal: 370,
		protein: 13,
		carbs: 59,
		fat: 7
	});
	await db.insert(weights).values({ date: day, kg: 61.4 });
	await db
		.insert(settings)
		.values({ id: 1, timezone: variant === 'a' ? 'Europe/Zurich' : 'Asia/Tokyo' })
		.onConflictDoUpdate({
			target: settings.id,
			set: { timezone: variant === 'a' ? 'Europe/Zurich' : 'Asia/Tokyo' }
		});
	await db.insert(weeklyTargets).values({
		weekStart: monday,
		tdeeFormula: 2400,
		tdeeAdaptive: null,
		tdeeUsed: 2400,
		targetKcal: 2900,
		proteinG: 110,
		carbsG: 400,
		fatG: 80,
		carbsFloored: true,
		trendKg: 61.2,
		rateKgPerWeek: null,
		validDays: 5,
		weighIns: 4
	});
}
