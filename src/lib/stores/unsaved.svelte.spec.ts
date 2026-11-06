import { beforeEach, describe, expect, it, vi } from 'vitest';

type Navigation = {
	cancel: () => void;
	to: { url: URL } | null;
	type: string;
	delta?: number;
	willUnload: boolean;
};

const mocks = vi.hoisted(() => ({
	goto: vi.fn(),
	callbacks: [] as ((navigation: Navigation) => void)[]
}));

vi.mock('$app/navigation', () => ({
	goto: mocks.goto,
	beforeNavigate: (callback: (navigation: Navigation) => void) => {
		mocks.callbacks.push(callback);
	}
}));

import { UnsavedGuard } from './unsaved.svelte.ts';

const weight = new URL('http://localhost/weight');

beforeEach(() => {
	mocks.goto.mockReset();
	mocks.goto.mockResolvedValue(undefined);
	mocks.callbacks.length = 0;
	vi.restoreAllMocks();
});

function navigate(overrides: Partial<Navigation> = {}) {
	const cancel = vi.fn();
	mocks.callbacks[0]!({
		cancel,
		to: { url: weight },
		type: 'link',
		willUnload: false,
		...overrides
	});
	return cancel;
}

describe('UnsavedGuard', () => {
	it('lets a navigation through while nothing is dirty', () => {
		const guard = new UnsavedGuard(() => false);
		expect(navigate()).not.toHaveBeenCalled();
		expect(guard.open).toBe(false);
	});

	it('cancels an in app navigation while dirty and opens the question', () => {
		const guard = new UnsavedGuard(() => true);
		expect(navigate()).toHaveBeenCalledTimes(1);
		expect(guard.open).toBe(true);
	});

	it('leaves a real unload to the browser prompt instead of cancelling it', () => {
		const guard = new UnsavedGuard(() => true);
		expect(navigate({ type: 'leave', willUnload: true, to: null })).not.toHaveBeenCalled();
		expect(navigate({ willUnload: true })).not.toHaveBeenCalled();
		expect(guard.open).toBe(false);
	});

	it('prompts on beforeunload only while dirty', () => {
		let dirty = true;
		const guard = new UnsavedGuard(() => dirty);
		const prevented = () => {
			const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
			guard.onbeforeunload(event);
			return event.defaultPrevented;
		};
		expect(prevented()).toBe(true);
		dirty = false;
		expect(prevented()).toBe(false);
	});

	it('goes to the target on discard', async () => {
		const guard = new UnsavedGuard(() => true);
		navigate();
		await guard.discard();
		expect(mocks.goto).toHaveBeenCalledWith(weight);
		expect(guard.open).toBe(false);
		expect(navigate()).not.toHaveBeenCalled();
	});

	it('cancels a back navigation too, and discard replays it through history by its delta', async () => {
		const go = vi.spyOn(history, 'go').mockImplementation(() => {});
		const guard = new UnsavedGuard(() => true);
		expect(navigate({ type: 'popstate', delta: -2 })).toHaveBeenCalledTimes(1);
		expect(guard.open).toBe(true);
		await guard.discard();
		expect(go).toHaveBeenCalledWith(-2);
		expect(mocks.goto).not.toHaveBeenCalled();
	});

	it('stays on keep, and asks again on the next navigation', () => {
		const guard = new UnsavedGuard(() => true);
		navigate();
		guard.keep();
		expect(guard.open).toBe(false);
		expect(navigate()).toHaveBeenCalledTimes(1);
	});

	it('guards again when the navigation after a discard fails', async () => {
		mocks.goto.mockRejectedValue(new Error('offline'));
		const guard = new UnsavedGuard(() => true);
		navigate();
		await expect(guard.discard()).rejects.toThrow('offline');
		expect(navigate()).toHaveBeenCalledTimes(1);
	});

	it('lets everything through after allow()', () => {
		const guard = new UnsavedGuard(() => true);
		guard.allow();
		expect(navigate()).not.toHaveBeenCalled();
	});
});
