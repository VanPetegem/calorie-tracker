// The Worker entry (wrangler.jsonc `main`). The SvelteKit adapter emits a Worker with only `fetch`; this wrapper
// re-exports it and adds the weekly backup cron.
import app from '../.svelte-kit/cloudflare/_worker.js';
import { scheduled } from '../src/lib/server/backup/scheduled.ts';

export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<Env>;
