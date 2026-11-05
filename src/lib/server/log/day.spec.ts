import { describe, expect, it } from 'vitest';
import { dayTarget } from './day.ts';

describe('dayTarget', () => {
	it('is null until kcal and body weight are both set', () => {
		expect(dayTarget({ manualTargetKcal: null, manualWeightKg: null })).toBeNull();
	});

	it('adds macro targets to the entered kcal', () => {
		const target = dayTarget({ manualTargetKcal: 3000, manualWeightKg: 70 });
		expect(target).toMatchObject({ kcal: 3000, proteinG: 126, carbsFloored: false });
	});
});
