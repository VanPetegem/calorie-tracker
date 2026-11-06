import { describe, expect, it } from 'vitest';
import { swipeDirection } from './swipe.ts';

describe('swipeDirection', () => {
	it('detects left and right drags past the distance', () => {
		expect(swipeDirection(-80, 4)).toBe('left');
		expect(swipeDirection(80, -4)).toBe('right');
	});

	it('ignores short drags', () => {
		expect(swipeDirection(-40, 0)).toBeNull();
		expect(swipeDirection(63, 0)).toBeNull();
	});

	it('ignores drags that are mostly vertical', () => {
		expect(swipeDirection(-80, 70)).toBeNull();
		expect(swipeDirection(-90, 50)).toBe('left');
	});
});
