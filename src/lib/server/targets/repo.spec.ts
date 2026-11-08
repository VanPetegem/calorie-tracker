import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays } from '../../domain/dates.ts';
import type { WeekTargetRow } from '../../domain/targets.ts';
import { smoothTdee } from '../../domain/tdee.ts';
import type { Db } from '../db/index.ts';
import { logEntries, settings, weeklyTargets, weights, type WeeklyTarget } from '../db/schema.ts';
import { addQuickEntry } from '../log/repo.ts';
import { getSettings, settingsWrite, type TargetSettingsPatch } from '../settings/repo.ts';
import { createTestDb } from '../test/d1.ts';
import { listWeights, saveWeight } from '../weights/repo.ts';
import {
	AgeOutOfRangeError,
	currentTarget,
	NoWeighInError,
	ProfileIncompleteError,
	recomputeCurrentWeek,
	saveOnboarding,
	targetFor,
	targetsHistory
} from './repo.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

// The week of Monday 2026-11-02 to Sunday 2026-11-08.
const MON = '2026-11-02';
const WED = '2026-11-04';
const SAT = '2026-11-07';
const SUN = '2026-11-08';
const LAST_WEEK = '2026-10-26';

// Turns 36 on the Wednesday of the week, so the age depends on the day used.
const PROFILE = {
	sex: 'male',
	birthDate: '1990-11-04',
	heightCm: 180,
	activityLevel: 'moderate'
} as const satisfies TargetSettingsPatch;

/** A stored row with every value fixed, for lookups. */
function storedRow(weekStart: string, overrides: Partial<WeekTargetRow> = {}): WeekTargetRow {
	return {
		weekStart,
		tdeeFormula: 2600,
		tdeeAdaptive: null,
		tdeeUsed: 2600,
		targetKcal: 2900,
		proteinG: 130,
		carbsG: 400,
		fatG: 80,
		carbsFloored: false,
		trendKg: 72,
		rateKgPerWeek: null,
		validDays: 0,
		weighIns: 0,
		...overrides
	};
}

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

function withoutComputedAt(row: WeeklyTarget): WeekTargetRow {
	const { computedAt, ...rest } = row;
	expect(computedAt).toEqual(expect.any(String));
	return rest;
}

describe('targets repository', () => {
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

	async function withProfile(patch: TargetSettingsPatch = PROFILE) {
		await settingsWrite(test.db, patch);
	}

	/** Makes the profile incomplete again, so another onboarding may run. */
	async function unsetProfile() {
		await settingsWrite(test.db, { sex: null });
	}

	async function ctx(today: string) {
		return { db: test.db, settings: await getSettings(test.db), today };
	}

	async function eat(date: string, kcal: number) {
		return addQuickEntry(
			test.db,
			{ date, label: 'Meal', kcal, protein: null, carbs: null, fat: null },
			{ today: SUN, now: new Date(`${SUN}T12:00:00.000Z`), timeZone: 'Europe/Zurich' }
		);
	}

	async function rows() {
		return test.db.select().from(weeklyTargets).orderBy(weeklyTargets.weekStart);
	}

	it('makes one row when two loads of a new week run at once', async () => {
		await withProfile();
		await saveWeight(test.db, { date: '2026-10-30', kg: 72 });
		const context = await ctx(WED);

		const [first, second] = await Promise.all([currentTarget(context), currentTarget(context)]);

		expect(first).toEqual(second);
		expect(await rows()).toEqual([first]);
	});

	it('computes the same row on Monday and on Sunday of a week with the same data', async () => {
		await withProfile();
		await saveWeight(test.db, { date: '2026-10-25', kg: 71.5 });
		await saveWeight(test.db, { date: '2026-10-31', kg: 72 });
		await saveWeight(test.db, { date: WED, kg: 73 });
		for (let n = 1; n <= 21; n++) await eat(addDays(MON, -n), 3000);
		for (const date of [MON, WED, SAT]) await eat(date, 1500);

		const monday = withoutComputedAt(await currentTarget(await ctx(MON)));
		await test.db.delete(weeklyTargets);
		const sunday = withoutComputedAt(await currentTarget(await ctx(SUN)));

		expect(sunday).toEqual(monday);
	});

	it('builds a row only from weigh-ins before its week, whatever the week already holds', async () => {
		await withProfile();
		await saveWeight(test.db, { date: '2026-10-29', kg: 72 });
		await saveWeight(test.db, { date: '2026-10-31', kg: 72.4 });
		const before = withoutComputedAt(await currentTarget(await ctx(SAT)));
		await test.db.delete(weeklyTargets);

		await saveWeight(test.db, { date: MON, kg: 75 });
		await saveWeight(test.db, { date: SAT, kg: 75.5 });
		await saveWeight(test.db, { date: SUN, kg: 76 }); // tomorrow

		expect(withoutComputedAt(await currentTarget(await ctx(SAT)))).toEqual(before);
	});

	it('builds the first week from the earliest weigh-in, so later weigh-ins of that week do not change it', async () => {
		const onboarded = await saveOnboarding(await ctx(WED), {
			...PROFILE,
			kg: 72,
			goalRatePct: 0.35
		});
		expect(onboarded).toMatchObject({ weekStart: MON, trendKg: 72, rateKgPerWeek: null });

		await saveWeight(test.db, { date: '2026-11-05', kg: 74 });
		expect(await currentTarget(await ctx(SAT))).toEqual(onboarded);

		await test.db.delete(weeklyTargets);
		expect(withoutComputedAt(await currentTarget(await ctx(SAT)))).toEqual(
			withoutComputedAt(onboarded)
		);
	});

	it('uses the latest earlier row and the 21 days before the week', async () => {
		await withProfile();
		await test.db
			.insert(weeklyTargets)
			.values([
				storedRow('2026-10-19', { tdeeUsed: 3000 }),
				storedRow(LAST_WEEK, { tdeeUsed: 2500 })
			]);
		await saveWeight(test.db, { date: '2026-10-30', kg: 72 });
		// Only the first and last day of the window count.
		for (const n of [-22, -21, -1, 0]) await eat(addDays(MON, n), 3000);

		const row = await currentTarget(await ctx(MON));

		expect(row.validDays).toBe(2);
		expect(row.tdeeAdaptive).toBeNull();
		expect(row.tdeeUsed).toBeCloseTo(smoothTdee(row.tdeeFormula, 2500), 9);
	});

	it('refuses to compute a target without a complete profile', async () => {
		await withProfile({ ...PROFILE, activityLevel: null });
		await saveWeight(test.db, { date: '2026-10-30', kg: 72 });

		await expect(currentTarget(await ctx(WED))).rejects.toBeInstanceOf(ProfileIncompleteError);
		expect(await rows()).toEqual([]);
	});

	it('replaces only this week on a settings change and saves the setting with it', async () => {
		await withProfile();
		await saveWeight(test.db, { date: '2026-10-20', kg: 72 });
		const lastWeekRow = storedRow(LAST_WEEK, { tdeeUsed: 2500 });
		await test.db.insert(weeklyTargets).values(lastWeekRow);
		const lastWeek = await test.d1
			.prepare('SELECT * FROM weekly_targets WHERE week_start = ?')
			.bind(LAST_WEEK)
			.all();
		const before = await currentTarget(await ctx(WED));

		const after = await recomputeCurrentWeek(await ctx(WED), { goalRatePct: 0.5 });
		const again = await recomputeCurrentWeek(await ctx(WED), { goalRatePct: 0.5 });

		expect(after.targetKcal).toBeGreaterThan(before.targetKcal);
		// Always smoothed from last week's row, never from the row being replaced.
		expect(after.tdeeAdaptive).toBeNull();
		expect(after.tdeeUsed).toBeCloseTo(smoothTdee(after.tdeeFormula, lastWeekRow.tdeeUsed), 9);
		expect(again.tdeeUsed).toBe(after.tdeeUsed);
		expect((await rows()).find((row) => row.weekStart === MON)).toEqual(again);
		expect((await getSettings(test.db)).goalRatePct).toBe(0.5);
		const lastWeekAfter = await test.d1
			.prepare('SELECT * FROM weekly_targets WHERE week_start = ?')
			.bind(LAST_WEEK)
			.all();
		expect(lastWeekAfter.results).toEqual(lastWeek.results);
	});

	describe('a profile save', () => {
		beforeEach(async () => {
			await withProfile();
			await saveWeight(test.db, { date: '2026-10-20', kg: 72 });
			// Far from every formula TDEE below, so smoothing always moves (and caps) this week's.
			await test.db.insert(weeklyTargets).values(storedRow(LAST_WEEK, { tdeeUsed: 2000 }));
		});

		it.each<TargetSettingsPatch>([
			{ sex: 'female' },
			{ birthDate: '1980-11-04' },
			{ heightCm: 170 },
			{ activityLevel: 'active' }
		])(
			'that changes %o recomputes this week without smoothing against last week',
			async (change) => {
				const after = await recomputeCurrentWeek(await ctx(WED), { ...PROFILE, ...change });

				expect(after.tdeeAdaptive).toBeNull();
				expect(after.tdeeUsed).toBe(after.tdeeFormula);
			}
		);

		it.each<[string, TargetSettingsPatch]>([
			['a goal save', { goalRatePct: 0.5 }],
			['a macro rule save', { proteinGPerKg: 2.2 }],
			['a re-save of the unchanged profile', { ...PROFILE, activityLevel: 'active' }]
		])('that changes the profile keeps this week unsmoothed through %s', async (_, patch) => {
			await recomputeCurrentWeek(await ctx(WED), { ...PROFILE, activityLevel: 'active' });

			const after = await recomputeCurrentWeek(await ctx(WED), patch);

			expect(after.tdeeUsed).toBe(after.tdeeFormula);
		});

		it('that changes nothing keeps smoothing against last week', async () => {
			const after = await recomputeCurrentWeek(await ctx(WED), PROFILE);

			expect(after.tdeeUsed).toBeCloseTo(smoothTdee(after.tdeeFormula, 2000), 9);
		});
	});

	it('stamps the clock as computed_at when a row is replaced', async () => {
		await withProfile();
		await saveWeight(test.db, { date: '2026-10-30', kg: 72 });
		const created = await currentTarget(await ctx(WED));
		const recomputeAt = new Date('2026-11-04T12:00:00.000Z');
		const onboardAt = new Date('2026-11-04T13:00:00.000Z');

		const recomputed = await recomputeCurrentWeek(
			{ ...(await ctx(WED)), now: recomputeAt },
			{ goalRatePct: 0.5 }
		);
		await unsetProfile();
		const onboarded = await saveOnboarding(
			{ ...(await ctx(WED)), now: onboardAt },
			{ ...PROFILE, kg: 72, goalRatePct: 0.5 }
		);

		expect(created.computedAt).not.toBe(recomputeAt.toISOString());
		expect(recomputed.computedAt).toBe(recomputeAt.toISOString());
		expect(onboarded.computedAt).toBe(onboardAt.toISOString());
	});

	it('computes a settings change from the settings in the database, not the request’s copy', async () => {
		await withProfile();
		await saveWeight(test.db, { date: '2026-10-30', kg: 72 });
		const stale = await ctx(WED);
		await settingsWrite(test.db, { fatPct: 0.35 });

		const viaStale = await recomputeCurrentWeek(stale, { goalRatePct: 0.5 });
		const viaFresh = await recomputeCurrentWeek(await ctx(WED), { goalRatePct: 0.5 });

		expect(withoutComputedAt(viaStale)).toEqual(withoutComputedAt(viaFresh));
	});

	it('retries a settings save another save landed in, so the row is computed from the settings it ends with', async () => {
		await withProfile();
		await saveWeight(test.db, { date: '2026-10-20', kg: 72 });
		await test.db.insert(weeklyTargets).values(storedRow(LAST_WEEK, { tdeeUsed: 2000 }));
		await currentTarget(await ctx(WED));
		const db = interleaved(
			test.db,
			async () => recomputeCurrentWeek(await ctx(WED), { heightCm: 170 }),
			1
		);

		const saved = await recomputeCurrentWeek({ ...(await ctx(WED)), db }, { goalRatePct: 0.5 });

		expect(await getSettings(test.db)).toMatchObject({ heightCm: 170, goalRatePct: 0.5 });
		expect((await rows()).find((row) => row.weekStart === MON)).toEqual(saved);
		// The interleaved profile change made this week unsmoothed; the retry reads that, not its first read.
		expect(saved.tdeeUsed).toBe(saved.tdeeFormula);
		const again = await recomputeCurrentWeek(await ctx(WED), { goalRatePct: 0.5 });
		expect(withoutComputedAt(saved)).toEqual(withoutComputedAt(again));
	});

	describe('when the row write fails', () => {
		beforeEach(async () => {
			await test.d1.exec(
				"CREATE TRIGGER fail_target BEFORE INSERT ON weekly_targets BEGIN SELECT RAISE(ABORT, 'no row'); END"
			);
		});
		afterEach(async () => {
			await test.d1.exec('DROP TRIGGER fail_target');
		});

		it('keeps the old settings on a settings change', async () => {
			await withProfile();
			await saveWeight(test.db, { date: '2026-10-30', kg: 72 });

			await expect(recomputeCurrentWeek(await ctx(WED), { goalRatePct: 0.5 })).rejects.toThrow();

			expect((await getSettings(test.db)).goalRatePct).toBe(0.35);
		});

		it('writes neither profile nor weigh-in at onboarding', async () => {
			await expect(
				saveOnboarding(await ctx(WED), { ...PROFILE, kg: 72, goalRatePct: 0.5 })
			).rejects.toThrow();

			expect(await getSettings(test.db)).toMatchObject({ sex: null, goalRatePct: 0.35 });
			expect(await listWeights(test.db)).toEqual([]);
		});
	});

	it('saves the profile, the goal rate, today’s weigh-in and the week row at onboarding', async () => {
		await saveWeight(test.db, { date: WED, kg: 70 });

		const row = await saveOnboarding(await ctx(WED), { ...PROFILE, kg: 72, goalRatePct: 0.5 });

		expect(await getSettings(test.db)).toMatchObject({ ...PROFILE, goalRatePct: 0.5 });
		expect(await listWeights(test.db)).toEqual([{ date: WED, kg: 72 }]);
		expect(await rows()).toEqual([row]);
		expect(row).toMatchObject({ weekStart: MON, trendKg: 72 });
	});

	it('computes the onboarding row with the chosen goal rate', async () => {
		const low = await saveOnboarding(await ctx(WED), { ...PROFILE, kg: 72, goalRatePct: 0.35 });
		await unsetProfile();
		const high = await saveOnboarding(await ctx(WED), { ...PROFILE, kg: 72, goalRatePct: 0.5 });

		expect(high.targetKcal).toBeGreaterThan(low.targetKcal);
	});

	it('computes the onboarding row from the settings in the database, not the request’s copy', async () => {
		const stale = await ctx(WED);
		await settingsWrite(test.db, { fatPct: 0.35 });
		const input = { ...PROFILE, kg: 72, goalRatePct: 0.5 };

		const viaStale = await saveOnboarding(stale, input);
		await unsetProfile();
		const viaFresh = await saveOnboarding(await ctx(WED), input);

		expect(withoutComputedAt(viaStale)).toEqual(withoutComputedAt(viaFresh));
	});

	// On WED the birth dates below make the age 15, 16, 100 and 101.
	describe('age on the day of the write', () => {
		it.each(['2010-11-05', '1925-11-04'])(
			'refuses onboarding with birth date %s and writes nothing',
			async (birthDate) => {
				await expect(
					saveOnboarding(await ctx(WED), { ...PROFILE, birthDate, kg: 72, goalRatePct: 0.5 })
				).rejects.toBeInstanceOf(AgeOutOfRangeError);

				expect(await getSettings(test.db)).toMatchObject({ sex: null, goalRatePct: 0.35 });
				expect(await listWeights(test.db)).toEqual([]);
				expect(await rows()).toEqual([]);
			}
		);

		it.each(['2010-11-04', '1925-11-05'])(
			'accepts onboarding with birth date %s, in range on the day',
			async (birthDate) => {
				const row = await saveOnboarding(await ctx(WED), {
					...PROFILE,
					birthDate,
					kg: 72,
					goalRatePct: 0.5
				});

				expect(row).toMatchObject({ weekStart: MON });
				expect((await getSettings(test.db)).birthDate).toBe(birthDate);
			}
		);

		it.each(['2010-11-05', '1925-11-04'])(
			'refuses a settings change to birth date %s and keeps the settings and the row',
			async (birthDate) => {
				await withProfile();
				await saveWeight(test.db, { date: '2026-10-30', kg: 72 });
				const before = await currentTarget(await ctx(WED));

				await expect(recomputeCurrentWeek(await ctx(WED), { birthDate })).rejects.toBeInstanceOf(
					AgeOutOfRangeError
				);

				expect((await getSettings(test.db)).birthDate).toBe(PROFILE.birthDate);
				expect(await rows()).toEqual([before]);
			}
		);

		it.each(['2010-11-04', '1925-11-05'])(
			'accepts a settings change to birth date %s, in range on the day',
			async (birthDate) => {
				await withProfile();
				await saveWeight(test.db, { date: '2026-10-30', kg: 72 });

				await expect(recomputeCurrentWeek(await ctx(WED), { birthDate })).resolves.toMatchObject({
					weekStart: MON
				});
				expect((await getSettings(test.db)).birthDate).toBe(birthDate);
			}
		);
	});

	describe('target of a date', () => {
		beforeEach(async () => {
			await withProfile();
			await saveWeight(test.db, { date: '2026-10-01', kg: 72 });
			await test.db
				.insert(weeklyTargets)
				.values([
					storedRow('2026-09-28', { targetKcal: 2700 }),
					storedRow('2026-10-05', { targetKcal: 2800 }),
					storedRow('2026-10-19', { targetKcal: 2900 })
				]);
		});

		async function kcalOn(date: string, today = SAT) {
			return (await targetFor(await ctx(today), date)).targetKcal;
		}

		it('is the row of its week', async () => {
			expect(await kcalOn('2026-10-25')).toBe(2900);
		});

		it('is the latest earlier row in a week without one', async () => {
			expect(await kcalOn('2026-10-14')).toBe(2800);
		});

		it('is the earliest row before the first one', async () => {
			expect(await kcalOn('2026-09-20')).toBe(2700);
		});

		it('is this week’s row for a date in a later week, which has none yet', async () => {
			expect((await targetFor(await ctx(SAT), '2026-11-16')).weekStart).toBe(MON);
		});

		it('makes this week’s row first, and a past date still reads its own week', async () => {
			await kcalOn('2026-10-25');
			expect((await rows()).map((row) => row.weekStart)).toEqual([
				'2026-09-28',
				'2026-10-05',
				'2026-10-19',
				MON
			]);
		});

		it('falls back to the stored rows when there is no weigh-in to make this week’s', async () => {
			await test.db.delete(weights);
			expect(await kcalOn(WED)).toBe(2900);
			expect(await rows()).toHaveLength(3);
		});

		it('fails without any weigh-in or row', async () => {
			await test.db.delete(weights);
			await test.db.delete(weeklyTargets);
			await expect(targetFor(await ctx(SAT), WED)).rejects.toBeInstanceOf(NoWeighInError);
		});
	});

	it('lists stored rows newest week first, the latest few when limited', async () => {
		await test.db
			.insert(weeklyTargets)
			.values([storedRow('2026-10-05'), storedRow(LAST_WEEK), storedRow('2026-10-19')]);

		expect((await targetsHistory(test.db)).map((row) => row.weekStart)).toEqual([
			LAST_WEEK,
			'2026-10-19',
			'2026-10-05'
		]);
		expect((await targetsHistory(test.db, 2)).map((row) => row.weekStart)).toEqual([
			LAST_WEEK,
			'2026-10-19'
		]);
	});
});
