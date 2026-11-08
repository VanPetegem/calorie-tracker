import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedBackupRows, TRICKY_NAME, TRICKY_REAL } from '../test/backup-seed.ts';
import { createTestDb } from '../test/d1.ts';
import { readBackup } from './export.ts';
import { BACKUP_TABLES, BACKUP_VERSION, type BackupFile } from './format.ts';
import { restoreStatements } from './restore.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const NOW = new Date('2026-11-09T03:00:00.000Z');
const LATEST_MIGRATION = '0022_targets.sql';

describe('restore round trip', () => {
	let source: TestDb;
	let target: TestDb;
	beforeEach(async () => {
		[source, target] = await Promise.all([createTestDb(), createTestDb()]);
	});
	afterEach(async () => {
		await Promise.all([source.dispose(), target.dispose()]);
	});

	it('replaces the rows of another database with the backup, exactly', async () => {
		await seedBackupRows(source.db, 'a');
		await seedBackupRows(target.db, 'b');
		const backup = await readBackup(source.d1, NOW);
		const before = await readBackup(target.d1, NOW);
		expect(before.tables).not.toEqual(backup.tables);

		// Through JSON, as the file travels through R2.
		const file: unknown = JSON.parse(JSON.stringify(backup));
		const statements = restoreStatements(file, backup.migration);
		await target.d1.batch(statements.map((statement) => target.d1.prepare(statement)));

		const after = await readBackup(target.d1, NOW);
		expect(after.tables).toEqual(backup.tables);
		const food = after.tables.foods.find((row) => row.id === 'a-food');
		expect(food).toMatchObject({ name: TRICKY_NAME, brand: null, kcal: TRICKY_REAL });
		expect(after.tables.foods.some((row) => row.id === 'b-food')).toBe(false);
	}, 30_000);
});

describe('restoreStatements', () => {
	const emptyFile = (): BackupFile => ({
		version: BACKUP_VERSION,
		createdAt: NOW.toISOString(),
		migration: LATEST_MIGRATION,
		tables: Object.fromEntries(
			BACKUP_TABLES.map((table) => [table, []])
		) as unknown as BackupFile['tables']
	});

	it('defers foreign keys, deletes in reverse table order, then inserts in table order', () => {
		const file = emptyFile();
		file.tables.foods = [{ id: 'ox', kcal: 1.5, brand: null }];
		file.tables.weights = [{ date: '2026-11-02', kg: 61 }];
		expect(restoreStatements(file, LATEST_MIGRATION)).toEqual([
			'PRAGMA defer_foreign_keys = true',
			...[...BACKUP_TABLES].reverse().map((table) => `DELETE FROM "${table}"`),
			`INSERT INTO "foods" ("id", "kcal", "brand") VALUES ('ox', 1.5, NULL)`,
			`INSERT INTO "weights" ("date", "kg") VALUES ('2026-11-02', 61)`
		]);
	});

	it('refuses a file of another version', () => {
		const file = { ...emptyFile(), version: 2 };
		expect(() => restoreStatements(file, LATEST_MIGRATION)).toThrow('Unsupported backup version 2');
	});

	it('refuses a file made at another migration', () => {
		const file = { ...emptyFile(), migration: '0001_old' };
		expect(() => restoreStatements(file, LATEST_MIGRATION)).toThrow(
			`migration 0001_old, but the repo is at ${LATEST_MIGRATION}`
		);
	});

	it('refuses a file with a missing or unknown table', () => {
		const missing = emptyFile() as { tables: Record<string, unknown> };
		delete missing.tables.weights;
		expect(() => restoreStatements(missing, LATEST_MIGRATION)).toThrow('missing tables: weights');
		const extra = emptyFile() as { tables: Record<string, unknown> };
		extra.tables.user = [];
		expect(() => restoreStatements(extra, LATEST_MIGRATION)).toThrow('unknown tables: user');
	});

	it('refuses a table that is not an array and values that are not SQL literals', () => {
		const notArray = emptyFile() as { tables: Record<string, unknown> };
		notArray.tables.foods = {};
		expect(() => restoreStatements(notArray, LATEST_MIGRATION)).toThrow(
			'Table foods is not an array'
		);
		const infinite = emptyFile();
		infinite.tables.weights = [{ date: 'x', kg: Infinity }];
		expect(() => restoreStatements(infinite, LATEST_MIGRATION)).toThrow('not a finite number');
		const boolean = emptyFile() as { tables: Record<string, unknown> };
		boolean.tables.weights = [{ date: 'x', kg: true }];
		expect(() => restoreStatements(boolean, LATEST_MIGRATION)).toThrow('unsupported value type');
	});

	it('refuses anything that is not a backup object', () => {
		expect(() => restoreStatements(null, LATEST_MIGRATION)).toThrow('expected a JSON object');
		expect(() => restoreStatements([], LATEST_MIGRATION)).toThrow('expected a JSON object');
	});
});
