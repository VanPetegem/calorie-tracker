import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request }) => {
	const passkeys = await locals.auth.api.listPasskeys({ headers: request.headers });
	// Only what the list shows; public keys and counters stay on the server.
	return {
		passkeys: passkeys.map(({ id, name, createdAt }) => ({ id, name: name ?? null, createdAt }))
	};
};
