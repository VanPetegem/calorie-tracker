import { describe, expect, it } from 'vitest';
import full from './fixtures/product-full.json';
import ml from './fixtures/product-ml.json';
import notFound from './fixtures/product-not-found.json';
import servingOnly from './fixtures/product-serving-only.json';
import { mapOffProduct } from './map.ts';

describe('mapOffProduct', () => {
	it('maps a product with per 100 g values', () => {
		expect(mapOffProduct(full.product)).toEqual({
			kind: 'found',
			product: {
				barcode: '3017620422003',
				name: 'Nutella',
				brand: 'Nutella',
				nutritionBasis: 'g',
				per100: { kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, fiber: 0 },
				servingG: null
			}
		});
	});

	it('uses ml as the basis for a liquid and keeps the serving size', () => {
		expect(mapOffProduct(ml.product)).toEqual({
			kind: 'found',
			product: {
				barcode: '5449000000996',
				name: 'Coca-Cola Original',
				brand: 'COCA-COLA SERVICES SA/NV',
				nutritionBasis: 'ml',
				per100: { kcal: 42.4, protein: 0, carbs: 10.6, fat: 0, fiber: null },
				servingG: 330
			}
		});
	});

	it('detects ml from the quantity of a search hit', () => {
		const result = mapOffProduct({
			code: '5000112548068',
			product_name: 'Coca-Cola Classic',
			brands: ['Coca-Cola'],
			quantity: '0.5l',
			nutriments: {
				'energy-kcal_100g': 42,
				proteins_100g: 0,
				carbohydrates_100g: 10.6,
				fat_100g: 0
			}
		});
		expect(result).toMatchObject({
			kind: 'found',
			product: { nutritionBasis: 'ml', brand: 'Coca-Cola' }
		});
	});

	it('converts per serving values with the serving size in g', () => {
		expect(mapOffProduct(servingOnly.product)).toEqual({
			kind: 'found',
			product: {
				barcode: '7612345678900',
				name: 'Hazelnut crunch bar',
				brand: 'Example Foods',
				nutritionBasis: 'g',
				per100: { kcal: 500, protein: 10, carbs: 55, fat: 27.5, fiber: 5 },
				servingG: 40
			}
		});
	});

	it('is incomplete when only per serving values exist and the serving weight is unknown', () => {
		const product: Record<string, unknown> = { ...servingOnly.product };
		delete product.serving_quantity;
		expect(mapOffProduct(product)).toEqual({
			kind: 'incomplete',
			barcode: '7612345678900',
			prefill: {
				barcode: '7612345678900',
				nutritionBasis: 'g',
				name: 'Hazelnut crunch bar',
				brand: 'Example Foods'
			}
		});
	});

	it('is incomplete with a prefill of the plausible values when kcal is out of range', () => {
		const product = {
			...full.product,
			nutriments: { ...full.product.nutriments, 'energy-kcal_100g': 1200 }
		};
		expect(mapOffProduct(product)).toEqual({
			kind: 'incomplete',
			barcode: '3017620422003',
			prefill: {
				barcode: '3017620422003',
				nutritionBasis: 'g',
				name: 'Nutella',
				brand: 'Nutella',
				protein: 6.3,
				carbs: 57.5,
				fat: 30.9,
				fiber: 0
			}
		});
	});

	it('is incomplete when a macro is over 100 or a core value is missing', () => {
		const over = {
			...full.product,
			nutriments: { ...full.product.nutriments, carbohydrates_100g: 140 }
		};
		expect(mapOffProduct(over)).toMatchObject({ kind: 'incomplete' });
		const rest: Record<string, unknown> = { ...full.product.nutriments };
		delete rest.fat_100g;
		expect(mapOffProduct({ ...full.product, nutriments: rest })).toMatchObject({
			kind: 'incomplete',
			prefill: { kcal: 539 }
		});
	});

	it('is incomplete without a name, accepts numbers sent as text, and keeps fiber optional', () => {
		const result = mapOffProduct({
			code: '12345670',
			nutriments: {
				'energy-kcal_100g': '120.5',
				proteins_100g: '3',
				carbohydrates_100g: '20',
				fat_100g: '2'
			}
		});
		expect(result).toMatchObject({ kind: 'incomplete', prefill: { kcal: 120.5 } });
		const named = mapOffProduct({
			code: '12345670',
			product_name: '  Soup  ',
			brands: 'A, B',
			nutriments: {
				'energy-kcal_100g': '120.5',
				proteins_100g: '3',
				carbohydrates_100g: '20',
				fat_100g: '2'
			}
		});
		expect(named).toMatchObject({
			kind: 'found',
			product: { name: 'Soup', brand: 'A', per100: { kcal: 120.5, fiber: null } }
		});
	});

	it('gives not_found for a missing product or code', () => {
		expect(mapOffProduct(notFound)).toEqual({ kind: 'not_found' });
		expect(mapOffProduct(null)).toEqual({ kind: 'not_found' });
		expect(mapOffProduct({ product_name: 'No code' })).toEqual({ kind: 'not_found' });
	});
});
