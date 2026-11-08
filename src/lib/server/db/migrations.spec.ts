import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../test/d1.ts';

/** The last migration before batches. Everything up to 4a must keep the data written up to here. */
const BEFORE_BATCHES = '0019';
/** The last migration of 4a (weights). 4b rebuilds settings after it. */
const BEFORE_TARGETS = '0021';

const FOOD_ID = '019a5b2e-0000-7000-8000-000000000001';
const ARCHIVED_FOOD_ID = '019a5b2e-0000-7000-8000-000000000002';
const RECIPE_ID = '019a5b2e-0000-7000-8000-000000000003';

/** The settings row with a manual target, as phases 2 to 4a wrote it. */
const manualTargetSettings = (timezone: string) =>
	`INSERT INTO settings (id, timezone, manual_target_kcal, manual_weight_kg) VALUES (1, '${timezone}', 2800, 72.5)`;

/**
 * Rows as phase 3a wrote them, settings aside, in plain SQL so they do not depend on the current Drizzle schema.
 */
const SEED = [
	`INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
	 VALUES ('u1', 'A', 'a@example.com', 0, 1762400000000, 1762400000000)`,
	`INSERT INTO foods (id, source, name, brand, nutrition_basis, kcal, protein, carbs, fat, fiber, serving_g, search_text,
	   created_at, updated_at)
	 VALUES ('${FOOD_ID}', 'custom', 'Oats', 'Mill', 'g', 370, 13, 59, 7, 10, 40, 'oats mill',
	   '2026-11-01T08:00:00.000Z', '2026-11-02T08:00:00.000Z')`,
	`INSERT INTO foods (id, source, name, nutrition_basis, kcal, protein, carbs, fat, search_text, archived_at)
	 VALUES ('${ARCHIVED_FOOD_ID}', 'custom', 'Milk', 'ml', 64, 3.3, 4.8, 3.5, 'milk', '2026-11-03T08:00:00.000Z')`,
	`INSERT INTO recipes (id, name, default_portions, notes, created_at, updated_at)
	 VALUES ('${RECIPE_ID}', 'Porridge', 2, 'Stir', '2026-11-04T08:00:00.000Z', '2026-11-04T09:00:00.000Z')`,
	`INSERT INTO recipe_ingredients (id, recipe_id, food_id, amount, unit, grams, position) VALUES
	 ('019a5b2e-0000-7000-8000-000000000010', '${RECIPE_ID}', '${FOOD_ID}', 2, 'serving', 80, 0),
	 ('019a5b2e-0000-7000-8000-000000000011', '${RECIPE_ID}', '${ARCHIVED_FOOD_ID}', 300, 'ml', 300, 1)`,
	// A food entry, a soft deleted food entry, a quick entry with every value and one with only kcal.
	`INSERT INTO log_entries (id, date, logged_at, kind, food_id, batch_id, amount, unit, grams, label, kcal, protein,
	   carbs, fat, fiber, deleted_at) VALUES
	 ('019a5b2e-0000-7000-8000-000000000020', '2026-11-05', '2026-11-05T07:30:00.000Z', 'food', '${FOOD_ID}', NULL,
	   1.5, 'serving', 60, 'Oats', 222.4, 7.8, 35.4, 4.2, 6, NULL),
	 ('019a5b2e-0000-7000-8000-000000000021', '2026-11-05', '2026-11-05T08:00:00.000Z', 'food', '${ARCHIVED_FOOD_ID}',
	   NULL, 200, 'ml', 200, 'Milk', 128.3, 6.6, 9.6, 7, NULL, '2026-11-05T08:05:00.000Z'),
	 ('019a5b2e-0000-7000-8000-000000000022', '2026-11-04', '2026-11-04T19:00:00.000Z', 'quick', NULL, NULL, NULL,
	   NULL, NULL, 'Pizza', 900, 35, 100, 38, NULL, NULL),
	 ('019a5b2e-0000-7000-8000-000000000023', '2026-11-04', '2026-11-04T20:00:00.000Z', 'quick', NULL, NULL, NULL,
	   NULL, NULL, NULL, 150, 0, 0, 0, NULL, '2026-11-04T20:01:00.000Z')`
];

type Row = Record<string, unknown>;

async function all(test: TestDb, sql: string): Promise<Row[]> {
	return (await test.d1.prepare(sql).all<Row>()).results;
}

/** Every table, index and trigger with its SQL, leaving out SQLite's, Miniflare's and wrangler's own. */
async function objects(test: TestDb): Promise<Map<string, unknown>> {
	const rows = await all(
		test,
		`SELECT type, name, sql FROM sqlite_master
		 WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name`
	);
	return new Map(rows.map((row) => [`${row.type} ${row.name}`, row.sql]));
}

/** Every row of every table, each table's rows in a stable order. */
async function contents(test: TestDb): Promise<Record<string, Row[]>> {
	const tables = [...(await objects(test)).keys()]
		.filter((key) => key.startsWith('table '))
		.map((key) => key.slice('table '.length));
	const result: Record<string, Row[]> = {};
	for (const table of tables) {
		const rows = await all(test, `SELECT * FROM "${table}"`);
		result[table] = rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
	}
	return result;
}

describe('migrations after 3a, up to 4a', () => {
	let test: TestDb;
	let before: { objects: Map<string, unknown>; contents: Record<string, Row[]>; columns: Row[] };

	beforeAll(async () => {
		test = await createTestDb({ through: BEFORE_BATCHES });
		const seed = [manualTargetSettings('Europe/Zurich'), ...SEED];
		await test.d1.batch(seed.map((sql) => test.d1.prepare(sql)));
		before = {
			objects: await objects(test),
			contents: await contents(test),
			columns: await all(test, 'PRAGMA table_info(log_entries)')
		};
		await test.migrateRest({ through: BEFORE_TARGETS });
	});
	afterAll(async () => {
		await test.dispose();
	});

	// With keys enforced, a migration that leaves a broken key fails as a whole at its commit, so no test runs
	// `PRAGMA foreign_key_check` afterwards: it could not fail.
	it('run with foreign keys enforced, as on D1', async () => {
		expect(await all(test, 'PRAGMA foreign_keys')).toEqual([{ foreign_keys: 1 }]);
	});

	it('keep every row and value of every existing table', async () => {
		expect(before.contents.log_entries).toHaveLength(4);
		const after = await contents(test);
		for (const [table, rows] of Object.entries(before.contents)) {
			expect(after[table], table).toEqual(rows);
		}
	});

	it('keep the columns of log_entries', async () => {
		expect(await all(test, 'PRAGMA table_info(log_entries)')).toEqual(before.columns);
	});

	it('keep every index and trigger, and every table but log_entries as it was', async () => {
		const after = await objects(test);
		for (const [key, sql] of before.objects) {
			if (key === 'table log_entries') continue;
			expect(after.get(key), key).toEqual(sql);
		}
		expect(after.has('trigger user_single_account')).toBe(true);
	});

	const noAction = { on_delete: 'NO ACTION', on_update: 'NO ACTION' };

	it('make log_entries.batch_id a reference to batches, with an index', async () => {
		const keys = await all(test, 'PRAGMA foreign_key_list(log_entries)');
		expect(keys).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ ...noAction, table: 'batches', from: 'batch_id', to: 'id' }),
				expect.objectContaining({ ...noAction, table: 'foods', from: 'food_id', to: 'id' })
			])
		);
		const indexes = (await all(test, 'PRAGMA index_list(log_entries)')).map((row) => row.name);
		expect(indexes).toContain('log_entries_batch_id_idx');
	});

	it('add the indexes for batches and for recipes by food', async () => {
		const indexes = [...(await objects(test)).keys()];
		expect(indexes).toEqual(
			expect.arrayContaining([
				'index batches_finished_at_idx',
				'index batch_ingredients_batch_id_position_idx',
				'index recipe_ingredients_food_id_idx'
			])
		);
	});
});

describe('migrations after 4a', () => {
	let test: TestDb;
	let before: { objects: Map<string, unknown>; contents: Record<string, Row[]> };

	beforeAll(async () => {
		test = await createTestDb({ through: BEFORE_TARGETS });
		// Not the default timezone, so a row recreated with defaults cannot pass for the kept one.
		const seed = [
			manualTargetSettings('America/New_York'),
			...SEED,
			`INSERT INTO weights (date, kg, created_at, updated_at)
			 VALUES ('2026-11-06', 72.4, '2026-11-06T07:00:00.000Z', '2026-11-06T07:00:00.000Z')`
		];
		await test.d1.batch(seed.map((sql) => test.d1.prepare(sql)));
		before = { objects: await objects(test), contents: await contents(test) };
		await test.migrateRest();
	});
	afterAll(async () => {
		await test.dispose();
	});

	it('keep the settings row and its timezone, drop the manual target and add the defaults', async () => {
		expect(await all(test, 'SELECT * FROM settings')).toEqual([
			{
				id: 1,
				timezone: 'America/New_York',
				sex: null,
				birth_date: null,
				height_cm: null,
				activity_level: null,
				goal_rate_pct: 0.35,
				protein_g_per_kg: 1.8,
				fat_pct: 0.25,
				energy_density_kcal_per_kg: 5000
			}
		]);
	});

	it.each([
		['settings_single_row', 'id = 2'],
		['settings_sex', "sex = 'other'"],
		['settings_activity_level', "activity_level = 'extreme'"],
		['settings_height_cm_range', 'height_cm = 50'],
		['settings_goal_rate', 'goal_rate_pct = 0.4'],
		['settings_protein_g_per_kg_range', 'protein_g_per_kg = 5'],
		['settings_fat_pct_range', 'fat_pct = 0.9'],
		['settings_energy_density_range', 'energy_density_kcal_per_kg = 9000']
	])('keep the rebuilt settings check %s', async (name, change) => {
		await expect(test.d1.prepare(`UPDATE settings SET ${change}`).run()).rejects.toThrow(name);
	});

	it('keep every other table, its rows and every index and trigger as they were', async () => {
		expect(before.contents.weights).toHaveLength(1);
		const after = await contents(test);
		const afterObjects = await objects(test);
		for (const [table, rows] of Object.entries(before.contents)) {
			if (table === 'settings') continue;
			expect(after[table], table).toEqual(rows);
		}
		for (const [key, sql] of before.objects) {
			if (key === 'table settings') continue;
			expect(afterObjects.get(key), key).toEqual(sql);
		}
	});
});
