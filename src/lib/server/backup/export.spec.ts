import { readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedBackupRows, TRICKY_NAME, TRICKY_REAL } from '../test/backup-seed.ts';
import { createTestDb } from '../test/d1.ts';
import { readBackup, runBackup } from './export.ts';
import { BACKUP_TABLES, BACKUP_VERSION, type BackupFile } from './format.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const NOW = new Date('2026-11-09T03:00:00.000Z');

/** What `wrangler d1 migrations apply` records for the newest file in `drizzle/`, e.g. `0022_targets.sql`. */
const LATEST_MIGRATION = readdirSync(new URL('../../../../drizzle/', import.meta.url))
	.filter((name) => name.endsWith('.sql'))
	.sort()
	.at(-1);

describe('backup export', () => {
	let test: TestDb;
	beforeEach(async () => {
		test = await createTestDb();
	});
	afterEach(async () => {
		await test.dispose();
	});

	it('reads every app table with its real column names and stored values', async () => {
		await seedBackupRows(test.db);
		const file = await readBackup(test.d1, NOW);

		expect(file).toMatchObject({
			version: BACKUP_VERSION,
			createdAt: '2026-11-09T03:00:00.000Z'
		});
		expect(Object.keys(file.tables)).toEqual([...BACKUP_TABLES]);
		for (const table of BACKUP_TABLES) {
			expect(file.tables[table].length, table).toBeGreaterThan(0);
		}
		expect(file.tables.foods.find((row) => row.id === 'a-food')).toMatchObject({
			name: TRICKY_NAME,
			brand: null,
			nutrition_basis: 'g',
			search_text: TRICKY_NAME.toLowerCase(),
			kcal: TRICKY_REAL,
			fiber: 1.5
		});
		expect(file.tables.weights).toEqual([
			expect.objectContaining({ date: '2026-11-02', kg: 61.4, created_at: expect.any(String) })
		]);
		expect(file.tables.weekly_targets[0]).toMatchObject({
			week_start: '2026-11-02',
			tdee_adaptive: null,
			carbs_floored: 1
		});
		expect(file.tables.log_entries[0]).toMatchObject({ food_id: 'a-food', batch_id: 'a-batch' });
	});

	it('exports a table without rows as an empty array', async () => {
		const file = await readBackup(test.d1, NOW);
		expect(file.tables.log_entries).toEqual([]);
		expect(file.tables.weights).toEqual([]);
	});

	it('takes the migration from the newest d1_migrations row, not from the code', async () => {
		expect((await readBackup(test.d1, NOW)).migration).toBe(LATEST_MIGRATION);
		await test.d1.prepare("INSERT INTO d1_migrations (name) VALUES ('0099_later.sql')").run();
		expect((await readBackup(test.d1, NOW)).migration).toBe('0099_later.sql');
	});

	it('refuses to export a database without applied migrations', async () => {
		await test.d1.prepare('DELETE FROM d1_migrations').run();
		await expect(readBackup(test.d1, NOW)).rejects.toThrow('d1_migrations is empty');
	});

	it('puts one JSON object under the date key and returns the key', async () => {
		await seedBackupRows(test.db);
		const put = vi.fn();
		const key = await runBackup(test.d1, { put } as unknown as R2Bucket, NOW);

		expect(key).toBe('backups/2026-11-09.json');
		expect(put).toHaveBeenCalledOnce();
		const [putKey, body, options] = put.mock.calls[0];
		expect(putKey).toBe(key);
		expect(options).toEqual({ httpMetadata: { contentType: 'application/json' } });
		const file = JSON.parse(body as string) as BackupFile;
		expect(file).toMatchObject({
			version: BACKUP_VERSION,
			createdAt: '2026-11-09T03:00:00.000Z'
		});
		expect(file.tables.foods.some((row) => row.id === 'a-food')).toBe(true);
	});

	it('does not catch a failed write, so the cron run fails', async () => {
		const put = vi.fn().mockRejectedValue(new Error('R2 down'));
		await expect(runBackup(test.d1, { put } as unknown as R2Bucket, NOW)).rejects.toThrow(
			'R2 down'
		);
	});
});
