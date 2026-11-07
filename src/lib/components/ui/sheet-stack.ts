/**
 * The open sheet layers, last one on top. Everything else at the top of the body is made `inert` while a sheet is
 * open, which is what `showModal()` would do: the page behind (and a sheet below the top one) takes no taps, focus
 * or screen reader reading. Only elements this module made inert are given back.
 */
const stack: HTMLElement[] = [];
const madeInert = new Set<HTMLElement>();

function apply() {
	for (const element of madeInert) element.inert = false;
	madeInert.clear();
	const top = stack.at(-1);
	if (!top) return;
	for (const child of document.body.children) {
		if (child === top || !(child instanceof HTMLElement) || child.inert) continue;
		child.inert = true;
		madeInert.add(child);
	}
}

function remove(layer: HTMLElement) {
	const index = stack.indexOf(layer);
	if (index !== -1) stack.splice(index, 1);
}

/** Puts the layer on top of the stack (again). */
export function pushLayer(layer: HTMLElement) {
	remove(layer);
	stack.push(layer);
	apply();
}

/** Takes the layer off the stack; the one below it, or the page, becomes interactive again. */
export function popLayer(layer: HTMLElement) {
	remove(layer);
	apply();
}

export const isTopLayer = (layer: HTMLElement) => stack.at(-1) === layer;
