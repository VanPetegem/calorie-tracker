import { describe, expect, it } from 'vitest';
import {
	perServingToPer100,
	scaleSnapshot,
	snapshotFor,
	sumNutrients,
	toGrams,
	type Nutrients,
	type Per100
} from './nutrition';

const yogurt: Per100 = { kcal: 350, protein: 13, carbs: 60, fat: 7, fiber: 10 };

describe('toGrams', () => {
	it('keeps grams and millilitres as they are', () => {
		expect(toGrams(250, 'g', null)).toBe(250);
		expect(toGrams(250, 'ml', null)).toBe(250);
	});

	it('multiplies servings by the serving weight', () => {
		expect(toGrams(1.5, 'serving', 40)).toBe(60);
	});

	it('throws for a serving without a serving weight', () => {
		expect(() => toGrams(1, 'serving', null)).toThrow(RangeError);
	});

	it('throws for portions, which phase 3 handles', () => {
		expect(() => toGrams(1, 'portion', 40)).toThrow(RangeError);
	});
});

describe('snapshotFor', () => {
	it('scales per 100 values to the grams eaten', () => {
		expect(snapshotFor(yogurt, 200)).toEqual({
			kcal: 700,
			protein: 26,
			carbs: 120,
			fat: 14,
			fiber: 20
		});
	});

	it('rounds to one decimal, halves up', () => {
		const food = { kcal: 1, protein: 2.25, carbs: 0, fat: 0, fiber: null };
		expect(snapshotFor(food, 100)).toEqual({
			kcal: 1,
			protein: 2.3,
			carbs: 0,
			fat: 0,
			fiber: null
		});
		expect(snapshotFor(food, 33.3).protein).toBe(0.7);
	});

	it('keeps fiber null when the food has no fiber value', () => {
		expect(snapshotFor({ ...yogurt, fiber: null }, 100).fiber).toBeNull();
	});
});

describe('scaleSnapshot', () => {
	it('scales a snapshot from its old grams to the new grams', () => {
		const snapshot: Nutrients = snapshotFor(yogurt, 200);
		expect(scaleSnapshot(snapshot, 200, 300).kcal).toBe(1050);
		expect(scaleSnapshot(snapshot, 200, 300)).toEqual(snapshotFor(yogurt, 300));
	});

	it('keeps fiber null', () => {
		const snapshot = snapshotFor({ ...yogurt, fiber: null }, 200);
		expect(scaleSnapshot(snapshot, 200, 300).fiber).toBeNull();
	});

	it('rejects a zero old weight', () => {
		expect(() => scaleSnapshot(snapshotFor(yogurt, 200), 0, 300)).toThrow(RangeError);
	});
});

describe('perServingToPer100', () => {
	it('converts per serving values to per 100 g', () => {
		expect(
			perServingToPer100({ kcal: 120, protein: 6, carbs: 15, fat: 4, fiber: null }, 40)
		).toEqual({ kcal: 300, protein: 15, carbs: 37.5, fat: 10, fiber: null });
	});

	it('rejects a zero serving weight', () => {
		expect(() =>
			perServingToPer100({ kcal: 120, protein: 6, carbs: 15, fat: 4, fiber: null }, 0)
		).toThrow(RangeError);
	});
});

describe('sumNutrients', () => {
	it('adds every field', () => {
		expect(sumNutrients([snapshotFor(yogurt, 200), snapshotFor(yogurt, 100)])).toEqual({
			kcal: 1050,
			protein: 39,
			carbs: 180,
			fat: 21,
			fiber: 30
		});
	});

	it('counts null fiber as zero and returns a number', () => {
		const fiber = sumNutrients([
			snapshotFor({ ...yogurt, fiber: null }, 100),
			snapshotFor(yogurt, 100)
		]).fiber;
		expect(fiber).toBe(10);
	});

	it('returns zeros for an empty list', () => {
		expect(sumNutrients([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
	});

	it('rounds away floating point noise to one decimal', () => {
		const tenth: Nutrients = { kcal: 0.1, protein: 0, carbs: 0, fat: 0, fiber: null };
		const fifth: Nutrients = { kcal: 0.2, protein: 0, carbs: 0, fat: 0, fiber: null };
		expect(sumNutrients([tenth, fifth]).kcal).toBe(0.3);
	});
});
