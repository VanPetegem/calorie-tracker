/**
 * Route guard. Pure functions so the access rules can be unit tested without a server.
 *
 * Every path needs a session except the login and setup pages, Better Auth's own endpoints and the files a
 * logged-out browser must load to show those pages or install the app. Without a session a page navigation
 * is sent to /login and comes back afterwards; anything else (fetch, form post, remote call) gets a 401, so
 * page code sees the failure instead of an HTML login page.
 */

export type AccessInput = {
	pathname: string;
	search: string;
	method: string;
	accept: string | null;
	secFetchMode: string | null;
	hasSession: boolean;
	/** A SvelteKit `__data.json` request: a client side navigation loading its server data. */
	isDataRequest?: boolean;
};

export type AccessDecision =
	{ kind: 'allow' } | { kind: 'redirect'; location: string } | { kind: 'deny'; status: 401 };

/** Public pages and directories. Each also covers the paths below it, but only on a `/` boundary. */
const PUBLIC_SEGMENTS = ['/login', '/setup', '/api/auth', '/_app'];

/** Public files matched by name prefix: the manifest, worker, favicons and app icons. */
const PUBLIC_FILE_PREFIXES = [
	'/manifest.webmanifest',
	'/service-worker.js',
	'/favicon',
	'/robots.txt',
	'/pwa-',
	'/apple-touch-icon',
	'/maskable-',
	'/icon.svg'
];

/** SvelteKit remote functions run app code under `/_app/remote/`, so they need a session like any endpoint. */
const REMOTE_FUNCTIONS = '/_app/remote/';

function isPublic(pathname: string) {
	if (pathname.startsWith(REMOTE_FUNCTIONS)) return false;
	// `/api/auth` itself is not an endpoint; only the paths below it are.
	if (pathname === '/api/auth') return false;
	return (
		PUBLIC_SEGMENTS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
		PUBLIC_FILE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
	);
}

function isNavigation(input: AccessInput) {
	if (input.isDataRequest) return true;
	if (input.method !== 'GET') return false;
	return input.secFetchMode === 'navigate' || (input.accept?.includes('text/html') ?? false);
}

export function decideAccess(input: AccessInput): AccessDecision {
	if (input.hasSession || isPublic(input.pathname)) return { kind: 'allow' };
	if (isNavigation(input)) {
		const target = encodeURIComponent(input.pathname + input.search);
		return { kind: 'redirect', location: `/login?redirectTo=${target}` };
	}
	return { kind: 'deny', status: 401 };
}

/**
 * Where to go after login. Only a same-origin relative path is accepted: `//host` and `/\host` are
 * protocol-relative URLs to another origin, and browsers drop tabs and newlines while parsing, so `/\t/host`
 * would become `//host`. Anything else goes to `/`.
 */
export function safeRedirect(target: string | null): string {
	if (!target || !target.startsWith('/')) return '/';
	// eslint-disable-next-line no-control-regex -- control characters are exactly what must be rejected
	if (/[\u0000-\u001f\u007f]/.test(target)) return '/';
	if (target.startsWith('//') || target.startsWith('/\\')) return '/';
	return target;
}
