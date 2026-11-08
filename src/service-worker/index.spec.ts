import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './index.ts';

// The worker registers its listeners when it loads, on the `self` it imports, so the fake records them.
const worker = vi.hoisted(() => {
	const listeners = new Map<string, (event: never) => void>();
	return {
		listeners,
		self: {
			location: new URL('https://kcal.test/'),
			addEventListener: (type: string, listener: (event: never) => void) => {
				listeners.set(type, listener);
			},
			clients: { claim: () => Promise.resolve() }
		}
	};
});

vi.mock('$app/service-worker', () => ({ self: worker.self }));
vi.mock('$app/env', () => ({ version: 'test' }));
vi.mock('$app/manifest', () => ({
	immutable: [{ path: '_app/immutable/app.js' }],
	assets: [{ path: 'favicon.png' }]
}));

const ORIGIN = 'https://kcal.test';
const CACHE_NAME = 'kcal-test';
const network = vi.fn<typeof fetch>();

/** Keys resolve against the app origin, the way a browser resolves a relative cache key. */
function keyOf(request: string | Request) {
	return new URL(typeof request === 'string' ? request : request.url, ORIGIN).href;
}

/** A Cache that clones on every read, like the browser's. */
class MemoryCache {
	readonly #entries = new Map<string, Response>();

	async match(request: string | Request) {
		return this.#entries.get(keyOf(request))?.clone();
	}

	async put(request: string | Request, response: Response) {
		this.#entries.set(keyOf(request), response);
	}
}

let stores: Map<string, MemoryCache>;

beforeEach(() => {
	stores = new Map();
	vi.stubGlobal('caches', {
		open: async (name: string) => {
			let cache = stores.get(name);
			if (!cache) {
				cache = new MemoryCache();
				stores.set(name, cache);
			}
			return cache;
		},
		keys: async () => [...stores.keys()],
		delete: async (name: string) => stores.delete(name)
	});
	network.mockReset();
	vi.stubGlobal('fetch', network);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

/**
 * Sends a same origin GET from the page, the way the browser does. Resolves with the worker's answer, or undefined
 * when the worker lets the request through, and after every `waitUntil` promise (the cache writes) has settled.
 */
async function fromPage(path: string) {
	const pending: Promise<unknown>[] = [];
	let answer: Promise<Response> | undefined;
	worker.listeners.get('fetch')?.({
		request: new Request(new URL(path, ORIGIN)),
		respondWith: (promise: Promise<Response>) => {
			answer = promise;
		},
		waitUntil: (promise: Promise<unknown>) => {
			pending.push(promise);
		}
	} as never);
	const response = await answer;
	await Promise.all(pending);
	return response;
}

const json = (body: string) =>
	new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });

const offline = () => Promise.reject(new TypeError('Failed to fetch'));

describe('service worker, client side data requests', () => {
	it('serves a successful __data.json response offline for its path, whatever the invalidation query', async () => {
		network.mockResolvedValueOnce(json('{"type":"data"}'));
		const online = await fromPage('/weight/__data.json?x-sveltekit-invalidated=01');
		expect(await online?.text()).toBe('{"type":"data"}');

		network.mockImplementation(offline);
		const response = await fromPage('/weight/__data.json?x-sveltekit-invalidated=11');
		expect(response?.status).toBe(200);
		expect(await response?.text()).toBe('{"type":"data"}');
	});

	it('asks the server for every node, without the invalidation query', async () => {
		network.mockResolvedValueOnce(json('{}'));
		await fromPage('/weight/__data.json?x-sveltekit-invalidated=01');
		const [requested] = network.mock.calls[0];
		const sent = new URL(requested instanceof Request ? requested.url : String(requested));
		expect(sent.pathname).toBe('/weight/__data.json');
		expect(sent.searchParams.has('x-sveltekit-invalidated')).toBe(false);
	});

	it('answers an uncached __data.json offline with a 503, so SvelteKit navigates in full', async () => {
		network.mockImplementation(offline);
		const response = await fromPage('/recipes/__data.json?x-sveltekit-invalidated=1');
		expect(response?.ok).toBe(false);
		expect(response?.status).toBe(503);
	});

	it('does not store a failed __data.json response', async () => {
		network.mockResolvedValueOnce(new Response('server error', { status: 500 }));
		await fromPage('/weight/__data.json?x-sveltekit-invalidated=01');

		const cache = await caches.open(CACHE_NAME);
		expect(await cache.match('/weight/__data.json')).toBeUndefined();
	});
});
