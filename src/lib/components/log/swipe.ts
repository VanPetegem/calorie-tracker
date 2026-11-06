/** Minimum horizontal travel, in px, for a drag to count as a swipe. */
export const SWIPE_DISTANCE_PX = 64;

/** Horizontal travel must beat vertical travel by this factor, so a scroll that drifts sideways is not a swipe. */
const DOMINANCE = 1.5;

export type SwipeDirection = 'left' | 'right';

/** The direction of a finished drag, or null when it was too short or mostly vertical. */
export function swipeDirection(
	dx: number,
	dy: number,
	distance = SWIPE_DISTANCE_PX
): SwipeDirection | null {
	if (Math.abs(dx) < distance) return null;
	if (Math.abs(dx) < Math.abs(dy) * DOMINANCE) return null;
	return dx < 0 ? 'left' : 'right';
}
