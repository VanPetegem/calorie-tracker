import { describe, expect, it } from 'vitest';
import { BLV_COLUMNS, mapBlvRow } from './blv-map.ts';

const complete = {
	id: 1234,
	name: 'Chicken breast, raw',
	synonyms: 'Chicken fillet',
	nameDe: 'Hühnerbrust, roh',
	synonymsDe: 'Poulet-Brüstli',
	nameFr: 'Poulet, blanc, cru',
	synonymsFr: null,
	kcal: 106,
	protein: 22.5,
	carbs: 0,
	fat: 1.8,
	fiber: 'tr.'
};

describe('mapBlvRow', () => {
	it('maps a complete row and indexes English, German and French names', () => {
		const food = mapBlvRow(complete, BLV_COLUMNS);
		expect(food).toMatchObject({
			source: 'blv',
			sourceRef: '1234',
			name: 'Chicken breast, raw',
			nutritionBasis: 'g',
			kcal: 106,
			protein: 22.5,
			carbs: 0,
			fat: 1.8,
			fiber: 0
		});
		const words = food?.searchText.split(' ');
		expect(words).toEqual(expect.arrayContaining(['chicken', 'huhnerbrust', 'poulet', 'brustli']));
		expect(words).toEqual(expect.arrayContaining(['blanc', 'fillet']));
	});

	it('falls back to the German name when no English name exists', () => {
		const food = mapBlvRow({ ...complete, name: null }, BLV_COLUMNS);
		expect(food?.name).toBe('Hühnerbrust, roh');
	});

	it('keeps fiber null when it is not determined', () => {
		expect(mapBlvRow({ ...complete, fiber: 'n.d.' }, BLV_COLUMNS)?.fiber).toBeNull();
		expect(mapBlvRow({ ...complete, fiber: null }, BLV_COLUMNS)?.fiber).toBeNull();
	});

	it('reads trace markers on macros as zero', () => {
		const food = mapBlvRow({ ...complete, carbs: 'tr.', fat: '<0.5' }, BLV_COLUMNS);
		expect(food).toMatchObject({ carbs: 0, fat: 0 });
	});

	it('returns null when fat is missing', () => {
		expect(mapBlvRow({ ...complete, fat: null }, BLV_COLUMNS)).toBeNull();
		expect(mapBlvRow({ ...complete, fat: 'n.d.' }, BLV_COLUMNS)).toBeNull();
	});

	it('returns null when kcal is out of range', () => {
		expect(mapBlvRow({ ...complete, kcal: 950 }, BLV_COLUMNS)).toBeNull();
	});

	it('returns null when a macro is out of range or the id is missing', () => {
		expect(mapBlvRow({ ...complete, protein: 101 }, BLV_COLUMNS)).toBeNull();
		expect(mapBlvRow({ ...complete, id: null }, BLV_COLUMNS)).toBeNull();
	});
});
