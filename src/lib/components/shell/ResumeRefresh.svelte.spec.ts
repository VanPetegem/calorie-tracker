import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ResumeRefresh from './ResumeRefresh.svelte';

const mocks = vi.hoisted(() => ({ invalidateAll: vi.fn() }));

vi.mock('$app/navigation', () => ({ invalidateAll: mocks.invalidateAll }));

function setVisibility(state: 'visible' | 'hidden') {
	Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
	document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
	mocks.invalidateAll.mockReset();
	mocks.invalidateAll.mockResolvedValue(undefined);
});

describe('ResumeRefresh', () => {
	it('reloads the page data when the app becomes visible again', () => {
		render(ResumeRefresh);
		setVisibility('visible');
		expect(mocks.invalidateAll).toHaveBeenCalledOnce();
	});

	it('does nothing when the app goes to the background', () => {
		render(ResumeRefresh);
		setVisibility('hidden');
		expect(mocks.invalidateAll).not.toHaveBeenCalled();
	});

	it('swallows a failed refresh, such as resuming offline', async () => {
		mocks.invalidateAll.mockRejectedValue(new Error('offline'));
		const unhandled = vi.fn();
		window.addEventListener('unhandledrejection', unhandled);
		render(ResumeRefresh);
		setVisibility('visible');
		await new Promise((resolve) => setTimeout(resolve, 20));
		window.removeEventListener('unhandledrejection', unhandled);
		expect(unhandled).not.toHaveBeenCalled();
	});
});
