import { beforeNavigate, goto } from '$app/navigation';

/** Where a blocked navigation was headed. */
type Pending = { url: URL; delta: number | null };

/**
 * Guards a form with unsaved changes. Create it while a component initializes (it registers `beforeNavigate`):
 *
 * - An in app navigation while `dirty()` is cancelled and `open` turns true, for a "Discard changes?" sheet that calls
 *   `discard()` (go on to where the person was headed) or `keep()` (stay).
 * - Leaving the page for real (reload, close, external link) gets the browser's own prompt through
 *   `onbeforeunload`, which the component attaches to the window.
 * - `allow()` lets the next navigations through, for a write that leaves the page on purpose (archive).
 *
 * After a save, `dirty()` is false again, so a successful save never blocks anything.
 */
export class UnsavedGuard {
	/** True while the discard question is showing. */
	open = $state(false);

	#dirty: () => boolean;
	#allowed = false;
	#pending: Pending | null = null;

	constructor(dirty: () => boolean) {
		this.#dirty = dirty;
		beforeNavigate((navigation) => {
			if (this.#allowed || !this.#dirty()) return;
			// A real unload is the browser's prompt, from `onbeforeunload`. Cancelling it here would swallow a link
			// to another site without any prompt.
			if (navigation.willUnload || !navigation.to) return;
			navigation.cancel();
			this.#pending = {
				url: navigation.to.url,
				delta: navigation.type === 'popstate' ? (navigation.delta ?? null) : null
			};
			this.open = true;
		});
	}

	/** The window's `beforeunload` handler. */
	onbeforeunload = (event: BeforeUnloadEvent) => {
		if (this.#allowed || !this.#dirty()) return;
		event.preventDefault();
		event.returnValue = '';
	};

	/** Stops guarding: the next navigations go through. */
	allow() {
		this.#allowed = true;
	}

	/** Stay on the page. */
	keep() {
		this.open = false;
		this.#pending = null;
	}

	/** Drop the changes and go where the person was headed. */
	async discard() {
		const pending = this.#pending;
		this.open = false;
		this.#pending = null;
		this.#allowed = true;
		if (!pending) return;
		if (pending.delta !== null) {
			history.go(pending.delta);
			return;
		}
		try {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- the URL is the one SvelteKit was already headed to
			await goto(pending.url);
		} catch (cause) {
			// The page stays, so the guard has to come back.
			this.#allowed = false;
			throw cause;
		}
	}
}
