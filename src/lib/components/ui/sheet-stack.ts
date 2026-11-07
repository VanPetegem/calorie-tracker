/**
 * The open sheet layers, last one on top, and everything `showModal()` used to provide for them (Sheet.svelte
 * explains why sheets do not use it):
 * - paint order: an opening layer moves to the end of the body, and each layer's z-index follows its place in the
 *   stack, so the top sheet is drawn on top even when it was reopened without moving;
 * - inert: every other element at the top of the body is made `inert`, also one added while a sheet is open, so
 *   the page behind (and a sheet below the top one) takes no taps, focus or screen reader reading;
 * - close requests: Escape closes only the top sheet. A control inside a sheet that handles Escape itself must call
 *   `preventDefault()`: this listener sits on `document`, so `stopPropagation()` does not reach it. The Android
 *   back gesture does not close a sheet (no CloseWatcher: it made the component tests flaky; the app is used on iOS).
 * Only elements this module made inert are given back.
 */

type Entry = { layer: HTMLElement; requestClose: () => void };

const stack: Entry[] = [];
const madeInert = new Set<HTMLElement>();
let observer: MutationObserver | undefined;
/** The z-index of the bottom layer, above the tab bar and the toasts; matches `.layer` in Sheet.svelte. */
const LAYER_Z = 60;

function apply() {
	const top = stack.at(-1)?.layer;
	// Only changes are written, so an element that stays inert is never briefly given back.
	for (const element of madeInert) {
		if (!top || element === top || element.parentElement !== document.body) {
			element.inert = false;
			madeInert.delete(element);
		}
	}
	if (!top) {
		observer?.disconnect();
		observer = undefined;
		document.removeEventListener('keydown', handleKeydown);
		return;
	}
	stack.forEach((entry, index) => (entry.layer.style.zIndex = String(LAYER_Z + index)));
	for (const child of document.body.children) {
		if (child === top || !(child instanceof HTMLElement) || child.inert) continue;
		child.inert = true;
		madeInert.add(child);
	}
	if (!observer) {
		observer = new MutationObserver(apply);
		observer.observe(document.body, { childList: true });
		document.addEventListener('keydown', handleKeydown);
	}
}

/** Escape closes the top sheet, unless an IME composition or a control inside the sheet took the key. */
function handleKeydown(event: KeyboardEvent) {
	if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
	const top = stack.at(-1);
	if (!top) return;
	event.preventDefault();
	top.requestClose();
}

function remove(layer: HTMLElement) {
	const index = stack.findIndex((entry) => entry.layer === layer);
	if (index === -1) return;
	stack.splice(index, 1);
	layer.style.zIndex = '';
}

/**
 * Puts the layer on top of the stack (again). When `move`, it is also drawn above the others: only while opening,
 * because moving an open dialog in the DOM can close it.
 */
export function pushLayer(layer: HTMLElement, requestClose: () => void, move: boolean) {
	remove(layer);
	if (move && layer !== document.body.lastElementChild) {
		document.body.appendChild(layer);
	}
	stack.push({ layer, requestClose });
	apply();
}

/** Takes the layer off the stack; the one below it, or the page, becomes interactive again. Safe to repeat. */
export function popLayer(layer: HTMLElement) {
	remove(layer);
	apply();
}
