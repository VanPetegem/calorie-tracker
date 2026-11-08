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
async function fromPage(path: string, init?: RequestInit) {
	const pending: Promise<unknown>[] = [];
	let answer: Promise<Response> | undefined;
	worker.listeners.get('fetch')?.({
		request: new Request(new URL(path, ORIGIN), init),
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

// Bodies shaped like SvelteKit's data responses: a load result, and the redirect a signed out user gets.
const LOAD_A = '{"type":"data","nodes":[{"type":"data","data":{"day":"A"}}]}';
const LOAD_B = '{"type":"data","nodes":[{"type":"data","data":{"day":"B"}}]}';
const LOAD_ERROR =
	'{"type":"data","nodes":[{"type":"data","data":{"day":"B"}},{"type":"error","status":500,"error":{"message":"Internal Error"}}]}';
const REDIRECT = '{"type":"redirect","status":302,"location":"/login"}';

/** Stores a copy the way an earlier online visit would have. */
async function prime(path: string, body: string) {
	const cache = await caches.open(CACHE_NAME);
	await cache.put(path, json(body));
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

	it('answers from the network first, and the fresh copy replaces the stored one', async () => {
		await prime('/weight/__data.json', LOAD_A);

		network.mockResolvedValueOnce(json(LOAD_B));
		const response = await fromPage('/weight/__data.json?x-sveltekit-invalidated=01');
		expect(await response?.text()).toBe(LOAD_B);

		const cache = await caches.open(CACHE_NAME);
		expect(await (await cache.match('/weight/__data.json'))?.text()).toBe(LOAD_B);
	});

	it('lets a POST and a cross origin __data.json request pass the worker by', async () => {
		const post = await fromPage('/weight/__data.json', { method: 'POST' });
		const crossOrigin = await fromPage('https://other.test/weight/__data.json');
		expect(post).toBeUndefined();
		expect(crossOrigin).toBeUndefined();
		expect(network).not.toHaveBeenCalled();
	});

	it('does not store a redirect, so a signed out response never replaces the last good copy', async () => {
		await prime('/weight/__data.json', LOAD_A);

		network.mockResolvedValueOnce(json(REDIRECT));
		await fromPage('/weight/__data.json?x-sveltekit-invalidated=01');

		network.mockImplementation(offline);
		const offlineCopy = await fromPage('/weight/__data.json?x-sveltekit-invalidated=01');
		expect(await offlineCopy?.text()).toBe(LOAD_A);
	});

	it('does not store a response in which a load failed, so it never replaces the last good copy', async () => {
		await prime('/weight/__data.json', LOAD_A);

		network.mockResolvedValueOnce(json(LOAD_ERROR));
		await fromPage('/weight/__data.json?x-sveltekit-invalidated=01');

		network.mockImplementation(offline);
		const offlineCopy = await fromPage('/weight/__data.json?x-sveltekit-invalidated=01');
		expect(await offlineCopy?.text()).toBe(LOAD_A);
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
		network.mockResolvedValueOnce(
			new Response(LOAD_A, { status: 500, headers: { 'content-type': 'application/json' } })
		);
		await fromPage('/weight/__data.json?x-sveltekit-invalidated=01');

		const cache = await caches.open(CACHE_NAME);
		expect(await cache.match('/weight/__data.json')).toBeUndefined();
	});
});
