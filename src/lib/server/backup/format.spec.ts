import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { getTableName, is } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as authSchema from '../db/auth.schema.ts';
import * as schema from '../db/schema.ts';
import { BACKUP_TABLES } from './format.ts';

const tablesOf = (module: Record<string, unknown>) =>
	Object.values(module).filter((value): value is SQLiteTable => is(value, SQLiteTable));

/** `schema.ts` re-exports the auth tables, which a backup leaves out on purpose. */
const authTables = new Set(tablesOf(authSchema).map(getTableName));
const appTables = tablesOf(schema).filter((table) => !authTables.has(getTableName(table)));

describe('BACKUP_TABLES', () => {
	it('lists every app table in schema.ts, so a new table fails here until it is added', () => {
		expect([...BACKUP_TABLES].sort()).toEqual(appTables.map(getTableName).sort());
	});

	it('lists every table that a foreign key of an app table points to', () => {
		for (const table of appTables) {
			for (const foreignKey of getTableConfig(table).foreignKeys) {
				const target = getTableName(foreignKey.reference().foreignTable);
				expect(BACKUP_TABLES, `${getTableName(table)} references ${target}`).toContain(target);
			}
		}
	});

	it('puts every table after the tables it references', () => {
		for (const table of appTables) {
			const name = getTableName(table);
			for (const foreignKey of getTableConfig(table).foreignKeys) {
				const target = getTableName(foreignKey.reference().foreignTable);
				expect(
					BACKUP_TABLES.indexOf(target as (typeof BACKUP_TABLES)[number]),
					`${name} references ${target}`
				).toBeLessThan(BACKUP_TABLES.indexOf(name as (typeof BACKUP_TABLES)[number]));
			}
		}
	});
});
