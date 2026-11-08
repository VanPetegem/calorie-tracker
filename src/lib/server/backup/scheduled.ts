import { runBackup } from './export.ts';

/** Weekly cron (wrangler.jsonc `triggers.crons`): copies every app table to R2. A rejection shows in Workers Logs. */
export const scheduled: ExportedHandlerScheduledHandler<Env> = (controller, env, ctx) => {
	ctx.waitUntil(runBackup(env.DB, env.BACKUPS, new Date(controller.scheduledTime)));
};
