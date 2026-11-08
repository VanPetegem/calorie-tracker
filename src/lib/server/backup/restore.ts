import { BACKUP_TABLES, BACKUP_VERSION } from './format.ts';

const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

function literal(value: unknown, where: string): string {
	if (value === null) return 'NULL';
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new Error(`${where} is not a finite number`);
		return String(value);
	}
	if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
	throw new Error(`${where} has an unsupported value type (${typeof value})`);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The SQL that replaces every app table with the contents of a backup file: deferred foreign keys, deletes in
 * reverse table order, then one insert per row in table order. Throws when the file is not a backup this repo's
 * schema (`migration`) can take.
 */
export function restoreStatements(file: unknown, migration: string): string[] {
	if (!isRecord(file)) throw new Error('Not a backup file: expected a JSON object');
	if (file.version !== BACKUP_VERSION) {
		throw new Error(
			`Unsupported backup version ${String(file.version)}, expected ${BACKUP_VERSION}`
		);
	}
	if (file.migration !== migration) {
		throw new Error(
			`Backup was made at migration ${String(file.migration)}, but the repo is at ${migration}. Check out the matching commit to restore it.`
		);
	}
	const tables = file.tables;
	if (!isRecord(tables)) throw new Error('Not a backup file: tables is missing');
	const expected: readonly string[] = BACKUP_TABLES;
	const missing = expected.filter((table) => !(table in tables));
	if (missing.length) throw new Error(`Backup is missing tables: ${missing.join(', ')}`);
	const extra = Object.keys(tables).filter((table) => !expected.includes(table));
	if (extra.length) throw new Error(`Backup has unknown tables: ${extra.join(', ')}`);

	const statements = ['PRAGMA defer_foreign_keys = true'];
	for (const table of [...BACKUP_TABLES].reverse()) {
		statements.push(`DELETE FROM ${quoteIdentifier(table)}`);
	}
	for (const table of BACKUP_TABLES) {
		const rows = tables[table];
		if (!Array.isArray(rows)) throw new Error(`Table ${table} is not an array`);
		rows.forEach((row: unknown, index) => {
			if (!isRecord(row) || Object.keys(row).length === 0) {
				throw new Error(`Table ${table} row ${index} is not an object with columns`);
			}
			const columns = Object.keys(row);
			const values = columns.map((column) =>
				literal(row[column], `${table} row ${index} ${column}`)
			);
			statements.push(
				`INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${values.join(', ')})`
			);
		});
	}
	return statements;
}

/**
 * The `migration` a restore needs: the newest tag of `drizzle/meta/_journal.json` (passed parsed) as `d1_migrations`
 * stores it, with `.sql`.
 */
export function latestMigrationFile(journal: unknown): string {
	const entries = (journal as { entries?: { tag?: unknown }[] } | null)?.entries;
	const tag = Array.isArray(entries) ? entries.at(-1)?.tag : undefined;
	if (typeof tag !== 'string' || tag === '')
		throw new Error('drizzle/meta/_journal.json has no migrations');
	return `${tag}.sql`;
}
