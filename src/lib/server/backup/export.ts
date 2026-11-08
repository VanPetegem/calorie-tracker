import {
	BACKUP_TABLES,
	BACKUP_VERSION,
	backupKey,
	type BackupFile,
	type BackupRow
} from './format.ts';

/**
 * Every app table as D1 stores it, plus the newest applied migration (wrangler's `d1_migrations`, e.g.
 * `0022_targets.sql`), read in one batch so the snapshot is consistent. The tag comes from the database, so it
 * is right even when the deployed code is newer than the last migration.
 */
export async function readBackup(d1: D1Database, now: Date): Promise<BackupFile> {
	const results = await d1.batch<BackupRow>([
		...BACKUP_TABLES.map((table) => d1.prepare(`SELECT * FROM "${table}"`)),
		d1.prepare('SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1')
	]);
	const migration = results[BACKUP_TABLES.length].results[0]?.name;
	if (typeof migration !== 'string') {
		throw new Error('d1_migrations is empty: no migration has been applied to this database');
	}
	const tables = Object.fromEntries(
		BACKUP_TABLES.map((table, index) => [table, results[index].results])
	) as BackupFile['tables'];
	return { version: BACKUP_VERSION, createdAt: now.toISOString(), migration, tables };
}

/** Writes the backup to `backups/YYYY-MM-DD.json` (overwriting that day's) and returns the key. */
export async function runBackup(d1: D1Database, bucket: R2Bucket, now: Date): Promise<string> {
	const file = await readBackup(d1, now);
	const key = backupKey(now);
	await bucket.put(key, JSON.stringify(file), {
		httpMetadata: { contentType: 'application/json' }
	});
	return key;
}
