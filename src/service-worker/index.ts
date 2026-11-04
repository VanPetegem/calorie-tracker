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
 *  - `/api/*` and anything that is not a same origin GET is never touched.
 */

const CACHE = `kcal-${version}`;

// Manifest paths are relative to the base path. The app is served from the domain root, so this is `/` + path.
const PRECACHE = [...immutable, ...assets].map((file) => `/${file.path}`);
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
