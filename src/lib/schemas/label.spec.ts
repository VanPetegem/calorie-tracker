import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ReadLabelInput } from './label.ts';

const PREFIX = 'data:image/jpeg;base64,';
const uri = (length: number) => PREFIX + 'A'.repeat(length - PREFIX.length);

describe('ReadLabelInput', () => {
	it('accepts 2,000,000 characters and rejects 2,000,001', () => {
		expect(v.safeParse(ReadLabelInput, uri(2_000_000)).success).toBe(true);
		expect(v.safeParse(ReadLabelInput, uri(2_000_001)).success).toBe(false);
	});

	it('rejects anything that is not a JPEG data URI', () => {
		expect(v.safeParse(ReadLabelInput, 'data:image/png;base64,AAAA').success).toBe(false);
	});
});
