import type { MappedProduct } from '../foods/repo.ts';
import { mapOffProduct, type OffProductResult } from './map.ts';

export type { OffProductResult } from './map.ts';

/** Why an OFF call gave no answer. The caller shows "unavailable" and keeps the library usable. */
export type OffResult<T> =
	{ ok: true; value: T } | { ok: false; reason: 'rate_limited' | 'unavailable' };

export type OffClient = {
	getProduct(barcode: string): Promise<OffResult<OffProductResult>>;
	search(query: string): Promise<OffResult<MappedProduct[]>>;
};

export type OffClientDeps = {
	fetch: typeof fetch;
	/** Product API host, e.g. `https://world.openfoodfacts.org`. */
	baseUrl: string;
	/** Search host: full text search is a separate service, e.g. `https://search.openfoodfacts.org`. */
	searchBaseUrl: string;
	contactEmail: string;
	version: string;
	productLimiter: RateLimit;
	searchLimiter: RateLimit;
};

export const OFF_TIMEOUT_MS = 5000;
export const OFF_SEARCH_LIMIT = 20;

/** Only what `mapOffProduct` reads: OFF documents are large, and lighter responses are faster. */
const FIELDS = [
	'code',
	'product_name',
	'brands',
	'nutriments',
	'serving_size',
	'serving_quantity',
	'quantity',
	'product_quantity_unit'
].join(',');

// Both limiters count every call under one key: OFF's limits are per IP and the Worker is one client.
const LIMIT_KEY = 'off';

type Fetched =
	{ ok: true; json: unknown } | { ok: false; reason: 'rate_limited' | 'unavailable' | 'not_found' };

export function createOffClient(deps: OffClientDeps): OffClient {
	const headers = {
		'User-Agent': `kcal-avp/${deps.version} (${deps.contactEmail})`,
		Accept: 'application/json'
	};

	async function load(url: string, limiter: RateLimit): Promise<Fetched> {
		try {
			const { success } = await limiter.limit({ key: LIMIT_KEY });
			if (!success) return { ok: false, reason: 'rate_limited' };
			const response = await deps.fetch(url, {
				headers,
				signal: AbortSignal.timeout(OFF_TIMEOUT_MS)
			});
			if (response.status === 429) return { ok: false, reason: 'rate_limited' };
			// The product API answers an unknown barcode with 404 and a JSON body.
			if (response.status === 404) return { ok: false, reason: 'not_found' };
			if (!response.ok) return { ok: false, reason: 'unavailable' };
			return { ok: true, json: await response.json() };
		} catch {
			// Network error, timeout, or a body that is not JSON (OFF serves HTML error pages).
			return { ok: false, reason: 'unavailable' };
		}
	}

	return {
		async getProduct(barcode) {
			if (!/^\d{8,14}$/.test(barcode)) return { ok: true, value: { kind: 'not_found' } };
			const url = `${deps.baseUrl}/api/v2/product/${barcode}?fields=${FIELDS}`;
			const result = await load(url, deps.productLimiter);
			if (!result.ok) {
				return result.reason === 'not_found'
					? { ok: true, value: { kind: 'not_found' } }
					: { ok: false, reason: result.reason };
			}
			// OFF answers an unknown barcode with status 0 (sometimes HTTP 200); the mapper turns it into not_found.
			if (typeof result.json !== 'object' || result.json === null)
				return { ok: false, reason: 'unavailable' };
			return { ok: true, value: mapOffProduct({ code: barcode, ...result.json }) };
		},

		async search(query) {
			const term = query.trim();
			if (term === '') return { ok: true, value: [] };
			const params = new URLSearchParams({
				q: term,
				page_size: String(OFF_SEARCH_LIMIT),
				fields: FIELDS
			});
			const result = await load(`${deps.searchBaseUrl}/search?${params}`, deps.searchLimiter);
			if (!result.ok) {
				return { ok: false, reason: result.reason === 'not_found' ? 'unavailable' : result.reason };
			}
			const hits = (result.json as { hits?: unknown } | null)?.hits;
			if (!Array.isArray(hits)) return { ok: false, reason: 'unavailable' };
			const products: MappedProduct[] = [];
			for (const hit of hits) {
				const mapped = mapOffProduct(hit);
				if (mapped.kind === 'found') products.push(mapped.product);
			}
			return { ok: true, value: products.slice(0, OFF_SEARCH_LIMIT) };
		}
	};
}
