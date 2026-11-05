import type { User, Session } from 'better-auth';
import { createAuth } from '#lib/server/auth.ts';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: User;
			session?: Session;
			auth: ReturnType<typeof createAuth>;
			/** Set by the hook when AUTH_LIMITER refused a sign in or sign up form post. */
			rateLimited?: boolean;
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
