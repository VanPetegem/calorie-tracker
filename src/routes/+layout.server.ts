import type { LayoutServerLoad } from './$types';

// Gives the root layout a server load on purpose. When a client side data request fails, SvelteKit's client does a
// full navigation only if the root layout has one (`load_root_error_page` checks `app.server_loads[0] === 0`). The
// service worker's offline 503 for an uncached `__data.json` relies on that navigation. Keep this empty.
export const load: LayoutServerLoad = () => ({});
