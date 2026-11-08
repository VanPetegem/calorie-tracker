import { unstable_readConfig as readConfig } from 'wrangler';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readConfig({ config: new URL(name, import.meta.url).pathname });

describe('wrangler configs', () => {
	it('keep the same assets, since the adapter reads one and wrangler deploys the other', () => {
		const deployed = read('../wrangler.jsonc').assets;
		expect(deployed).toMatchObject({ binding: 'ASSETS' });
		expect(read('../wrangler.adapter.jsonc').assets).toEqual(deployed);
	});
});
