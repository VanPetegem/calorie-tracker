import { ORIGIN, BETTER_AUTH_SECRET } from '$app/env/private';
import { betterAuth } from 'better-auth/minimal';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { passkey } from '@better-auth/passkey';
import { getRequestEvent } from '$app/server';
import { getDb } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/schema.ts';
import { MIN_PASSWORD_LENGTH } from '#lib/auth-rules.ts';

/** One year. The installed iPhone app must stay signed in across relaunches. */
const SESSION_SECONDS = 60 * 60 * 24 * 365;

/** ORIGIN normalised (`https://host`, no path or trailing slash): WebAuthn compares origins exactly. */
const APP_ORIGIN = new URL(ORIGIN).origin;

/** True once the single account exists. Sign up closes from then on. */
export async function hasAnyUser(d1: D1Database): Promise<boolean> {
	const rows = await getDb(d1).select({ id: user.id }).from(user).limit(1);
	return rows.length > 0;
}

export const createAuth = (d1: D1Database) =>
	betterAuth({
		baseURL: ORIGIN,
		secret: BETTER_AUTH_SECRET,
		database: drizzleAdapter(getDb(d1), { provider: 'sqlite' }),
		emailAndPassword: { enabled: true, minPasswordLength: MIN_PASSWORD_LENGTH },
		session: { expiresIn: SESSION_SECONDS, updateAge: 60 * 60 * 24 },
		databaseHooks: {
			user: {
				create: {
					// Single user app: every way of creating a user (email sign up, passkey first sign up, the
					// API called directly) runs through here, so this is where sign up is closed.
					before: async () => {
						if (await hasAnyUser(d1)) {
							throw new APIError('FORBIDDEN', { message: 'Sign up is closed' });
						}
					}
				}
			}
		},
		plugins: [
			passkey({ rpID: new URL(APP_ORIGIN).hostname, rpName: 'kcal', origin: APP_ORIGIN }),
			sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
		]
	});

export type Auth = ReturnType<typeof createAuth>;
