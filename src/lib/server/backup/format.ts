// The weekly R2 backup file (docs/superpowers/specs/2026-11-08-phase-5a-backup-design.md). No imports, so the
// restore script can load it with node's type stripping.

export const BACKUP_VERSION = 1;

/** Every table in `schema.ts`, in insertion order: a table comes after every table it references. */
export const BACKUP_TABLES = [
	'foods',
	'recipes',
	'containers',
	'batches',
	'recipe_ingredients',
	'batch_ingredients',
	'log_entries',
	'weights',
	'settings',
	'weekly_targets'
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/** One row as D1 returns it from `SELECT *`: real column names, stored SQLite values. */
export type BackupRow = Record<string, string | number | null>;

export type BackupFile = {
	version: typeof BACKUP_VERSION;
	createdAt: string;
	/** The latest drizzle journal tag when the backup was made, e.g. `0022_targets`. */
	migration: string;
	tables: Record<BackupTable, BackupRow[]>;
};

/** `backups/YYYY-MM-DD.json`, the UTC date of `date`. */
export const backupKey = (date: Date): string => `backups/${date.toISOString().slice(0, 10)}.json`;
