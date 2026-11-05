import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';

describe('contrastRatio', () => {
	it('is 21 for white on black', () => {
		expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 2);
	});

	it('matches the known 4.48 value for #777777 on white', () => {
		expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
	});

	it('is symmetric in argument order', () => {
		expect(contrastRatio('#4F46E5', '#09090B')).toBe(contrastRatio('#09090B', '#4F46E5'));
	});

	it('accepts 3 and 6 digit hex', () => {
		expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 2);
		expect(contrastRatio('#777', '#fff')).toBeCloseTo(contrastRatio('#777777', '#FFFFFF'), 5);
	});
});
