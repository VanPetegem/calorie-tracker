import {
	MAX_KCAL_PER_100,
	MAX_MACRO_PER_100,
	MIN_KCAL_PER_100,
	MIN_MACRO_PER_100
} from '../src/lib/domain/constants.ts';
import { normalizeSearchText } from '../src/lib/domain/search-text.ts';
import type { FoodInsert } from '../src/lib/server/foods/repo.ts';

/** Keys a BLV row is read by. `import-blv.ts` fills a row per ID from the English, German and French sheets. */
export type BlvColumns = {
	id: string;
	name: string;
	synonyms: string;
	nameDe: string;
	synonymsDe: string;
	nameFr: string;
	synonymsFr: string;
	kcal: string;
	protein: string;
	carbs: string;
	fat: string;
	fiber: string;
};

export const BLV_COLUMNS: BlvColumns = {
	id: 'id',
	name: 'name',
	synonyms: 'synonyms',
	nameDe: 'nameDe',
	synonymsDe: 'synonymsDe',
	nameFr: 'nameFr',
	synonymsFr: 'synonymsFr',
	kcal: 'kcal',
	protein: 'protein',
	carbs: 'carbs',
	fat: 'fat',
	fiber: 'fiber'
};

export type BlvFood = FoodInsert & { searchText: string };

/**
 * A BLV cell as a number. Trace markers (`tr.`, `Sp.`, `<0.5`) read as 0; anything else that is not a number
 * (`n.d.`, `k.A.`, `n.i.`, empty) is undetermined and gives null.
 */
function readAmount(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value !== 'string') return null;
	const text = value.trim();
	if (/^(tr\.?|sp\.?|<\s*\d+([.,]\d+)?)$/i.test(text)) return 0;
	return null;
}

function readText(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	return value.trim() || null;
}

/** Drops repeated words, keeping first occurrences, so a name shared by three languages is stored once. */
const uniqueWords = (text: string): string => [...new Set(text.split(' '))].join(' ');

const inRange = (value: number | null, min: number, max: number): value is number =>
	value !== null && value >= min && value <= max;

/**
 * Maps one BLV generic food to a library food, or null when kcal, protein, carbs or fat is missing or outside
 * the per 100 limits. Fiber stays null when undetermined. BLV values are per 100 g edible portion.
 */
export function mapBlvRow(row: Record<string, unknown>, columns: BlvColumns): BlvFood | null {
	const id = row[columns.id];
	const sourceRef = typeof id === 'number' || typeof id === 'string' ? String(id).trim() : '';
	const name = readText(row[columns.name]) ?? readText(row[columns.nameDe]);
	if (!sourceRef || !name) return null;

	const kcal = readAmount(row[columns.kcal]);
	const protein = readAmount(row[columns.protein]);
	const carbs = readAmount(row[columns.carbs]);
	const fat = readAmount(row[columns.fat]);
	if (!inRange(kcal, MIN_KCAL_PER_100, MAX_KCAL_PER_100)) return null;
	if (!inRange(protein, MIN_MACRO_PER_100, MAX_MACRO_PER_100)) return null;
	if (!inRange(carbs, MIN_MACRO_PER_100, MAX_MACRO_PER_100)) return null;
	if (!inRange(fat, MIN_MACRO_PER_100, MAX_MACRO_PER_100)) return null;

	const fiberAmount = readAmount(row[columns.fiber]);
	const fiber = inRange(fiberAmount, MIN_MACRO_PER_100, MAX_MACRO_PER_100) ? fiberAmount : null;

	return {
		source: 'blv',
		sourceRef,
		name,
		brand: null,
		nutritionBasis: 'g',
		kcal,
		protein,
		carbs,
		fat,
		fiber,
		searchText: uniqueWords(
			normalizeSearchText(
				name,
				...[
					columns.synonyms,
					columns.nameDe,
					columns.synonymsDe,
					columns.nameFr,
					columns.synonymsFr
				].map((key) => readText(row[key]))
			)
		)
	};
}

/**
 * Splits SQL statements, in order, into chunks of at most `maxBytes` UTF-8 bytes of statement text. A statement
 * larger than the limit gets a chunk of its own.
 */
export function chunkStatements(statements: string[], maxBytes: number): string[][] {
	const encoder = new TextEncoder();
	const chunks: string[][] = [];
	let current: string[] = [];
	let size = 0;
	for (const statement of statements) {
		const bytes = encoder.encode(statement).length;
		if (current.length > 0 && size + bytes > maxBytes) {
			chunks.push(current);
			current = [];
			size = 0;
		}
		current.push(statement);
		size += bytes;
	}
	if (current.length > 0) chunks.push(current);
	return chunks;
}
