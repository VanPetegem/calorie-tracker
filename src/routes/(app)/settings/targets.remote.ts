import { command } from '$app/server';
import { GoalInput, MacroRulesInput } from '#lib/schemas/settings.ts';
import { appContext } from '#lib/server/context.ts';
import { recomputeWeekOn } from '#lib/server/targets/commands.ts';

/*
 * Goal and macro rule writes. Each recomputes this week's target row in the same batch as the setting and returns the
 * row. The page reads through `load`, so callers `await invalidateAll()` after a command resolves.
 */

/** Saves the goal rate and recomputes this week's target. */
export const saveGoal = command(GoalInput, async (input) =>
	recomputeWeekOn(await appContext(), input)
);

/** Saves the protein, fat and energy density rules and recomputes this week's target. */
export const saveMacroRules = command(MacroRulesInput, async (input) =>
	recomputeWeekOn(await appContext(), input)
);
