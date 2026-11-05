export type ToastTone = 'neutral' | 'success' | 'danger';

export type ToastAction = { label: string; run: () => void | Promise<void> };

export type ToastOptions = {
	message: string;
	tone?: ToastTone;
	action?: ToastAction;
	durationMs?: number;
};

export type ToastItem = {
	id: string;
	message: string;
	tone: ToastTone;
	action?: ToastAction;
};

const DEFAULT_DURATION_MS = 5000;
const MIN_ACTION_DURATION_MS = 5000;
const MAX_VISIBLE = 3;

class Toasts {
	items = $state<ToastItem[]>([]);

	#timers = new Map<string, ReturnType<typeof setTimeout>>();
	#counter = 0;

	/** Shows a toast and returns its id. The oldest toast is pushed out beyond three. */
	show({ message, tone = 'neutral', action, durationMs }: ToastOptions): string {
		const id = `toast-${++this.#counter}`;
		const base = durationMs ?? DEFAULT_DURATION_MS;
		const duration = action ? Math.max(base, MIN_ACTION_DURATION_MS) : base;

		this.items.push({ id, message, tone, action });
		while (this.items.length > MAX_VISIBLE) this.dismiss(this.items[0]!.id);
		this.#timers.set(
			id,
			setTimeout(() => this.dismiss(id), duration)
		);
		return id;
	}

	dismiss(id: string): void {
		clearTimeout(this.#timers.get(id));
		this.#timers.delete(id);
		this.items = this.items.filter((item) => item.id !== id);
	}
}

export const toasts = new Toasts();

/**
 * Runs `apply` now and offers an Undo toast. Undo dismisses the toast and runs `revert`.
 * If the toast expires, `revert` is never called.
 */
export function withUndo(opts: {
	message: string;
	apply: () => void;
	revert: () => void | Promise<void>;
}): void {
	opts.apply();
	// The Undo button stays in the DOM while the toast animates out, so a double tap must not revert twice.
	let undone = false;
	const id = toasts.show({
		message: opts.message,
		action: {
			label: 'Undo',
			run: async () => {
				if (undone) return;
				undone = true;
				toasts.dismiss(id);
				try {
					await opts.revert();
				} catch {
					toasts.show({ message: 'Could not undo. Try again.', tone: 'danger' });
				}
			}
		}
	});
}
