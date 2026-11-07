import { appContext } from '#lib/server/context.ts';
import { loadWeight } from '#lib/server/weights/commands.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => loadWeight(await appContext());
