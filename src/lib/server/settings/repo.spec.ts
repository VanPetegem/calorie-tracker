import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../db/schema.ts';
import { createTestDb } from '../test/d1.ts';
import { getSettings } from './repo.ts';

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
			sex: null,
			birthDate: null,
			heightCm: null,
			activityLevel: null,
			goalRatePct: 0.35,
			proteinGPerKg: 1.8,
			fatPct: 0.25,
			energyDensity: 5000
		};
		expect(await getSettings(test.db)).toEqual(defaults);
		expect(await getSettings(test.db)).toEqual(defaults);
		expect(await test.db.select().from(settings)).toEqual([defaults]);
	});
});
