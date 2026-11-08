import { self } from '$app/service-worker';
import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';

/**
 * Offline app shell. The app writes online only, so this worker exists to open the installed app without a
 * connection and to speed up repeat loads:
 *  - Build files and static files are precached and served cache first.
 *  - Page navigations go network first. Each good response is cached so the page can be reopened offline;
 *    when the network fails, that URL's cached page is used; only `/` falls back to the cached home page, any
 *    other URL gets a small 503 "unavailable offline" page.
 *  - Client side navigations fetch `<path>/__data.json`. Those go network first into the same cache, so switching
 *    tabs works offline; see `dataRequest` for the cache key.
 *  - `/api/*` and anything that is not a same origin GET is never touched.
 */

const CACHE = `kcal-${version}`;
const DATA_SUFFIX = '/__data.json';
const INVALIDATED_PARAM = 'x-sveltekit-invalidated';

// Manifest paths are relative to the base path. The app is served from the domain root, so this is `/` + path.
// The zxing decoder's `.wasm` (about 1 MB, only needed once someone scans) is left out: the browser's HTTP cache keeps
// the hashed, immutable file after the first scan.
const PRECACHE = [...immutable, ...assets]
	.map((file) => `/${file.path}`)
	.filter((path) => !path.endsWith('.wasm'));
const PRECACHED = new Set<string>(PRECACHE);

/** A redirected response cannot answer a navigation, and an error page must not become the offline page. */
function cacheable(response: Response) {
	return response.ok && !response.redirected;
}

self.addEventListener('install', (event) => {
	async function precache() {
		const cache = await caches.open(CACHE);
		await cache.addAll(PRECACHE);
		// Best effort: have a fallback page ready even before the first controlled navigation.
		try {
			const home = await fetch('/');
			if (cacheable(home)) await cache.put('/', home);
		} catch {
			// Offline during install; the first navigation will cache it.
		}
	}

	event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
	async function cleanUp() {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
		// Control pages that were opened before the worker installed, so the first visit is covered too.
		await self.clients.claim();
	}

	event.waitUntil(cleanUp());
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname.startsWith('/api/')) return;

	if (request.mode === 'navigate') {
		event.respondWith(networkFirst(request, event));
	} else if (url.pathname.endsWith(DATA_SUFFIX)) {
		event.respondWith(networkFirstData(request, event));
	} else if (PRECACHED.has(url.pathname)) {
		event.respondWith(cacheFirst(request, url.pathname));
	}
});

async function networkFirst(request: Request, event: ExtendableEvent) {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		if (cacheable(response)) event.waitUntil(cache.put(request, response.clone()));
		return response;
	} catch {
		const cached = await cache.match(request, { ignoreVary: true });
		if (cached) return cached;
		// Only the home page may fall back to the cached `/`: SvelteKit would hydrate Today's content under any
		// other path. Everything else gets a plain "unavailable offline" page.
		if (new URL(request.url).pathname === '/') {
			const home = await cache.match('/', { ignoreVary: true });
			if (home) return home;
		}
		return offlinePage();
	}
}

/**
 * SvelteKit's `x-sveltekit-invalidated` bitmap tells the server which layouts to load, and the server skips the rest.
 * A response therefore depends on the bitmap, which changes from one navigation to the next, so a copy keyed by the
 * full URL would rarely match offline. The worker drops the bitmap: the server then loads every node, the copy is
 * complete, and one copy per path answers any bitmap. Cost: the layout loads run again on each tab switch while online.
 */
function dataRequest(url: URL) {
	const data = new URL(url);
	data.searchParams.delete(INVALIDATED_PARAM);
	return data;
}

async function networkFirstData(request: Request, event: ExtendableEvent) {
	const cache = await caches.open(CACHE);
	const data = dataRequest(new URL(request.url));
	const key = data.href;
	try {
		const response = await fetch(new Request(data, request));
		if (cacheable(response)) event.waitUntil(storeLoadData(cache, key, response.clone()));
		return response;
	} catch {
		const cached = await cache.match(key, { ignoreVary: true });
		if (cached) return cached;
		// Not OK, so SvelteKit's client does a full navigation, which gets the cached page or the offline page. That
		// navigation needs the root layout's server load (`src/routes/+layout.server.ts`): without one, SvelteKit
		// renders its bare error page instead.
		return new Response(null, { status: 503 });
	}
}

/**
 * Stores a data response only when it holds a load result. A redirect (a signed out user, say) also answers 200, with
 * `{"type":"redirect"}`, and storing it would replace the last good copy for the next offline tab switch. So does a
 * response in which a load failed (a node of `type: 'error'`), which would hide the last good copy the same way.
 */
async function storeLoadData(cache: Cache, key: string, response: Response) {
	const body = await response.text();
	if (!isLoadData(body)) return;
	await cache.put(key, new Response(body, { status: response.status, headers: response.headers }));
}

function isLoadData(body: string) {
	try {
		const result = JSON.parse(body) as { type?: unknown; nodes?: unknown };
		if (result.type !== 'data') return false;
		const nodes = Array.isArray(result.nodes)
			? (result.nodes as ({ type?: unknown } | null)[])
			: [];
		return !nodes.some((node) => node?.type === 'error');
	} catch {
		return false;
	}
}

function offlinePage() {
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>Offline · kcal</title></head><body style="font-family: system-ui, sans-serif; padding: 2rem; max-width: 32rem; margin: 0 auto"><h1 style="font-size: 1.375rem">This page is unavailable offline</h1><p>Reconnect and try again, or <a href="/">open Today</a>.</p></body></html>`;
	return new Response(html, {
		status: 503,
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
}

async function cacheFirst(request: Request, pathname: string) {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(pathname);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) await cache.put(pathname, response.clone());
	return response;
}
