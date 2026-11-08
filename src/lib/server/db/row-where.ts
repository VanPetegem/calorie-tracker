import { getTableColumns, is, SQL, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

/**
 * A one row `SELECT` of `values` in `table`'s column order that yields the row only when `where` holds, for an
 * `INSERT ... SELECT` that writes nothing otherwise. A column left out of `values` takes its SQL default.
 */
export function rowWhere(table: SQLiteTable, values: Record<string, unknown>, where: SQL): SQL {
	const columns = Object.entries(getTableColumns(table)).map(([key, column]) => {
		if (key in values) return sql.param(values[key], column);
		if (is(column.default, SQL)) return column.default;
		throw new Error(`No value or SQL default for ${column.name}`);
	});
	return sql`SELECT ${sql.join(columns, sql`, `)} WHERE ${where}`;
}
