import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toasts, withUndo } from './toasts.svelte.ts';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	for (const item of [...toasts.items]) toasts.dismiss(item.id);
	vi.useRealTimers();
});

describe('toasts', () => {
	it('adds an item and removes it after the default 5000 ms', () => {
		const id = toasts.show({ message: 'Saved' });
		expect(toasts.items.map((item) => item.id)).toEqual([id]);
		vi.advanceTimersByTime(4999);
		expect(toasts.items).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(toasts.items).toHaveLength(0);
	});

	it('uses the neutral tone by default', () => {
		toasts.show({ message: 'Saved' });
		expect(toasts.items[0]?.tone).toBe('neutral');
	});

	it('removes an item on dismiss and does not fire its timer later', () => {
		const id = toasts.show({ message: 'Saved' });
		toasts.dismiss(id);
		expect(toasts.items).toHaveLength(0);
		const other = toasts.show({ message: 'Other' });
		vi.advanceTimersByTime(4000);
		toasts.dismiss(id);
		expect(toasts.items.map((item) => item.id)).toEqual([other]);
	});

	it('keeps a toast with an action for at least 5000 ms', () => {
		toasts.show({ message: 'Deleted', durationMs: 1000, action: { label: 'Undo', run: () => {} } });
		vi.advanceTimersByTime(4999);
		expect(toasts.items).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(toasts.items).toHaveLength(0);
	});

	it('honors a longer duration', () => {
		toasts.show({ message: 'Long', durationMs: 8000 });
		vi.advanceTimersByTime(7999);
		expect(toasts.items).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(toasts.items).toHaveLength(0);
	});

	it('pushes out the oldest toast when a 4th is shown', () => {
		const ids = ['a', 'b', 'c', 'd'].map((message) => toasts.show({ message }));
		expect(toasts.items.map((item) => item.id)).toEqual(ids.slice(1));
	});
});

describe('withUndo', () => {
	it('applies once and shows an Undo toast', () => {
		const apply = vi.fn();
		const revert = vi.fn();
		withUndo({ message: 'Entry deleted', apply, revert });
		expect(apply).toHaveBeenCalledOnce();
		expect(revert).not.toHaveBeenCalled();
		expect(toasts.items).toHaveLength(1);
		expect(toasts.items[0]?.message).toBe('Entry deleted');
		expect(toasts.items[0]?.action?.label).toBe('Undo');
	});

	it('returns a function that removes the toast without reverting', () => {
		const revert = vi.fn();
		const dismiss = withUndo({ message: 'Entry deleted', apply: vi.fn(), revert });
		dismiss();
		expect(toasts.items).toHaveLength(0);
		expect(revert).not.toHaveBeenCalled();
	});

	it('the returned function also removes the Retry toast of a failed revert', async () => {
		const dismiss = withUndo({
			message: 'Entry deleted',
			apply: vi.fn(),
			revert: vi.fn().mockRejectedValue(new Error('offline'))
		});
		await toasts.items[0]!.action!.run();
		expect(toasts.items[0]?.tone).toBe('danger');
		dismiss();
		expect(toasts.items).toHaveLength(0);
	});

	it('reverts once and removes the toast when the action runs', async () => {
		const apply = vi.fn();
		const revert = vi.fn();
		withUndo({ message: 'Entry deleted', apply, revert });
		await toasts.items[0]!.action!.run();
		expect(revert).toHaveBeenCalledOnce();
		expect(apply).toHaveBeenCalledOnce();
		expect(toasts.items).toHaveLength(0);
	});

	it('reverts only once when Undo is tapped twice', async () => {
		const revert = vi.fn();
		withUndo({ message: 'Entry deleted', apply: vi.fn(), revert });
		const action = toasts.items[0]!.action!;
		await Promise.all([action.run(), action.run()]);
		expect(revert).toHaveBeenCalledOnce();
	});

	it('never reverts when the toast expires', () => {
		const revert = vi.fn();
		withUndo({ message: 'Entry deleted', apply: vi.fn(), revert });
		vi.advanceTimersByTime(10_000);
		expect(toasts.items).toHaveLength(0);
		expect(revert).not.toHaveBeenCalled();
	});

	it('reports a failed revert with a danger toast', async () => {
		const revert = vi.fn().mockRejectedValue(new Error('offline'));
		withUndo({ message: 'Entry deleted', apply: vi.fn(), revert });
		await toasts.items[0]!.action!.run();
		expect(toasts.items).toHaveLength(1);
		expect(toasts.items[0]?.tone).toBe('danger');
	});

	it('offers a retry after a failed revert', async () => {
		const revert = vi
			.fn()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce(undefined);
		withUndo({ message: 'Entry deleted', apply: vi.fn(), revert });
		await toasts.items[0]!.action!.run();
		expect(toasts.items[0]?.action?.label).toBe('Retry');
		await toasts.items[0]!.action!.run();
		expect(revert).toHaveBeenCalledTimes(2);
		expect(toasts.items).toHaveLength(0);
	});
});
