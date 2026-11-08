import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { logEntries, settings, weeklyTargets, weights } from '../db/schema.ts';
import { getSettings, settingsWrite } from '../settings/repo.ts';
import { createTestDb } from '../test/d1.ts';
import { listWeights, saveWeight } from '../weights/repo.ts';
import { completeOnboardingOn, loadOnboarding, saveProfileOn } from './commands.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const TODAY = '2026-11-08';
const PROFILE = {
	sex: 'male',
	birthDate: '1990-11-04',
	heightCm: 180,
	activityLevel: 'moderate'
} as const;
const ONBOARDING = { ...PROFILE, kg: 72, goalRatePct: 0.35 } as const;

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

	it('accepts 16 on the birthday and refuses 15 the day before, counted on the day given, with nothing written', async () => {
		// Born 8 November 2010: 15 on 7 November 2026 (the day given), 16 on 8 November.
		await expect(
			completeOnboardingOn(await ctx('2026-11-07'), { ...ONBOARDING, birthDate: '2010-11-08' })
		).rejects.toMatchObject({ status: 400 });
		expect(await listWeights(test.db)).toEqual([]);
		expect((await getSettings(test.db)).sex).toBeNull();
		await expect(
			completeOnboardingOn(await ctx(TODAY), { ...ONBOARDING, birthDate: '2010-11-08' })
		).resolves.toMatchObject({ weekStart: '2026-11-02' });
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

	it('refuses a second onboarding once the profile is complete, and keeps the first', async () => {
		await completeOnboardingOn(await ctx(TODAY), ONBOARDING);
		await expect(
			completeOnboardingOn(await ctx(TODAY), { ...ONBOARDING, heightCm: 190, kg: 80 })
		).rejects.toMatchObject({ status: 400 });
		expect((await getSettings(test.db)).heightCm).toBe(PROFILE.heightCm);
		expect(await listWeights(test.db)).toEqual([{ date: TODAY, kg: 72 }]);
	});

	it('answers 400 "Log a weigh-in first" when a profile save has no weigh-in to compute from', async () => {
		await settingsWrite(test.db, PROFILE);
		await expect(
			saveProfileOn(await ctx(TODAY), { ...PROFILE, heightCm: 190 })
		).rejects.toMatchObject({ status: 400, body: { message: 'Log a weigh-in first' } });
		expect((await getSettings(test.db)).heightCm).toBe(PROFILE.heightCm);
	});

	it('refuses a profile save with an age out of range and keeps the stored profile', async () => {
		await completeOnboardingOn(await ctx(TODAY), ONBOARDING);
		await expect(
			saveProfileOn(await ctx(TODAY), { ...PROFILE, birthDate: '1925-11-07' })
		).rejects.toMatchObject({ status: 400 });
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
});
