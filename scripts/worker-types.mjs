// Runs `wrangler types` (pass `--check` to verify instead of write) independent of build state.
//
// Wrangler adds `GlobalProps { mainModule: typeof import(...) }` only when the `main` file from wrangler.jsonc
// exists, and the header hash covers that content. The committed types were generated after a build (file
// present), so `--check` failed on a fresh CI checkout (file absent). A throwaway ES module stub keeps the output
// identical either way; it is removed again unless a real build output was already there.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MAIN = '.svelte-kit/cloudflare/_worker.js';
const stubbed = !existsSync(MAIN);
if (stubbed) {
	mkdirSync(dirname(MAIN), { recursive: true });
	writeFileSync(MAIN, 'export default {};\n');
}

const args = ['exec', 'wrangler', 'types', ...process.argv.slice(2)];
const result = spawnSync('pnpm', args, { stdio: 'inherit' });
if (stubbed) rmSync(MAIN, { force: true });
process.exit(result.status ?? 1);
