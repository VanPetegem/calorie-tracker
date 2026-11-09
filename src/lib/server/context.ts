import {
	ANTHROPIC_API_KEY,
	OFF_BASE_URL,
	OFF_CONTACT_EMAIL,
	OFF_SEARCH_URL
} from '$app/env/private';
import Anthropic from '@anthropic-ai/sdk';
import { env } from 'cloudflare:workers';
import pkg from '../../../package.json' with { type: 'json' };
import { localDate } from '../domain/dates.ts';
import { getDb, type Db } from './db/index.ts';
import { createLabelReader, type LabelReader } from './label/read.ts';
import { createOffClient, type OffClient } from './off/client.ts';
import { getSettings, type Settings } from './settings/repo.ts';

/** What server code needs for a request: the database, the OFF client, the label reader, settings, and today in their timezone. */
export type AppContext = {
	db: Db;
	off: OffClient;
	label: LabelReader;
	settings: Settings;
	now: Date;
	timeZone: string;
	/** Today's date (`YYYY-MM-DD`) in the settings timezone. */
	today: string;
};

let off: OffClient | undefined;

/** One OFF client per isolate: its config is static and the limiter bindings are the same for every request. */
function getOff(): OffClient {
	off ??= createOffClient({
		// Bound by hand: Workers throw "Illegal invocation" when `fetch` is called detached from the global.
		fetch: (input, init) => fetch(input, init),
		baseUrl: OFF_BASE_URL,
		searchBaseUrl: OFF_SEARCH_URL,
		contactEmail: OFF_CONTACT_EMAIL,
		version: pkg.version,
		productLimiter: env.OFF_PRODUCT_LIMITER,
		searchLimiter: env.OFF_SEARCH_LIMITER
	});
	return off;
}

let label: LabelReader | undefined;

/** One label reader per isolate, like the OFF client. The API key is a Worker secret. */
function getLabel(): LabelReader {
	label ??= createLabelReader({
		client: new Anthropic({
			apiKey: ANTHROPIC_API_KEY,
			// A photo read takes seconds; fail well before the Worker does and retry once.
			timeout: 60_000,
			maxRetries: 1,
			// Same detached `fetch` rule as getOff.
			fetch: (input, init) => fetch(input, init)
		}),
		limiter: env.LABEL_LIMITER
	});
	return label;
}

/** Builds the context for the current request (load, action or remote function). Reads the settings row once. */
export async function appContext(): Promise<AppContext> {
	const db = getDb(env.DB);
	const settings = await getSettings(db);
	const now = new Date();
	return {
		db,
		off: getOff(),
		label: getLabel(),
		settings,
		now,
		timeZone: settings.timezone,
		today: localDate(now, settings.timezone)
	};
}
