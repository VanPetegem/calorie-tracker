import { afterEach, describe, expect, it, vi } from 'vitest';
import full from './fixtures/product-full.json';
import notFound from './fixtures/product-not-found.json';
import searchCola from './fixtures/search-cola.json';
import searchNutella from './fixtures/search-nutella.json';
import { createOffClient, type OffClientDeps } from './client.ts';

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function setup(respond: () => Response | Promise<Response> = () => json(full)) {
	const fetch = vi.fn<typeof globalThis.fetch>(async () => respond());
	const productLimiter = { limit: vi.fn(async () => ({ success: true })) };
	const searchLimiter = { limit: vi.fn(async () => ({ success: true })) };
	const deps: OffClientDeps = {
		fetch,
		baseUrl: 'https://off.test',
		searchBaseUrl: 'https://search.test',
		contactEmail: 'me@example.com',
		version: '1.2.3',
		productLimiter,
		searchLimiter
	};
	return { client: createOffClient(deps), fetch, productLimiter, searchLimiter };
}

afterEach(() => vi.restoreAllMocks());

describe('getProduct', () => {
	it('sends the exact User-Agent and asks only for needed fields', async () => {
		const { client, fetch } = setup();
		const result = await client.getProduct('3017620422003');
		expect(result).toMatchObject({ ok: true, value: { kind: 'found' } });
		const [url, init] = fetch.mock.calls[0];
		const parsed = new URL(String(url));
		expect(parsed.origin + parsed.pathname).toBe('https://off.test/api/v2/product/3017620422003');
		expect(parsed.searchParams.get('fields')).toBe(
			'code,product_name,brands,nutriments,serving_size,serving_quantity,quantity,product_quantity_unit'
		);
		expect(new Headers(init?.headers).get('user-agent')).toBe('kcal-avp/1.2.3 (me@example.com)');
	});

	it('returns rate_limited without calling fetch when the limiter refuses', async () => {
		const { client, fetch, productLimiter } = setup();
		productLimiter.limit.mockResolvedValue({ success: false });
		expect(await client.getProduct('3017620422003')).toEqual({ ok: false, reason: 'rate_limited' });
		expect(fetch).not.toHaveBeenCalled();
	});

	it('uses the product limiter, not the search limiter', async () => {
		const { client, productLimiter, searchLimiter } = setup();
		await client.getProduct('3017620422003');
		expect(productLimiter.limit).toHaveBeenCalledOnce();
		expect(searchLimiter.limit).not.toHaveBeenCalled();
	});

	it('maps HTTP 429 to rate_limited and 503 to unavailable', async () => {
		expect(await setup(() => json({}, 429)).client.getProduct('3017620422003')).toEqual({
			ok: false,
			reason: 'rate_limited'
		});
		expect(
			await setup(() => new Response('<html>down</html>', { status: 503 })).client.getProduct(
				'3017620422003'
			)
		).toEqual({
			ok: false,
			reason: 'unavailable'
		});
	});

	it('is unavailable when fetch throws or the body is not JSON', async () => {
		const failing = setup(() => {
			throw new TypeError('network down');
		});
		expect(await failing.client.getProduct('3017620422003')).toEqual({
			ok: false,
			reason: 'unavailable'
		});
		const html = setup(() => new Response('<html></html>', { status: 200 }));
		expect(await html.client.getProduct('3017620422003')).toEqual({
			ok: false,
			reason: 'unavailable'
		});
	});

	it('is unavailable when OFF does not answer within 5 seconds', async () => {
		const timeout = new AbortController();
		const spy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
		const { client, fetch } = setup();
		// A fetch that never resolves on its own: it only settles when its signal aborts.
		fetch.mockImplementation(
			(_url, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
				})
		);
		const pending = client.getProduct('3017620422003');
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
		expect(spy).toHaveBeenCalledWith(5000);
		timeout.abort(new DOMException('The operation timed out', 'TimeoutError'));
		expect(await pending).toEqual({ ok: false, reason: 'unavailable' });
	});

	it('gives not_found for status 0, HTTP 404 and a malformed barcode', async () => {
		const missing = { ok: true, value: { kind: 'not_found' } };
		expect(await setup(() => json(notFound)).client.getProduct('00000017')).toEqual(missing);
		expect(await setup(() => json(notFound, 404)).client.getProduct('00000017')).toEqual(missing);
		const { client, fetch } = setup();
		expect(await client.getProduct('12/../x')).toEqual(missing);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('search', () => {
	it('sends the query, the page size and the User-Agent to the search host', async () => {
		const { client, fetch, searchLimiter } = setup(() => json(searchNutella));
		await client.search(' nutella ');
		const [url, init] = fetch.mock.calls[0];
		const parsed = new URL(String(url));
		expect(parsed.origin + parsed.pathname).toBe('https://search.test/search');
		expect(parsed.searchParams.get('q')).toBe('nutella');
		expect(parsed.searchParams.get('page_size')).toBe('20');
		expect(parsed.searchParams.get('fields')).toContain('nutriments');
		expect(new Headers(init?.headers).get('user-agent')).toBe('kcal-avp/1.2.3 (me@example.com)');
		expect(searchLimiter.limit).toHaveBeenCalledOnce();
	});

	it('returns only complete products', async () => {
		const result = await setup(() => json(searchNutella)).client.search('nutella');
		expect(result.ok).toBe(true);
		if (result.ok)
			expect(result.value.map((p) => p.barcode)).toEqual([
				'0009800800049',
				'0098008952506',
				'0613460834124'
			]);
		const cola = await setup(() => json(searchCola)).client.search('cola');
		expect(cola.ok && cola.value.map((p) => [p.barcode, p.nutritionBasis])).toEqual([
			['5000112548068', 'ml'],
			['54001886', 'g']
		]);
	});

	it('returns at most 20 products', async () => {
		const hit = searchNutella.hits[0];
		const hits = Array.from({ length: 30 }, (_, i) => ({ ...hit, code: String(10000000 + i) }));
		const result = await setup(() => json({ hits })).client.search('nutella');
		expect(result.ok && result.value).toHaveLength(20);
	});

	it('skips the call for a blank query', async () => {
		const { client, fetch, searchLimiter } = setup();
		expect(await client.search('   ')).toEqual({ ok: true, value: [] });
		expect(fetch).not.toHaveBeenCalled();
		expect(searchLimiter.limit).not.toHaveBeenCalled();
	});

	it('maps limiter, 429, 503 and a malformed body like the product call', async () => {
		const limited = setup();
		limited.searchLimiter.limit.mockResolvedValue({ success: false });
		expect(await limited.client.search('nutella')).toEqual({ ok: false, reason: 'rate_limited' });
		expect(limited.fetch).not.toHaveBeenCalled();
		expect(await setup(() => json({}, 429)).client.search('nutella')).toEqual({
			ok: false,
			reason: 'rate_limited'
		});
		expect(await setup(() => json({}, 503)).client.search('nutella')).toEqual({
			ok: false,
			reason: 'unavailable'
		});
		expect(await setup(() => json({ nope: true })).client.search('nutella')).toEqual({
			ok: false,
			reason: 'unavailable'
		});
	});
});
