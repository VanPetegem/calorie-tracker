import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import type { WeekTargetRow } from '../../domain/targets.ts';
import { createTestDb } from '../test/d1.ts';
import {
	batches,
	batchIngredients,
	containers,
	foods,
	logEntries,
	recipeIngredients,
	recipes,
	settings,
	user,
	weeklyTargets,
	weights,
	type WeeklyTarget
} from './schema.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const food = (overrides: Partial<typeof foods.$inferInsert> = {}): typeof foods.$inferInsert => ({
	id: crypto.randomUUID(),
	source: 'custom',
	name: 'Oats',
	searchText: 'oats',
	kcal: 370,
	protein: 13,
	carbs: 59,
	fat: 7,
	...overrides
});

/** Drizzle wraps the D1 error; the constraint name is in the cause. */
const failedOn = (constraint: string) => ({
	cause: { message: expect.stringContaining(constraint) }
});

// Checked by `pnpm check`, not at run time: the table and `weekTarget` agree on every field.
expectTypeOf<Omit<WeeklyTarget, 'computedAt'>>().toEqualTypeOf<WeekTargetRow>();

describe('schema constraints', () => {
	let test: TestDb;
	beforeEach(async () => {
		test = await createTestDb();
	});
	afterEach(async () => {
		await test.dispose();
	});

	it('rejects a second food with the same barcode', async () => {
		await test.db.insert(foods).values(food({ barcode: '7610000000001' }));
		await expect(
			test.db.insert(foods).values(food({ barcode: '7610000000001' }))
		).rejects.toMatchObject(failedOn('UNIQUE constraint failed: foods.barcode'));
	});

	it('rejects a second food with the same source and source ref', async () => {
		await test.db.insert(foods).values(food({ source: 'blv', sourceRef: '123' }));
		await expect(
			test.db.insert(foods).values(food({ source: 'blv', sourceRef: '123' }))
		).rejects.toMatchObject(failedOn('UNIQUE constraint failed: foods.source, foods.source_ref'));
	});

	it('allows several custom foods without a barcode or source ref', async () => {
		await test.db.insert(foods).values([food(), food()]);
		// The BLV migration seeds generic foods; only the custom ones are ours.
		expect(await test.db.$count(foods, eq(foods.source, 'custom'))).toBe(2);
	});

	it('rejects a second settings row', async () => {
		await expect(test.db.insert(settings).values({ id: 2 })).rejects.toMatchObject(
			failedOn('CHECK constraint failed: settings_single_row')
		);
	});

	it('rejects settings outside the enums and limits', async () => {
		// Raw SQL, because the Drizzle types already refuse the enum values these checks are for.
		const cases = [
			['sex', "'other'", 'settings_sex'],
			['activity_level', "'extreme'", 'settings_activity_level'],
			['height_cm', '99.9', 'settings_height_cm_range'],
			['height_cm', '250.1', 'settings_height_cm_range'],
			['goal_rate_pct', '0.4', 'settings_goal_rate'],
			['protein_g_per_kg', '1.19', 'settings_protein_g_per_kg_range'],
			['protein_g_per_kg', '3.01', 'settings_protein_g_per_kg_range'],
			['fat_pct', '0.149', 'settings_fat_pct_range'],
			['fat_pct', '0.401', 'settings_fat_pct_range'],
			['energy_density_kcal_per_kg', '2999', 'settings_energy_density_range'],
			['energy_density_kcal_per_kg', '7701', 'settings_energy_density_range']
		];
		for (const [column, value, constraint] of cases) {
			await expect(
				test.d1.prepare(`INSERT INTO settings (id, ${column}) VALUES (1, ${value})`).run(),
				`${column} = ${value}`
			).rejects.toThrow(`CHECK constraint failed: ${constraint}`);
		}
	});

	it('accepts a complete profile and rules at their limits', async () => {
		const profile = {
			id: 1,
			sex: 'female',
			birthDate: '1990-05-01',
			heightCm: 100,
			activityLevel: 'very_active',
			goalRatePct: 0.5,
			proteinGPerKg: 3,
			fatPct: 0.15,
			energyDensity: 7700
		} as const;
		await test.db.insert(settings).values(profile);
		await test.db.update(settings).set({
			heightCm: 250,
			goalRatePct: 0.25,
			proteinGPerKg: 1.2,
			fatPct: 0.4,
			energyDensity: 3000
		});
		expect(await test.db.$count(settings)).toBe(1);
	});

	describe('weekly targets', () => {
		const row = (weekStart: string): typeof weeklyTargets.$inferInsert => ({
			weekStart,
			tdeeFormula: 2650.4,
			tdeeAdaptive: null,
			tdeeUsed: 2650.4,
			targetKcal: 2950,
			proteinG: 130,
			carbsG: 380,
			fatG: 82,
			carbsFloored: false,
			trendKg: 72.1,
			rateKgPerWeek: null,
			validDays: 0,
			weighIns: 1
		});

		it('start on a Monday date, one row per week', async () => {
			// 2026-02-30 is no date, but SQLite's date() reads it as 2026-03-02, a Monday.
			for (const weekStart of ['2026-11-08', 'garbage', '2026-02-30']) {
				await expect(
					test.db.insert(weeklyTargets).values(row(weekStart)),
					weekStart
				).rejects.toMatchObject(
					failedOn('CHECK constraint failed: weekly_targets_week_start_monday')
				);
			}
			await test.db.insert(weeklyTargets).values(row('2026-11-09'));
			const [stored] = await test.db.select().from(weeklyTargets);
			expect(stored).toMatchObject({ ...row('2026-11-09'), computedAt: expect.any(String) });
			await expect(test.db.insert(weeklyTargets).values(row('2026-11-09'))).rejects.toMatchObject(
				failedOn('UNIQUE constraint failed: weekly_targets.week_start')
			);
		});
	});

	it('keeps the single account trigger', async () => {
		const now = new Date();
		const person = { name: 'A', emailVerified: false, createdAt: now, updatedAt: now };
		await test.db.insert(user).values({ ...person, id: 'u1', email: 'a@example.com' });
		await expect(
			test.db.insert(user).values({ ...person, id: 'u2', email: 'b@example.com' })
		).rejects.toMatchObject(failedOn('sign up is closed'));
	});

	it('rejects a recipe with zero default portions', async () => {
		await expect(
			test.db.insert(recipes).values({ id: crypto.randomUUID(), name: 'Chili', defaultPortions: 0 })
		).rejects.toMatchObject(failedOn('CHECK constraint failed: recipes_default_portions_positive'));
	});

	describe('recipe ingredients', () => {
		const recipeId = crypto.randomUUID();
		const oats = food();
		beforeEach(async () => {
			await test.db.insert(foods).values(oats);
			await test.db.insert(recipes).values({ id: recipeId, name: 'Porridge', defaultPortions: 2 });
			await test.db.insert(recipeIngredients).values({
				id: crypto.randomUUID(),
				recipeId,
				foodId: oats.id,
				amount: 80,
				unit: 'g',
				grams: 80,
				position: 0
			});
		});

		it('are deleted with their recipe', async () => {
			await test.db.delete(recipes).where(eq(recipes.id, recipeId));
			expect(await test.db.$count(recipeIngredients)).toBe(0);
		});

		it('keep their food from being deleted', async () => {
			await expect(test.db.delete(foods).where(eq(foods.id, oats.id))).rejects.toMatchObject(
				failedOn('FOREIGN KEY constraint failed')
			);
		});
	});

	describe('batches', () => {
		const batchId = crypto.randomUUID();
		const oats = food();
		const totals = { kcal: 740, protein: 26, carbs: 118, fat: 14, fiber: 20 };
		const batch = (
			overrides: Partial<typeof batches.$inferInsert> = {}
		): typeof batches.$inferInsert => ({
			id: batchId,
			name: 'Porridge',
			cookedOn: '2026-11-06',
			portions: 4,
			...totals,
			...overrides
		});
		const entry = (batchId: string): typeof logEntries.$inferInsert => ({
			id: crypto.randomUUID(),
			date: '2026-11-06',
			loggedAt: '2026-11-06T12:00:00.000Z',
			kind: 'batch',
			batchId,
			amount: 1,
			unit: 'portion',
			label: 'Porridge',
			kcal: 185,
			protein: 6.5,
			carbs: 29.5,
			fat: 3.5
		});
		beforeEach(async () => {
			await test.db.insert(foods).values(oats);
			await test.db.insert(batches).values(batch());
			await test.db.insert(batchIngredients).values({
				id: crypto.randomUUID(),
				batchId,
				foodId: oats.id,
				name: 'Oats',
				amount: 200,
				unit: 'g',
				grams: 200,
				kcal: 370,
				protein: 13,
				carbs: 59,
				fat: 7,
				fiber: 10,
				position: 0
			});
		});

		it('delete their ingredients with them', async () => {
			await test.db.delete(batches).where(eq(batches.id, batchId));
			expect(await test.db.$count(batchIngredients)).toBe(0);
		});

		it('are the only batches a log entry can reference', async () => {
			await test.db.insert(logEntries).values(entry(batchId));
			await expect(
				test.db.insert(logEntries).values(entry(crypto.randomUUID()))
			).rejects.toMatchObject(failedOn('FOREIGN KEY constraint failed'));
		});

		it('cannot be deleted while a log entry references them', async () => {
			await test.db.insert(logEntries).values(entry(batchId));
			await expect(test.db.delete(batches).where(eq(batches.id, batchId))).rejects.toMatchObject(
				failedOn('FOREIGN KEY constraint failed')
			);
		});

		it('reject zero portions and a cooked weight of zero', async () => {
			await expect(
				test.db.insert(batches).values(batch({ id: crypto.randomUUID(), portions: 0 }))
			).rejects.toMatchObject(failedOn('CHECK constraint failed: batches_portions_positive'));
			await expect(
				test.db.insert(batches).values(batch({ id: crypto.randomUUID(), cookedWeightG: 0 }))
			).rejects.toMatchObject(failedOn('CHECK constraint failed: batches_cooked_weight_positive'));
		});

		it('reference an existing recipe or none', async () => {
			await expect(
				test.db
					.insert(batches)
					.values(batch({ id: crypto.randomUUID(), recipeId: crypto.randomUUID() }))
			).rejects.toMatchObject(failedOn('FOREIGN KEY constraint failed'));
		});
	});

	it('rejects a container with zero tare', async () => {
		await expect(
			test.db.insert(containers).values({ id: crypto.randomUUID(), name: 'Pot', tareG: 0 })
		).rejects.toMatchObject(failedOn('CHECK constraint failed: containers_tare_positive'));
	});

	it('rejects a weight outside 20 to 400 kg', async () => {
		for (const kg of [19.9, 400.1]) {
			await expect(
				test.db.insert(weights).values({ date: '2026-11-07', kg })
			).rejects.toMatchObject(failedOn('CHECK constraint failed: weights_kg_range'));
		}
		await test.db.insert(weights).values([
			{ date: '2026-11-06', kg: 20 },
			{ date: '2026-11-07', kg: 400 }
		]);
		expect(await test.db.$count(weights)).toBe(2);
	});
});
