import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { trendSeries, weeklyRate } from '../../domain/trend.ts';
import { weights } from '../db/schema.ts';
import { createTestDb } from '../test/d1.ts';
import { listWeights } from './repo.ts';
import { deleteWeightOn, loadWeight, saveWeightOn } from './commands.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const TODAY = '2026-11-07';

describe('weight commands and page data', () => {
	let test: TestDb;
	const ctx = () => ({ db: test.db, today: TODAY });

	beforeAll(async () => {
		test = await createTestDb();
	});
	afterAll(async () => {
		await test.dispose();
	});
	beforeEach(async () => {
		await test.db.delete(weights);
	});

	it('saves and replaces a weigh-in on a past day, today and tomorrow', async () => {
		await saveWeightOn(ctx(), { date: '2020-01-01', kg: 70 });
		await saveWeightOn(ctx(), { date: TODAY, kg: 71 });
		await saveWeightOn(ctx(), { date: '2026-11-08', kg: 72 });
		await saveWeightOn(ctx(), { date: TODAY, kg: 71.5 });
		expect(await listWeights(test.db)).toEqual([
			{ date: '2020-01-01', kg: 70 },
			{ date: TODAY, kg: 71.5 },
			{ date: '2026-11-08', kg: 72 }
		]);
	});

	it('refuses a save after tomorrow with 400 and writes nothing', async () => {
		await expect(saveWeightOn(ctx(), { date: '2026-11-09', kg: 70 })).rejects.toMatchObject({
			status: 400
		});
		expect(await listWeights(test.db)).toEqual([]);
	});

	it('deletes a weigh-in, and refuses a delete after tomorrow with 400', async () => {
		await saveWeightOn(ctx(), { date: '2026-11-01', kg: 70 });
		await deleteWeightOn(ctx(), { date: '2026-11-01' });
		expect(await listWeights(test.db)).toEqual([]);
		await expect(deleteWeightOn(ctx(), { date: '2026-11-09' })).rejects.toMatchObject({
			status: 400
		});
	});

	it('loads nothing before the first weigh-in', async () => {
		expect(await loadWeight(ctx())).toEqual({
			today: TODAY,
			series: [],
			todayKg: null,
			lastKg: null,
			trendKg: null,
			rate: null
		});
	});

	it('keeps a weigh-in of tomorrow out of the trend seed when there are fewer than three up to today', async () => {
		await saveWeightOn(ctx(), { date: '2026-10-20', kg: 70 });
		await saveWeightOn(ctx(), { date: '2026-11-03', kg: 71 });
		await saveWeightOn(ctx(), { date: '2026-11-08', kg: 90 });
		const data = await loadWeight(ctx());
		const upToToday = trendSeries([
			{ date: '2026-10-20', kg: 70 },
			{ date: '2026-11-03', kg: 71 }
		]);
		expect(data.trendKg).toBeCloseTo(upToToday[1].trend, 10);
		expect(data.series[1].trend).toBeCloseTo(upToToday[1].trend, 10);
		expect(data.rate).toEqual(weeklyRate(upToToday, TODAY));
	});

	it('loads the series, today and the latest weight up to today, the trend and the rate', async () => {
		// Three weigh-ins up to today fill the trend seed, so tomorrow's weigh-in cannot reach the trend through it.
		await saveWeightOn(ctx(), { date: '2026-10-10', kg: 69 });
		await saveWeightOn(ctx(), { date: '2026-10-20', kg: 70 });
		await saveWeightOn(ctx(), { date: '2026-11-03', kg: 71 });
		await saveWeightOn(ctx(), { date: '2026-11-08', kg: 90 });
		const data = await loadWeight(ctx());
		expect(data.series.map((point) => point.date)).toEqual([
			'2026-10-10',
			'2026-10-20',
			'2026-11-03',
			'2026-11-08'
		]);
		expect(data.todayKg).toBeNull();
		// The weigh-in of tomorrow is neither the prefill nor part of today's trend.
		expect(data.lastKg).toBe(71);
		expect(data.trendKg).toBeCloseTo(data.series[2].trend, 10);
		// The rate uses the weigh-ins up to today only: with tomorrow's 90 kg in the series it would be far higher.
		const upToToday = [
			{ date: '2026-10-10', kg: 69 },
			{ date: '2026-10-20', kg: 70 },
			{ date: '2026-11-03', kg: 71 }
		];
		const expected = weeklyRate(trendSeries(upToToday), TODAY);
		const leaked = weeklyRate(
			trendSeries([...upToToday, { date: '2026-11-08', kg: 90 }]),
			'2026-11-08'
		);
		expect(expected).not.toBeNull();
		expect(expected).not.toEqual(leaked);
		expect(data.rate).toEqual(expected);

		await saveWeightOn(ctx(), { date: TODAY, kg: 71.4 });
		expect((await loadWeight(ctx())).todayKg).toBe(71.4);
		expect((await loadWeight(ctx())).lastKg).toBe(71.4);
	});
});
