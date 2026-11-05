import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';

const CLIENT_DIR = '.svelte-kit/output/client/_app/immutable';

let remoteHash: string | undefined;

/**
 * The id prefix of `log.remote.ts`. Remote function ids are `<hash>/<name>`, and the hash is a build artifact,
 * so it is read from the built client chunks that call the commands (the e2e server runs that build).
 */
function logRemoteHash(): string {
	if (remoteHash) return remoteHash;
	for (const file of readdirSync(CLIENT_DIR, { recursive: true, encoding: 'utf8' })) {
		if (!file.endsWith('.js')) continue;
		const match = /([A-Za-z0-9_-]+)\/logQuick/.exec(readFileSync(join(CLIENT_DIR, file), 'utf8'));
		if (match) return (remoteHash = match[1]);
	}
	throw new Error('log.remote.ts commands not found in the client build. Run pnpm build first.');
}

/**
 * Encodes a flat object of strings, numbers and nulls the way SvelteKit sends a command argument
 * (devalue: an array whose first item maps keys to indexes of the values that follow), as unpadded base64url.
 */
function encodeArg(arg: Record<string, string | number | null>): string {
	const slots: unknown[] = [{}];
	for (const [key, value] of Object.entries(arg)) {
		(slots[0] as Record<string, number>)[key] = slots.length;
		slots.push(value);
	}
	return Buffer.from(JSON.stringify(slots)).toString('base64url');
}

/** Logs a quick entry through the real `logQuick` command, with the session of `page`. */
export async function seedQuickEntry(
	page: Page,
	entry: {
		date: string;
		label: string;
		kcal: number;
		protein?: number;
		carbs?: number;
		fat?: number;
	}
): Promise<void> {
	// SvelteKit refuses remote calls without a same site Origin; the browser sends it for the app's own calls.
	const origin = new URL(test.info().project.use.baseURL!).origin;
	const response = await page.request.post(`/_app/remote/${logRemoteHash()}/logQuick`, {
		headers: { origin },
		data: {
			payload: encodeArg({
				date: entry.date,
				label: entry.label,
				kcal: entry.kcal,
				protein: entry.protein ?? null,
				carbs: entry.carbs ?? null,
				fat: entry.fat ?? null
			}),
			refreshes: []
		}
	});
	const body = await response.text();
	if (!response.ok() || !body.includes('"result"')) {
		throw new Error(`Seeding failed (${response.status()}): ${body}`);
	}
}
