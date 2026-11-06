import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../db/schema.ts';
import { createTestDb } from '../test/d1.ts';
import { getSettings, saveManualTarget } from './repo.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

describe('settings repository', () => {
	let test: TestDb;
	beforeAll(async () => {
		test = await createTestDb();
	});
	afterAll(async () => {
		await test.dispose();
	});
	beforeEach(async () => {
		await test.db.delete(settings);
	});

	it('creates the single row with defaults on first read', async () => {
		const defaults = {
			id: 1,
			timezone: 'Europe/Zurich',
			manualTargetKcal: null,
			manualWeightKg: null
		};
		expect(await getSettings(test.db)).toEqual(defaults);
		expect(await getSettings(test.db)).toEqual(defaults);
		expect(await test.db.select().from(settings)).toEqual([defaults]);
	});

	it('saves the manual target, and null clears both values', async () => {
		await saveManualTarget(test.db, { kcal: 3000, weightKg: 70 });
		expect(await getSettings(test.db)).toMatchObject({
			manualTargetKcal: 3000,
			manualWeightKg: 70
		});

		await saveManualTarget(test.db, null);
		expect(await getSettings(test.db)).toMatchObject({
			manualTargetKcal: null,
			manualWeightKg: null
		});
		expect(await test.db.select().from(settings)).toHaveLength(1);
	});
});
