import type { BatchSummary } from '#lib/server/batches/repo.ts';

/** A batch as the add sheet and the Recipes tab get it: 4 portions of 500 kcal, 1600 g cooked, none logged yet. */
export function sampleBatch(overrides: Partial<BatchSummary> = {}): BatchSummary {
	return {
		id: 'batch-stew',
		recipeId: null,
		name: 'Beef stew',
		cookedOn: '2026-11-05',
		portions: 4,
		cookedWeightG: 1600,
		kcal: 2000,
		protein: 120,
		carbs: 200,
		fat: 80,
		fiber: 16,
		finishedAt: null,
		createdAt: '2026-11-05T18:00:00.000Z',
		updatedAt: '2026-11-05T18:00:00.000Z',
		portionsLeft: 4,
		perPortion: { kcal: 500, protein: 30, carbs: 50, fat: 20, fiber: 4 },
		per100g: { kcal: 125, protein: 7.5, carbs: 12.5, fat: 5, fiber: 1 },
		lastActivity: '2026-11-05T18:00:00.000Z',
		...overrides
	};
}
