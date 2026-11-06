import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..', '..');

function svelteFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return svelteFiles(path);
		return entry.name.endsWith('.svelte') ? [path] : [];
	});
}

describe('utility classes', () => {
	it('no component class holds an arbitrary variant or value', () => {
		const found: string[] = [];
		for (const file of svelteFiles(join(root, 'src'))) {
			const source = readFileSync(file, 'utf8');
			for (const [, classes = ''] of source.matchAll(/\bclass="([^"]*)"/g)) {
				// `[&...]`, `[--x:y]`, `w-[10px]`: anything the config does not define as a token or a named utility.
				for (const token of classes.split(/\s+/)) {
					if (/\[[^\]]+\]/.test(token) && !token.includes('{')) found.push(`${file}: ${token}`);
				}
			}
		}
		expect(found).toEqual([]);
	});

	it('details-marker-none hides the marker on WebKit too', () => {
		const css = readFileSync(join(root, 'src', 'routes', 'layout.css'), 'utf8');
		const [, body = ''] = css.match(/@utility details-marker-none \{([\s\S]*?)\n\}/) ?? [];
		expect(body).toContain('list-style: none');
		expect(body).toMatch(/&::-webkit-details-marker\s*\{\s*display: none;/);
	});
});
