import {
	MAX_AMOUNT_GRAMS_OR_ML,
	MAX_KCAL_PER_100,
	MAX_MACRO_PER_100,
	MIN_KCAL_PER_100,
	MIN_MACRO_PER_100
} from '../../domain/constants.ts';
import { perServingToPer100, type Per100 } from '../../domain/nutrition.ts';
import type { FoodInput } from '../../schemas/food.ts';
import type { MappedProduct } from '../foods/repo.ts';

export type OffProductResult =
	| { kind: 'found'; product: MappedProduct }
	| { kind: 'incomplete'; barcode: string; prefill: Partial<FoodInput> }
	| { kind: 'not_found' };

type Nutriments = Record<string, unknown>;
type CoreKey = 'kcal' | 'protein' | 'carbs' | 'fat';

/** OFF nutriment keys, without the `_100g` or `_serving` suffix. */
const KEYS = {
	kcal: 'energy-kcal',
	protein: 'proteins',
	carbs: 'carbohydrates',
	fat: 'fat',
	fiber: 'fiber'
} as const;

const NAME_MAX = 200;
const VOLUME = /\d\s*(?:ml|cl|dl|l)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** OFF sends numbers, sometimes as text. Anything else (and NaN) is missing. */
function toNumber(value: unknown): number | null {
	const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
	return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

function cleanText(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const text = value.trim().slice(0, NAME_MAX).trim();
	return text === '' ? null : text;
}

/** `brands` is a comma separated string from the product API and an array from search. */
function firstBrand(value: unknown): string | null {
	const first = Array.isArray(value)
		? value[0]
		: typeof value === 'string'
			? value.split(',')[0]
			: null;
	return cleanText(first);
}

/** ml when OFF says the product is a liquid by volume: its quantity unit, quantity or serving size. */
function basisOf(raw: Record<string, unknown>): 'g' | 'ml' {
	if (raw.product_quantity_unit === 'ml') return 'ml';
	const labels = [raw.quantity, raw.serving_size];
	return labels.some((label) => typeof label === 'string' && VOLUME.test(label)) ? 'ml' : 'g';
}

function readSet(nutriments: Nutriments, suffix: '_100g' | '_serving') {
	const read = (key: keyof typeof KEYS) => toNumber(nutriments[KEYS[key] + suffix]);
	return {
		kcal: read('kcal'),
		protein: read('protein'),
		carbs: read('carbs'),
		fat: read('fat'),
		fiber: read('fiber')
	};
}

function inRange(key: keyof typeof KEYS, value: number): boolean {
	return key === 'kcal'
		? value >= MIN_KCAL_PER_100 && value <= MAX_KCAL_PER_100
		: value >= MIN_MACRO_PER_100 && value <= MAX_MACRO_PER_100;
}

/**
 * Maps one OFF product (a product API response, its `product`, or a search hit) to our nutrition shape.
 * Per 100 values win; per serving values convert when `serving_quantity` gives the serving in g or ml.
 * Missing or out of range values make the product `incomplete`, with the plausible values as a prefill
 * for the custom food form.
 */
export function mapOffProduct(input: unknown): OffProductResult {
	if (!isRecord(input)) return { kind: 'not_found' };
	// The product API wraps the product: `{ code, status, product }`, with status 0 for an unknown barcode.
	const wrapped = 'status' in input || 'product' in input;
	if (wrapped && (input.status === 0 || !isRecord(input.product))) return { kind: 'not_found' };
	const raw = wrapped ? { code: input.code, ...(input.product as Record<string, unknown>) } : input;
	const code = typeof raw.code === 'string' ? raw.code.trim() : '';
	if (!/^\d{8,14}$/.test(code)) return { kind: 'not_found' };

	const nutriments = isRecord(raw.nutriments) ? raw.nutriments : {};
	const name = cleanText(raw.product_name);
	const brand = firstBrand(raw.brands);
	const nutritionBasis = basisOf(raw);
	const servingQuantity = toNumber(raw.serving_quantity);
	const servingG =
		servingQuantity !== null && servingQuantity > 0 && servingQuantity <= MAX_AMOUNT_GRAMS_OR_ML
			? servingQuantity
			: null;

	const core: CoreKey[] = ['kcal', 'protein', 'carbs', 'fat'];
	const hasCore = (set: ReturnType<typeof readSet>) => core.every((key) => set[key] !== null);

	let values = readSet(nutriments, '_100g');
	if (!hasCore(values)) {
		const perServing = readSet(nutriments, '_serving');
		if (servingG !== null && hasCore(perServing)) {
			const converted = perServingToPer100(perServing as Per100, servingG);
			values = {
				kcal: converted.kcal,
				protein: converted.protein,
				carbs: converted.carbs,
				fat: converted.fat,
				fiber: converted.fiber
			};
		}
	}

	const rounded = Object.fromEntries(
		Object.entries(values).map(([key, value]) => [key, value === null ? null : round2(value)])
	) as typeof values;
	const plausible = Object.fromEntries(
		(Object.keys(KEYS) as (keyof typeof KEYS)[])
			.filter((key) => rounded[key] !== null && inRange(key, rounded[key]))
			.map((key) => [key, rounded[key]])
	) as Partial<Record<keyof typeof KEYS, number>>;

	const complete = core.every((key) => plausible[key] !== undefined);
	if (complete && name !== null) {
		return {
			kind: 'found',
			product: {
				barcode: code,
				name,
				brand,
				nutritionBasis,
				per100: {
					kcal: plausible.kcal!,
					protein: plausible.protein!,
					carbs: plausible.carbs!,
					fat: plausible.fat!,
					fiber: plausible.fiber ?? null
				},
				servingG
			}
		};
	}

	const prefill: Partial<FoodInput> = { barcode: code, nutritionBasis, ...plausible };
	if (name !== null) prefill.name = name;
	if (brand !== null) prefill.brand = brand;
	if (servingG !== null) prefill.servingG = servingG;
	return { kind: 'incomplete', barcode: code, prefill };
}
