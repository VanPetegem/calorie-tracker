import type { Db } from '../db/index.ts';

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
