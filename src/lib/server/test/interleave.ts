import type { Db } from '../db/index.ts';
import { settings } from '../db/schema.ts';

/**
 * `db` whose `batch` first awaits `interleave` (which must use the real `db`) on each of its first `times` calls: a
 * write that lands between a save's read and its batch, deterministically.
 */
export function interleaved(db: Db, interleave: () => Promise<unknown>, times = Infinity): Db {
	let left = times;
	const batch: Db['batch'] = async (queries) => {
		if (left-- > 0) await interleave();
		return db.batch(queries);
	};
	return new Proxy(db, {
		get: (target, key, receiver) => (key === 'batch' ? batch : Reflect.get(target, key, receiver))
	});
}

/**
 * `db` whose first read of the settings table first awaits `interleave` (which must use the real `db`): a write that
 * lands just before a save reads the settings, after any read started alongside it.
 */
export function beforeSettingsRead(db: Db, interleave: () => Promise<unknown>): Db {
	let pending = true;
	const select = ((...args: Parameters<Db['select']>) => {
		const builder = db.select(...args);
		const from = builder.from.bind(builder);
		builder.from = ((table: Parameters<typeof from>[0]) => {
			const query = from(table);
			if (table !== settings || !pending) return query;
			pending = false;
			const then = query.then.bind(query);
			query.then = ((onfulfilled, onrejected) =>
				interleave().then(() => then(onfulfilled, onrejected))) as typeof query.then;
			return query;
		}) as typeof builder.from;
		return builder;
	}) as Db['select'];
	return new Proxy(db, {
		get: (target, key, receiver) => (key === 'select' ? select : Reflect.get(target, key, receiver))
	});
}
