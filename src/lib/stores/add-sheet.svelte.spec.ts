import { afterEach, describe, expect, it } from 'vitest';
import { sampleBatch } from '../components/recipes/batch.fixture.ts';
import { addSheet } from './add-sheet.svelte.ts';

afterEach(() => {
	addSheet.open = false;
	addSheet.batch = null;
});

describe('addSheet', () => {
	it('show opens the sheet without a batch', () => {
		addSheet.batch = sampleBatch();
		addSheet.show();
		expect(addSheet.open).toBe(true);
		expect(addSheet.batch).toBeNull();
	});

	it('show keeps the batch step of a sheet that is already open', () => {
		const batch = sampleBatch();
		addSheet.openBatch(batch);
		addSheet.show();
		expect(addSheet.open).toBe(true);
		expect(addSheet.batch).toBe(batch);
	});
});
