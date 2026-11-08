import { weekStart } from '#lib/domain/dates.ts';
import { trendOn, trendSeries } from '#lib/domain/trend.ts';
import { listContainers } from '#lib/server/batches/repo.ts';
import { appContext } from '#lib/server/context.ts';
import { targetsHistory } from '#lib/server/targets/repo.ts';
import { listWeights } from '#lib/server/weights/repo.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const ctx = await appContext();
	const [containers, weighIns, targets] = await Promise.all([
		listContainers(ctx.db),
		listWeights(ctx.db),
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
		trendKg: trendOn(trendSeries(weighIns, ctx.today), ctx.today),
		targets,
		currentWeekStart: weekStart(ctx.today)
	};
};
