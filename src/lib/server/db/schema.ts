import { sql } from 'drizzle-orm';
import {
	type AnySQLiteColumn,
	check,
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { MAX_WEIGHT_KG, MIN_WEIGHT_KG } from '../../domain/constants.ts';

export * from './auth.schema';

/** Current UTC time as an ISO string, matching `Date.prototype.toISOString`. */
const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/** Nutrition values are per 100 g, or per 100 ml when `nutritionBasis` is `ml`. */
export const foods = sqliteTable(
	'foods',
	{
		id: text('id').primaryKey(),
		source: text('source', { enum: ['custom', 'blv', 'off'] }).notNull(),
		barcode: text('barcode'),
		name: text('name').notNull(),
		brand: text('brand'),
		nutritionBasis: text('nutrition_basis', { enum: ['g', 'ml'] })
			.notNull()
			.default('g'),
		kcal: real('kcal').notNull(),
		protein: real('protein').notNull(),
		carbs: real('carbs').notNull(),
		fat: real('fat').notNull(),
		fiber: real('fiber'),
		servingG: real('serving_g'),
		sourceRef: text('source_ref'),
		/** Lowercased name, brand and alternate names without diacritics; search matches on it. */
		searchText: text('search_text').notNull(),
		fetchedAt: text('fetched_at'),
		/** Set when the user edits an OFF or BLV food, so refreshes and re-imports leave it alone. */
		editedAt: text('edited_at'),
		archivedAt: text('archived_at'),
		createdAt: text('created_at').notNull().default(nowIso),
		updatedAt: text('updated_at')
			.notNull()
			.default(nowIso)
			.$onUpdate(() => new Date().toISOString())
	},
	(table) => [
		uniqueIndex('foods_barcode_unique').on(table.barcode),
		uniqueIndex('foods_source_source_ref_unique').on(table.source, table.sourceRef),
		index('foods_search_text_idx').on(table.searchText)
	]
);

/** One logged item. Nutrition is a snapshot taken when logging, never recomputed from the food. */
export const logEntries = sqliteTable(
	'log_entries',
	{
		id: text('id').primaryKey(),
		/** Local calendar date (`YYYY-MM-DD`) in the settings timezone. */
		date: text('date').notNull(),
		loggedAt: text('logged_at').notNull(),
		kind: text('kind', { enum: ['food', 'batch', 'quick'] }).notNull(),
		foodId: text('food_id').references(() => foods.id),
		/** No cascade: a batch with live entries cannot be deleted. */
		batchId: text('batch_id').references((): AnySQLiteColumn => batches.id),
		amount: real('amount'),
		unit: text('unit', { enum: ['g', 'ml', 'portion', 'serving'] }),
		/** Gram equivalent of `amount` for food entries, so an edit that switches unit still scales correctly. */
		grams: real('grams'),
		label: text('label'),
		kcal: real('kcal').notNull(),
		protein: real('protein').notNull(),
		carbs: real('carbs').notNull(),
		fat: real('fat').notNull(),
		fiber: real('fiber'),
		/** Set when the entry is deleted, so Undo can bring the same row back. Reads skip these rows. */
		deletedAt: text('deleted_at')
	},
	(table) => [
		index('log_entries_date_idx').on(table.date),
		index('log_entries_food_id_logged_at_idx').on(table.foodId, table.loggedAt),
		index('log_entries_batch_id_idx').on(table.batchId)
	]
);

/** A recipe is a template: its nutrition is computed from the current foods whenever it is read. */
export const recipes = sqliteTable(
	'recipes',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		defaultPortions: real('default_portions').notNull(),
		notes: text('notes'),
		/** Recipes are archived instead of deleted, because batches reference them. */
		archivedAt: text('archived_at'),
		createdAt: text('created_at').notNull().default(nowIso),
		updatedAt: text('updated_at')
			.notNull()
			.default(nowIso)
			.$onUpdate(() => new Date().toISOString())
	},
	(table) => [check('recipes_default_portions_positive', sql`${table.defaultPortions} > 0`)]
);

/** One line of a recipe. Amount and unit are kept as entered ("2 servings"); grams is their gram equivalent. */
export const recipeIngredients = sqliteTable(
	'recipe_ingredients',
	{
		id: text('id').primaryKey(),
		recipeId: text('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		/** No cascade: a food used by a recipe cannot be deleted, only archived. */
		foodId: text('food_id')
			.notNull()
			.references(() => foods.id),
		amount: real('amount').notNull(),
		unit: text('unit', { enum: ['g', 'ml', 'serving'] }).notNull(),
		grams: real('grams').notNull(),
		position: integer('position').notNull()
	},
	(table) => [
		index('recipe_ingredients_recipe_id_position_idx').on(table.recipeId, table.position),
		index('recipe_ingredients_food_id_idx').on(table.foodId)
	]
);

/** A container the user weighs batches in. Hard deleted: batches store the net weight, not the container. */
export const containers = sqliteTable(
	'containers',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		tareG: real('tare_g').notNull(),
		createdAt: text('created_at').notNull().default(nowIso)
	},
	(table) => [check('containers_tare_positive', sql`${table.tareG} > 0`)]
);

/**
 * A cooked batch, from a recipe or one off. Its totals are the sum of its ingredients' snapshots, so editing a food
 * or the recipe never changes it.
 */
export const batches = sqliteTable(
	'batches',
	{
		id: text('id').primaryKey(),
		/** No cascade: recipes are archived, not deleted. Null for a one off batch. */
		recipeId: text('recipe_id').references(() => recipes.id),
		name: text('name').notNull(),
		/** Local calendar date (`YYYY-MM-DD`) the batch was cooked. */
		cookedOn: text('cooked_on').notNull(),
		portions: real('portions').notNull(),
		/** Net weight of the whole batch; null until it is weighed. */
		cookedWeightG: real('cooked_weight_g'),
		kcal: real('kcal').notNull(),
		protein: real('protein').notNull(),
		carbs: real('carbs').notNull(),
		fat: real('fat').notNull(),
		fiber: real('fiber'),
		finishedAt: text('finished_at'),
		createdAt: text('created_at').notNull().default(nowIso),
		updatedAt: text('updated_at')
			.notNull()
			.default(nowIso)
			.$onUpdate(() => new Date().toISOString())
	},
	(table) => [
		index('batches_finished_at_idx').on(table.finishedAt),
		check('batches_portions_positive', sql`${table.portions} > 0`),
		check(
			'batches_cooked_weight_positive',
			sql`${table.cookedWeightG} IS NULL OR ${table.cookedWeightG} > 0`
		)
	]
);

/** One line of a batch, with the food's values per 100 snapshotted when it was added. */
export const batchIngredients = sqliteTable(
	'batch_ingredients',
	{
		id: text('id').primaryKey(),
		batchId: text('batch_id')
			.notNull()
			.references(() => batches.id, { onDelete: 'cascade' }),
		/** The food it was snapshotted from; the line keeps its own name and values. */
		foodId: text('food_id').references(() => foods.id),
		name: text('name').notNull(),
		amount: real('amount').notNull(),
		unit: text('unit', { enum: ['g', 'ml', 'serving'] }).notNull(),
		grams: real('grams').notNull(),
		/** Per 100 g (or ml) of the food at the time, not the line's own nutrition. */
		kcal: real('kcal').notNull(),
		protein: real('protein').notNull(),
		carbs: real('carbs').notNull(),
		fat: real('fat').notNull(),
		fiber: real('fiber'),
		position: integer('position').notNull()
	},
	(table) => [index('batch_ingredients_batch_id_position_idx').on(table.batchId, table.position)]
);

/** One weigh-in per local calendar date; saving a date again replaces its kg. */
export const weights = sqliteTable(
	'weights',
	{
		/** Local calendar date (`YYYY-MM-DD`) in the settings timezone. */
		date: text('date').primaryKey(),
		kg: real('kg').notNull(),
		createdAt: text('created_at').notNull().default(nowIso),
		updatedAt: text('updated_at')
			.notNull()
			.default(nowIso)
			.$onUpdate(() => new Date().toISOString())
	},
	(table) => [
		check(
			'weights_kg_range',
			sql`${table.kg} BETWEEN ${sql.raw(String(MIN_WEIGHT_KG))} AND ${sql.raw(String(MAX_WEIGHT_KG))}`
		)
	]
);

/** A single row (id 1). Phase 4 adds the remaining settings columns. */
export const settings = sqliteTable(
	'settings',
	{
		id: integer('id').primaryKey().default(1),
		timezone: text('timezone').notNull().default('Europe/Zurich'),
		manualTargetKcal: real('manual_target_kcal'),
		manualWeightKg: real('manual_weight_kg')
	},
	(table) => [
		check('settings_single_row', sql`${table.id} = 1`),
		check(
			'settings_manual_target_pair',
			sql`(${table.manualTargetKcal} IS NULL) = (${table.manualWeightKg} IS NULL)`
		)
	]
);

export type Food = typeof foods.$inferSelect;
export type LogEntry = typeof logEntries.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type Container = typeof containers.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type BatchIngredient = typeof batchIngredients.$inferSelect;
export type Weight = typeof weights.$inferSelect;
