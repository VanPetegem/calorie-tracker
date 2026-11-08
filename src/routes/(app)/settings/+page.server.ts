import { weekStart } from '#lib/domain/dates.ts';
import { listContainers } from '#lib/server/batches/repo.ts';
import { appContext } from '#lib/server/context.ts';
import { targetsHistory } from '#lib/server/targets/repo.ts';
import { loadWeight } from '#lib/server/weights/commands.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const ctx = await appContext();
	const [containers, weight, targets] = await Promise.all([
		listContainers(ctx.db),
		loadWeight(ctx),
		targetsHistory(ctx.db)
	]);
	const { sex, birthDate, heightCm, activityLevel } = ctx.settings;
	const { goalRatePct, proteinGPerKg, fatPct, energyDensity } = ctx.settings;
	return {
		containers,
		today: ctx.today,
		profile: { sex, birthDate, heightCm, activityLevel },
		goalRatePct,
		macroRules: { proteinGPerKg, fatPct, energyDensity },
		trendKg: weight.trendKg,
		targets,
		currentWeekStart: weekStart(ctx.today)
	};
};
