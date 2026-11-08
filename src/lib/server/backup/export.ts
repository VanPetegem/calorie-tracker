import journal from '../../../../drizzle/meta/_journal.json';
import {
	BACKUP_TABLES,
	BACKUP_VERSION,
	backupKey,
	type BackupFile,
	type BackupRow
} from './format.ts';

const latest = journal.entries.at(-1);
if (!latest) throw new Error('drizzle/meta/_journal.json has no migrations');

/** The tag of the newest migration, e.g. `0022_targets`. CI migrates before it deploys, so production matches it. */
export const LATEST_MIGRATION: string = latest.tag;

/** Every app table as D1 stores it, read in one batch so the snapshot is consistent. */
export async function readBackup(
	d1: D1Database,
	migration: string,
	now: Date
): Promise<BackupFile> {
	const results = await d1.batch<BackupRow>(
		BACKUP_TABLES.map((table) => d1.prepare(`SELECT * FROM "${table}"`))
	);
	const tables = Object.fromEntries(
		BACKUP_TABLES.map((table, index) => [table, results[index].results])
	) as BackupFile['tables'];
	return { version: BACKUP_VERSION, createdAt: now.toISOString(), migration, tables };
}

/** Writes the backup to `backups/YYYY-MM-DD.json` (overwriting that day's) and returns the key. */
export async function runBackup(d1: D1Database, bucket: R2Bucket, now: Date): Promise<string> {
	const file = await readBackup(d1, LATEST_MIGRATION, now);
	const key = backupKey(now);
	await bucket.put(key, JSON.stringify(file), {
		httpMetadata: { contentType: 'application/json' }
	});
	return key;
}
