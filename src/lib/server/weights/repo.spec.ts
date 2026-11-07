import * as v from 'valibot';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { weights } from '../db/schema.ts';
import { createTestDb } from '../test/d1.ts';
import { deleteWeight, latestWeight, listWeights, saveWeight } from './repo.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const EARLIER = '2026-01-01T00:00:00.000Z';

describe('weights repository', () => {
	let test: TestDb;
	beforeAll(async () => {
		test = await createTestDb();
	});
	afterAll(async () => {
		await test.dispose();
	});
	beforeEach(async () => {
		await test.db.delete(weights);
	});

	it('lists weigh-ins oldest first, and the latest is the newest date', async () => {
		expect(await latestWeight(test.db)).toBeNull();
		await saveWeight(test.db, { date: '2026-11-07', kg: 72.4 });
		await saveWeight(test.db, { date: '2026-10-31', kg: 71.8 });
		await saveWeight(test.db, { date: '2026-11-03', kg: 72.1 });

		expect(await listWeights(test.db)).toEqual([
			{ date: '2026-10-31', kg: 71.8 },
			{ date: '2026-11-03', kg: 72.1 },
			{ date: '2026-11-07', kg: 72.4 }
		]);
		expect(await latestWeight(test.db)).toEqual({ date: '2026-11-07', kg: 72.4 });
	});

	it('replaces the kg of a saved date, keeping created_at and setting updated_at', async () => {
		await test.db
			.insert(weights)
			.values({ date: '2026-11-07', kg: 72, createdAt: EARLIER, updatedAt: EARLIER });

		await saveWeight(test.db, { date: '2026-11-07', kg: 72.6 });

		const rows = await test.db.select().from(weights);
		expect(rows).toEqual([
			{ date: '2026-11-07', kg: 72.6, createdAt: EARLIER, updatedAt: rows[0].updatedAt }
		]);
		expect(rows[0].updatedAt > EARLIER).toBe(true);
	});

	it('parses its input before writing', async () => {
		await expect(saveWeight(test.db, { date: '2026-02-30', kg: 72 })).rejects.toBeInstanceOf(
			v.ValiError
		);
		expect(await listWeights(test.db)).toEqual([]);
	});

	it('deletes a date, and deleting it again does nothing', async () => {
		await saveWeight(test.db, { date: '2026-11-06', kg: 72 });
		await saveWeight(test.db, { date: '2026-11-07', kg: 72.2 });

		await deleteWeight(test.db, '2026-11-07');
		await deleteWeight(test.db, '2026-11-07');

		expect(await listWeights(test.db)).toEqual([{ date: '2026-11-06', kg: 72 }]);
	});
});
