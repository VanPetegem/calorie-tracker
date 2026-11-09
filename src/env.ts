import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	ORIGIN: {
		description: 'The app origin (base URL), e.g. `http://localhost:5173`.'
	},
	BETTER_AUTH_SECRET: {
		description:
			'Secret used to sign tokens. For production use 32 characters generated with high entropy. See [Better Auth installation](https://www.better-auth.com/docs/installation).'
	},
	OFF_CONTACT_EMAIL: {
		description:
			'Contact in the Open Food Facts User-Agent (`kcal-avp/<version> (<email>)`). A Worker secret in production.'
	},
	ANTHROPIC_API_KEY: {
		description: 'Claude API key for reading nutrition label photos. A Worker secret in production.'
	},
	OFF_BASE_URL: {
		description:
			'Open Food Facts product API host. Defaults to the real API; e2e points it at e2e/off-stub.mjs.',
		schema: (value) => value || 'https://world.openfoodfacts.org'
	},
	OFF_SEARCH_URL: {
		description:
			'Open Food Facts full text search host (search-a-licious). Defaults to the real service; e2e points it at e2e/off-stub.mjs.',
		schema: (value) => value || 'https://search.openfoodfacts.org'
	}
});
