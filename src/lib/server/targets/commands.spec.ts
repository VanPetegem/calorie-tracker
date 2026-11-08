import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PROFILE_ALREADY_SET_UP } from '../../schemas/settings.ts';
import type { Db } from '../db/index.ts';
import { logEntries, settings, weeklyTargets, weights } from '../db/schema.ts';
import { getSettings, settingsWrite } from '../settings/repo.ts';
import { createTestDb } from '../test/d1.ts';
import { listWeights, saveWeight } from '../weights/repo.ts';
import {
	completeOnboardingOn,
	loadOnboarding,
	recomputeWeekOn,
	saveProfileOn
} from './commands.ts';
import { SETTINGS_SAVE_ATTEMPTS } from './repo.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const TODAY = '2026-11-08';
const PROFILE = {
	sex: 'male',
	birthDate: '1990-11-04',
	heightCm: 180,
	activityLevel: 'moderate'
} as const;
const ONBOARDING = { ...PROFILE, kg: 72, goalRatePct: 0.35 } as const;

/**
 * `db` whose `batch` first awaits `interleave` (which must use the real `db`) on each of its first `times` calls: a
 * write that lands between a save's read and its batch, deterministically.
 */
function interleaved(db: Db, interleave: () => Promise<unknown>, times = Infinity): Db {
	let left = times;
	const batch: Db['batch'] = async (queries) => {
		if (left-- > 0) await interleave();
		return db.batch(queries);
	};
	return new Proxy(db, {
		get: (target, key, receiver) => (key === 'batch' ? batch : Reflect.get(target, key, receiver))
	});
}

describe('target commands', () => {
	let test: TestDb;
	beforeAll(async () => {
		test = await createTestDb();
	});
	afterAll(async () => {
		await test.dispose();
	});
	beforeEach(async () => {
		await test.db.delete(weeklyTargets);
		await test.db.delete(weights);
		await test.db.delete(logEntries);
		await test.db.delete(settings);
	});

	async function ctx(today: string) {
		return { db: test.db, settings: await getSettings(test.db), today };
	}

	it('prefills onboarding with the latest weigh-in up to today, never one dated after it', async () => {
		await saveWeight(test.db, { date: '2026-11-09', kg: 90 });
		expect(await loadOnboarding({ db: test.db, today: TODAY })).toEqual({ today: TODAY, kg: null });
		await saveWeight(test.db, { date: '2026-11-07', kg: 70 });
		expect(await loadOnboarding({ db: test.db, today: TODAY })).toEqual({ today: TODAY, kg: 70 });
	});

	it('maps an onboarding age out of range to 400 and writes nothing', async () => {
		// Born 8 November 2010: 15 on 7 November 2026, the day given.
		await expect(
			completeOnboardingOn(await ctx('2026-11-07'), { ...ONBOARDING, birthDate: '2010-11-08' })
		).rejects.toMatchObject({ status: 400, body: { message: 'Age must be 16 to 100' } });
		expect(await listWeights(test.db)).toEqual([]);
		expect((await getSettings(test.db)).sex).toBeNull();
	});

	it('saves the profile, today weigh-in and this week target together and returns the target', async () => {
		const row = await completeOnboardingOn(await ctx(TODAY), ONBOARDING);
		expect(row.weekStart).toBe('2026-11-02');
		expect(await listWeights(test.db)).toEqual([{ date: TODAY, kg: 72 }]);
		expect((await getSettings(test.db)).heightCm).toBe(180);
		expect(await test.db.select().from(weeklyTargets)).toEqual([
			expect.objectContaining({ weekStart: '2026-11-02', targetKcal: row.targetKcal })
		]);
	});

	it('refuses an onboarding that another one finished first after its read, and keeps the first', async () => {
		let first: unknown;
		const db = interleaved(
			test.db,
			async () => {
				first = await completeOnboardingOn(await ctx(TODAY), ONBOARDING);
			},
			1
		);

		await expect(
			completeOnboardingOn(
				{ ...(await ctx(TODAY)), db },
				{ ...ONBOARDING, heightCm: 190, kg: 80, goalRatePct: 0.5 }
			)
		).rejects.toMatchObject({ status: 400, body: { message: PROFILE_ALREADY_SET_UP } });
		expect(await getSettings(test.db)).toMatchObject({ heightCm: 180, goalRatePct: 0.35 });
		expect(await listWeights(test.db)).toEqual([{ date: TODAY, kg: 72 }]);
		expect(await test.db.select().from(weeklyTargets)).toEqual([first]);
	});

	it('answers 400 "Log a weigh-in first" when a profile save has no weigh-in to compute from', async () => {
		await settingsWrite(test.db, PROFILE);
		await expect(
			saveProfileOn(await ctx(TODAY), { ...PROFILE, heightCm: 190 })
		).rejects.toMatchObject({ status: 400, body: { message: 'Log a weigh-in first' } });
		expect((await getSettings(test.db)).heightCm).toBe(PROFILE.heightCm);
	});

	it('answers 400 "Finish setting up your profile first" when a goal save has no complete profile', async () => {
		await saveWeight(test.db, { date: '2026-11-07', kg: 72 });

		await expect(recomputeWeekOn(await ctx(TODAY), { goalRatePct: 0.5 })).rejects.toMatchObject({
			status: 400,
			body: { message: 'Finish setting up your profile first' }
		});
		expect((await getSettings(test.db)).goalRatePct).toBe(0.35);
	});

	it('maps a profile save with an age out of range to 400 and keeps the stored profile', async () => {
		await completeOnboardingOn(await ctx(TODAY), ONBOARDING);
		await expect(
			saveProfileOn(await ctx(TODAY), { ...PROFILE, birthDate: '1925-11-07' })
		).rejects.toMatchObject({ status: 400, body: { message: 'Age must be 16 to 100' } });
		expect((await getSettings(test.db)).birthDate).toBe(PROFILE.birthDate);
	});

	it("recomputes this week's stored target with the saved profile", async () => {
		const onboarded = await completeOnboardingOn(await ctx(TODAY), ONBOARDING);
		const saved = await saveProfileOn(await ctx(TODAY), { ...PROFILE, heightCm: 190 });
		expect(saved.tdeeFormula).not.toBe(onboarded.tdeeFormula);
		expect(await test.db.select().from(weeklyTargets)).toEqual([
			expect.objectContaining({ weekStart: '2026-11-02', tdeeFormula: saved.tdeeFormula })
		]);
	});

	it('answers 400 "Log a weigh-in first" and writes nothing when a goal save has no weigh-in', async () => {
		await settingsWrite(test.db, PROFILE);

		await expect(recomputeWeekOn(await ctx(TODAY), { goalRatePct: 0.5 })).rejects.toMatchObject({
			status: 400,
			body: { message: 'Log a weigh-in first' }
		});
		expect((await getSettings(test.db)).goalRatePct).toBe(0.35);
		expect(await test.db.select().from(weeklyTargets)).toHaveLength(0);
	});

	it('answers 409 and writes nothing when another save changes the settings before every try', async () => {
		await completeOnboardingOn(await ctx(TODAY), ONBOARDING);
		const before = await test.db.select().from(weeklyTargets);
		let interleaves = 0;
		const db = interleaved(test.db, () =>
			settingsWrite(test.db, { fatPct: ++interleaves % 2 === 1 ? 0.3 : 0.35 })
		);

		await expect(
			recomputeWeekOn({ ...(await ctx(TODAY)), db }, { goalRatePct: 0.5 })
		).rejects.toMatchObject({ status: 409, body: { message: 'Settings changed, try again' } });
		expect(interleaves).toBe(SETTINGS_SAVE_ATTEMPTS);
		expect(await getSettings(test.db)).toMatchObject({ goalRatePct: 0.35, fatPct: 0.3 });
		expect(await test.db.select().from(weeklyTargets)).toEqual(before);
	});
});
