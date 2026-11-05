import { and, desc, eq, getTableColumns, isNull, notInArray, sql, type SQL } from 'drizzle-orm';
import { FREQUENTS_WINDOW_DAYS, OFF_REFRESH_AGE_DAYS } from '../../domain/constants.ts';
import { addDays } from '../../domain/dates.ts';
import type { Per100, Unit } from '../../domain/nutrition.ts';
import { normalizeSearchText, searchTokens } from '../../domain/search-text.ts';
import type { FoodInput } from '../../schemas/food.ts';
import type { Db } from '../db/index.ts';
import { foods, logEntries, type Food } from '../db/schema.ts';
import { newId } from '../id.ts';

/** A library search hit. The last amount is null for a food that was never logged. */
export type FoodHit = Food & {
	logCount: number;
	lastAmount: number | null;
	lastUnit: Unit | null;
};
export type RecentFood = Food & { lastAmount: number; lastUnit: Unit };

/** Fields a caller supplies when creating a food. Ids, search text and timestamps are generated here. */
export type FoodInsert = Omit<
	typeof foods.$inferInsert,
	'id' | 'source' | 'searchText' | 'editedAt' | 'archivedAt' | 'createdAt' | 'updatedAt'
> & { source?: Food['source'] };

/** An Open Food Facts product, already mapped to our nutrition shape. Task 5 produces it. */
export type MappedProduct = {
	barcode: string;
	name: string;
	brand: string | null;
	nutritionBasis: 'g' | 'ml';
	per100: Per100;
	servingG: number | null;
};

const DAY_MS = 86_400_000;

/** Escapes LIKE wildcards and the escape character itself. Pair with `ESCAPE '\'`. */
function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, '\\$&');
}

const like = (column: SQL | typeof foods.searchText, pattern: string) =>
	sql`${column} LIKE ${pattern} ESCAPE '\\'`;

/** The amount and unit of a food's most recent food entry. */
const lastEntryField = (field: 'amount' | 'unit') =>
	sql.raw(
		`(select l.${field} from log_entries l where l.food_id = foods.id and l.kind = 'food' and l.deleted_at is null order by l.logged_at desc, l.id desc limit 1)`
	);

const recentColumns = {
	...getTableColumns(foods),
	lastAmount: sql<number>`${lastEntryField('amount')}`,
	lastUnit: sql<Unit>`${lastEntryField('unit')}`
};

/** D1 rejects LIKE patterns over 50 bytes; a token plus its two `%` stays under that with room to spare. */
const MAX_TOKEN_BYTES = 40;

/** Cuts a token to `MAX_TOKEN_BYTES` UTF-8 bytes without splitting a character. */
function capToken(token: string): string {
	const encoder = new TextEncoder();
	let bytes = 0;
	let end = 0;
	for (const char of token) {
		bytes += encoder.encode(char).length;
		if (bytes > MAX_TOKEN_BYTES) break;
		end += char.length;
	}
	return token.slice(0, end);
}

/** Library foods matching every word of the query, best matches first. Archived foods are hidden. */
export async function searchLibrary(db: Db, query: string, limit = 20): Promise<FoodHit[]> {
	const tokens = searchTokens(query).map(capToken);
	if (tokens.length === 0) return [];
	// Qualified by hand: Drizzle drops the table name from `foods.id` in a select, which would bind to `log_entries.id`.
	const logCount = sql<number>`(select count(*) from log_entries l where l.food_id = foods.id and l.deleted_at is null)`;
	return db
		.select({
			...getTableColumns(foods),
			lastAmount: sql<number | null>`${lastEntryField('amount')}`,
			lastUnit: sql<Unit | null>`${lastEntryField('unit')}`,
			logCount
		})
		.from(foods)
		.where(
			and(
				isNull(foods.archivedAt),
				...tokens.map((token) => like(foods.searchText, `%${escapeLike(token)}%`))
			)
		)
		.orderBy(
			// Search text starts with the name, so a prefix match on it means the name starts with the token.
			sql`case when ${like(foods.searchText, `${escapeLike(tokens[0])}%`)} then 0 else 1 end`,
			desc(logCount),
			foods.name
		)
		.limit(limit);
}

export async function getFood(db: Db, id: string): Promise<Food | null> {
	const [row] = await db.select().from(foods).where(eq(foods.id, id)).limit(1);
	return row ?? null;
}

/** Includes archived foods, because the barcode index is unique across all of them. */
export async function getFoodByBarcode(db: Db, barcode: string): Promise<Food | null> {
	const [row] = await db.select().from(foods).where(eq(foods.barcode, barcode)).limit(1);
	return row ?? null;
}

export async function createFood(db: Db, input: FoodInsert): Promise<Food> {
	const [row] = await db
		.insert(foods)
		.values({
			...input,
			id: newId(),
			source: input.source ?? 'custom',
			searchText: normalizeSearchText(input.name, input.brand)
		})
		.returning();
	return row;
}

/** Edits a food. Foods that did not originate with the user get `edited_at`, so refreshes leave them alone. */
export async function updateFood(db: Db, id: string, input: FoodInput): Promise<Food> {
	const existing = await getFood(db, id);
	if (!existing) throw new Error('Food not found');
	// BLV foods carry German and French names (and OFF foods any alias) in their search text; saving must not drop them.
	const searchText =
		existing.source === 'custom'
			? normalizeSearchText(input.name, input.brand)
			: [
					...new Set(
						`${normalizeSearchText(input.name, input.brand)} ${existing.searchText}`
							.split(' ')
							.filter(Boolean)
					)
				].join(' ');
	const [row] = await db
		.update(foods)
		.set({
			...input,
			searchText,
			...(existing.source === 'custom' ? {} : { editedAt: new Date().toISOString() })
		})
		.where(eq(foods.id, id))
		.returning();
	return row;
}

/**
 * Caches an Open Food Facts product. The library wins: a food that already has the barcode is returned unchanged,
 * except an unedited OFF food older than the refresh age, which gets fresh nutrition.
 */
export async function upsertOffFood(db: Db, product: MappedProduct): Promise<Food> {
	const now = new Date();
	const existing = await getFoodByBarcode(db, product.barcode);
	if (existing) {
		const staleBefore = new Date(now.getTime() - OFF_REFRESH_AGE_DAYS * DAY_MS).toISOString();
		const stale = existing.fetchedAt === null || existing.fetchedAt < staleBefore;
		if (existing.source !== 'off' || existing.editedAt !== null || !stale) return existing;
		const [row] = await db
			.update(foods)
			.set({
				...product.per100,
				nutritionBasis: product.nutritionBasis,
				servingG: product.servingG,
				fetchedAt: now.toISOString()
			})
			.where(eq(foods.id, existing.id))
			.returning();
		return row;
	}
	return createFood(db, {
		source: 'off',
		sourceRef: product.barcode,
		barcode: product.barcode,
		name: product.name,
		brand: product.brand,
		nutritionBasis: product.nutritionBasis,
		...product.per100,
		servingG: product.servingG,
		fetchedAt: now.toISOString()
	});
}

export async function unarchiveFood(db: Db, id: string): Promise<void> {
	await db.update(foods).set({ archivedAt: null }).where(eq(foods.id, id));
}

/** Distinct foods, most recently logged first. */
export async function recents(db: Db, limit = 10): Promise<RecentFood[]> {
	return db
		.select(recentColumns)
		.from(logEntries)
		.innerJoin(foods, eq(foods.id, logEntries.foodId))
		.where(and(eq(logEntries.kind, 'food'), isNull(logEntries.deletedAt), isNull(foods.archivedAt)))
		.groupBy(foods.id)
		.orderBy(desc(sql`max(${logEntries.loggedAt})`))
		.limit(limit);
}

/** Foods logged most often over the last 30 days, minus the excluded ids (usually the recents). */
export async function frequents(
	db: Db,
	today: string,
	limit = 10,
	exclude: string[] = []
): Promise<RecentFood[]> {
	const count = sql`count(*)`;
	return db
		.select(recentColumns)
		.from(logEntries)
		.innerJoin(foods, eq(foods.id, logEntries.foodId))
		.where(
			and(
				eq(logEntries.kind, 'food'),
				isNull(logEntries.deletedAt),
				isNull(foods.archivedAt),
				sql`${logEntries.date} > ${addDays(today, -FREQUENTS_WINDOW_DAYS)}`,
				exclude.length > 0 ? notInArray(foods.id, exclude) : undefined
			)
		)
		.groupBy(foods.id)
		.orderBy(desc(count), desc(sql`max(${logEntries.loggedAt})`))
		.limit(limit);
}
