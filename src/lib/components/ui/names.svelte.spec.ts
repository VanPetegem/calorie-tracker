import { describe, expect, it } from 'vitest';
import * as barrel from './index.ts';
import { componentNames } from './names.ts';

// Browser project: the barrel imports .svelte files, which the Node unit project cannot load.
describe('componentNames', () => {
	const exported = Object.keys(barrel)
		.filter((key) => key !== 'componentNames')
		.sort();

	it('lists every component exported from the barrel', () => {
		const missing = exported.filter((key) => !(componentNames as readonly string[]).includes(key));
		expect(missing, 'exported from index.ts but missing in names.ts').toEqual([]);
	});

	it('names only components that the barrel exports', () => {
		const unknown = componentNames.filter((name) => !exported.includes(name));
		expect(unknown, 'in names.ts but not exported from index.ts').toEqual([]);
	});

	it('has no duplicates', () => {
		expect(new Set(componentNames).size).toBe(componentNames.length);
	});
});
