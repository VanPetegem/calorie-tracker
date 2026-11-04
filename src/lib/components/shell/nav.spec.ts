import { describe, expect, it } from 'vitest';
import { isActive, navItems } from './nav.ts';

describe('navItems', () => {
	it('lists the four tabs in order', () => {
		expect(navItems.map((item) => [item.label, item.href])).toEqual([
			['Today', '/'],
			['Recipes', '/recipes'],
			['Weight', '/weight'],
			['Settings', '/settings']
		]);
	});
});

describe('isActive', () => {
	it('matches the root only on exactly /', () => {
		expect(isActive('/', '/')).toBe(true);
		expect(isActive('/', '/recipes')).toBe(false);
	});

	it('matches other items on a path prefix', () => {
		expect(isActive('/recipes', '/recipes')).toBe(true);
		expect(isActive('/recipes', '/recipes/abc')).toBe(true);
	});

	it('does not match a sibling that only shares a text prefix', () => {
		expect(isActive('/weight', '/weightlifting')).toBe(false);
		expect(isActive('/recipes', '/settings')).toBe(false);
	});
});
