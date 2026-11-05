import { createAuth } from '#lib/server/auth.ts';

/**
 * DO NOT USE!
 *
 * This instance is read by the `auth` CLI (`pnpm auth:schema`) for schema generation ONLY. It lives in its own
 * file so it never reaches the Worker bundle. To access `auth` at runtime, use `event.locals.auth`.
 */
export const auth = createAuth(null!);
