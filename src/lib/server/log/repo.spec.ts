import * as v from 'valibot';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, loggedAtFor } from '../../domain/dates.ts';
import { LogFoodInput } from '../../schemas/log.ts';
import { foods, logEntries } from '../db/schema.ts';
import { createFood, getFood } from '../foods/repo.ts';
import { newId } from '../id.ts';
import { createTestDb } from '../test/d1.ts';
import {
	addFoodEntry,
	addQuickEntry,
	dayEntries,
	dayTotals,
	deleteEntry,
	restoreEntry,
	updateEntryAmount,
	updateQuickEntry
} from './repo.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const TODAY = '2026-11-05';
const TIME_ZONE = 'Europe/Zurich';
// 11:30 in Zurich (UTC+1 in November).
const NOW = new Date('2026-11-05T10:30:00.000Z');
const ctx = { today: TODAY, now: NOW, timeZone: TIME_ZONE };

describe('log repository', () => {
	let test: TestDb;
	let oatsId: string;

	beforeAll(async () => {
		test = await createTestDb();
	});
	afterAll(async () => {
		await test.dispose();
	});
	beforeEach(async () => {
		await test.db.delete(logEntries);
		const oats = await createFood(test.db, {
			name: `Oats ${newId()}`,
			kcal: 370,
			protein: 13,
			carbs: 59,
			fat: 7,
			fiber: 10,
			servingG: 40
		});
		oatsId = oats.id;
	});

	const allEntries = () => test.db.select().from(logEntries);
	const logOats = (overrides: Partial<LogFoodInput> = {}) =>
		addFoodEntry(
			test.db,
			{ date: TODAY, foodId: oatsId, amount: 200, unit: 'g', ...overrides },
			ctx
		);

	describe('addFoodEntry', () => {
		it('snapshots nutrition from the food row', async () => {
			const entry = await logOats();
			expect(entry).toMatchObject({
				date: TODAY,
				kind: 'food',
				foodId: oatsId,
				amount: 200,
				unit: 'g',
				grams: 200,
				kcal: 740,
				protein: 26,
				carbs: 118,
				fat: 14,
				fiber: 20
			});
			expect(entry.label).toMatch(/^Oats /);
			expect(await allEntries()).toEqual([entry]);
		});

		it('never takes nutrition from the client: the schema rejects a kcal field', () => {
			const input = { date: TODAY, foodId: oatsId, amount: 200, unit: 'g', kcal: 1 };
			expect(v.safeParse(LogFoodInput, input).success).toBe(false);
		});

		it('converts servings through the food serving weight', async () => {
			const entry = await logOats({ amount: 1.5, unit: 'serving' });
			expect(entry).toMatchObject({ amount: 1.5, unit: 'serving', grams: 60, kcal: 222 });
		});

		it('fails with 404 for an unknown food and writes nothing', async () => {
			await expect(logOats({ foodId: newId() })).rejects.toMatchObject({ status: 404 });
			expect(await allEntries()).toEqual([]);
		});

		it('fails with 400 for servings of a food without a serving weight', async () => {
			const plain = await createFood(test.db, {
				name: 'Rice',
				kcal: 350,
				protein: 7,
				carbs: 77,
				fat: 1
			});
			await expect(logOats({ foodId: plain.id, unit: 'serving', amount: 1 })).rejects.toMatchObject(
				{
					status: 400
				}
			);
			expect(await allEntries()).toEqual([]);
		});

		it('rejects a date after tomorrow and accepts tomorrow', async () => {
			await expect(logOats({ date: addDays(TODAY, 2) })).rejects.toMatchObject({ status: 400 });
			expect(await allEntries()).toEqual([]);
			expect((await logOats({ date: addDays(TODAY, 1) })).date).toBe('2026-11-06');
		});

		it('uses the real time today and the local time of day on a past day', async () => {
			expect((await logOats()).loggedAt).toBe('2026-11-05T10:30:00.000Z');
			const past = await logOats({ date: '2026-11-01' });
			expect(past.loggedAt).toBe(loggedAtFor('2026-11-01', TODAY, NOW, TIME_ZONE));
			expect(past.loggedAt).toBe('2026-11-01T10:30:00.000Z');
		});

		it('unarchives an archived food', async () => {
			await test.db.update(foods).set({ archivedAt: NOW.toISOString() });
			await logOats();
			expect((await getFood(test.db, oatsId))?.archivedAt).toBeNull();
		});
	});

	describe('quick entries', () => {
		it('stores blank macros as 0 and no food fields', async () => {
			const entry = await addQuickEntry(
				test.db,
				{ date: TODAY, label: 'Restaurant', kcal: 650, protein: null, carbs: 80, fat: null },
				ctx
			);
			expect(entry).toMatchObject({
				kind: 'quick',
				label: 'Restaurant',
				kcal: 650,
				protein: 0,
				carbs: 80,
				fat: 0,
				fiber: null,
				foodId: null,
				amount: null,
				unit: null,
				grams: null,
				loggedAt: NOW.toISOString()
			});
		});

		it('rejects a date after tomorrow', async () => {
			const input = {
				date: addDays(TODAY, 2),
				label: null,
				kcal: 1,
				protein: null,
				carbs: null,
				fat: null
			};
			await expect(addQuickEntry(test.db, input, ctx)).rejects.toMatchObject({ status: 400 });
			expect(await allEntries()).toEqual([]);
		});

		it('updates label and nutrition, keeping the day and time', async () => {
			const entry = await addQuickEntry(
				test.db,
				{ date: '2026-11-01', label: 'Restaurant', kcal: 650, protein: 20, carbs: null, fat: null },
				ctx
			);
			const updated = await updateQuickEntry(test.db, entry.id, {
				label: null,
				kcal: 700,
				protein: null,
				carbs: 90,
				fat: 30
			});
			expect(updated).toEqual({ ...entry, label: null, kcal: 700, protein: 0, carbs: 90, fat: 30 });
		});

		it('fails with 404 for an unknown or food entry', async () => {
			const food = await logOats();
			const input = { label: null, kcal: 1, protein: null, carbs: null, fat: null };
			await expect(updateQuickEntry(test.db, newId(), input)).rejects.toMatchObject({
				status: 404
			});
			await expect(updateQuickEntry(test.db, food.id, input)).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('updateEntryAmount', () => {
		it('rescales the stored snapshot when switching from g to servings', async () => {
			const entry = await logOats();
			const updated = await updateEntryAmount(test.db, {
				id: entry.id,
				amount: 2,
				unit: 'serving'
			});
			expect(updated).toMatchObject({
				id: entry.id,
				amount: 2,
				unit: 'serving',
				grams: 80,
				kcal: 296,
				protein: 10.4,
				carbs: 47.2,
				fat: 5.6,
				fiber: 8
			});
		});

		it('scales the snapshot, not the current food values', async () => {
			const entry = await logOats();
			await test.db.update(foods).set({ kcal: 999 });
			const updated = await updateEntryAmount(test.db, { id: entry.id, amount: 100, unit: 'g' });
			expect(updated).toMatchObject({ grams: 100, kcal: 370 });
		});

		it('fails with 404 for an unknown or quick entry', async () => {
			const quick = await addQuickEntry(
				test.db,
				{ date: TODAY, label: null, kcal: 100, protein: null, carbs: null, fat: null },
				ctx
			);
			const input = { amount: 1, unit: 'g' } as const;
			await expect(updateEntryAmount(test.db, { id: newId(), ...input })).rejects.toMatchObject({
				status: 404
			});
			await expect(updateEntryAmount(test.db, { id: quick.id, ...input })).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('deleteEntry and restoreEntry', () => {
		it('returns the deleted row, and null once it is gone', async () => {
			const entry = await logOats();
			expect(await deleteEntry(test.db, entry.id)).toEqual(entry);
			expect(await deleteEntry(test.db, entry.id)).toBeNull();
			expect(await allEntries()).toEqual([]);
		});

		it('re-inserts the same row once, even when restored twice', async () => {
			const entry = await logOats();
			const deleted = await deleteEntry(test.db, entry.id);
			await restoreEntry(test.db, deleted!);
			await restoreEntry(test.db, deleted!);
			expect(await allEntries()).toEqual([entry]);
		});
	});

	describe('dayEntries and dayTotals', () => {
		it('lists one day in logged order and sums it', async () => {
			const later = await addFoodEntry(
				test.db,
				{ date: TODAY, foodId: oatsId, amount: 100, unit: 'g' },
				{ ...ctx, now: new Date('2026-11-05T12:00:00.000Z') }
			);
			const earlier = await addQuickEntry(
				test.db,
				{ date: TODAY, label: null, kcal: 100.25, protein: 5, carbs: null, fat: null },
				{ ...ctx, now: new Date('2026-11-05T08:00:00.000Z') }
			);
			await logOats({ date: '2026-11-04' });

			const entries = await dayEntries(test.db, TODAY);
			expect(entries.map((e) => e.id)).toEqual([earlier.id, later.id]);
			expect(dayTotals(entries)).toEqual({
				kcal: 470.3,
				protein: 18,
				carbs: 59,
				fat: 7,
				fiber: 10
			});
		});
	});
});
