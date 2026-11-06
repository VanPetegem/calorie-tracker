// Local stand in for Open Food Facts (product API and search-a-licious), used by the e2e Worker through
// OFF_BASE_URL and OFF_SEARCH_URL. It serves the recorded fixtures in src/lib/server/off/fixtures.
// Barcode 0000000000000 and the search terms "outage" and "riz" answer 503, to exercise the unavailable path.
// ("riz" is also a word the BLV library knows, so a test can see library results stay while OFF is down.)
// A barcode that only a search fixture knows is served as a product built from that search hit, so a picked
// search result resolves the way the real product API would.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const PORT = 4174;
const FIXTURES = new URL('../src/lib/server/off/fixtures/', import.meta.url);
const load = (name) => readFileSync(new URL(name, FIXTURES), 'utf8');

const PRODUCTS = {
	3017620422003: 'product-full.json',
	5449000000996: 'product-ml.json',
	7612345678900: 'product-serving-only.json'
};
const SEARCHES = { nutella: 'search-nutella.json', cola: 'search-cola.json' };
const OUTAGE_TERMS = ['outage', 'riz'];

function searchHit(barcode) {
	for (const file of Object.values(SEARCHES)) {
		const hit = JSON.parse(load(file)).hits.find((h) => h.code === barcode);
		if (hit) return hit;
	}
	return undefined;
}

function send(res, status, body) {
	res.writeHead(status, { 'content-type': 'application/json' });
	res.end(body);
}

createServer((req, res) => {
	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

	const product = url.pathname.match(/^\/api\/v2\/product\/(\d+)$/);
	if (product) {
		const barcode = product[1];
		if (barcode === '0000000000000') return send(res, 503, '{"error":"unavailable"}');
		const file = PRODUCTS[barcode];
		if (file) return send(res, 200, load(file));
		const hit = searchHit(barcode);
		if (hit) return send(res, 200, JSON.stringify({ code: barcode, status: 1, product: hit }));
		return send(res, 404, load('product-not-found.json'));
	}

	if (url.pathname === '/search') {
		const term = (url.searchParams.get('q') ?? '').toLowerCase();
		if (OUTAGE_TERMS.some((word) => term.includes(word)))
			return send(res, 503, '{"error":"unavailable"}');
		const key = Object.keys(SEARCHES).find((name) => term.includes(name));
		return send(res, 200, key ? load(SEARCHES[key]) : JSON.stringify({ hits: [], count: 0 }));
	}

	send(res, 404, '{"error":"not found"}');
}).listen(PORT, 'localhost');
