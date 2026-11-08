// The adapter's output exists only after `vite build` and is plain JS, so type it here: the same check then passes
// on a fresh checkout and after a build.
declare module '*/.svelte-kit/cloudflare/_worker.js' {
	const app: { fetch: ExportedHandlerFetchHandler<Env> };
	export default app;
}
