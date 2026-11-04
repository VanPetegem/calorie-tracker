import { describe, expect, it } from 'vitest';
import { parseDecimal } from './decimal';

describe('parseDecimal', () => {
	it.each([
		['72,5', 72.5],
		['72.5', 72.5],
		[' 80 ', 80],
		['0,25', 0.25]
	])('parses %j as %d', (input, expected) => {
		expect(parseDecimal(input)).toBe(expected);
	});

	it.each([
		'7,2,5',
		'7.2.5',
		'7,2.5',
		'1.000,5',
		'1,000.5',
		'',
		'   ',
		'abc',
		'7a',
		'-1',
		',',
		'.'
	])('rejects %j', (input) => {
		expect(parseDecimal(input)).toBeNull();
	});

	it('accepts a leading minus only with allowNegative', () => {
		expect(parseDecimal('-1')).toBeNull();
		expect(parseDecimal('-1', { allowNegative: true })).toBe(-1);
		expect(parseDecimal('-0,5', { allowNegative: true })).toBe(-0.5);
		expect(parseDecimal('--1', { allowNegative: true })).toBeNull();
	});
});
