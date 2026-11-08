import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import SignOutButton from './SignOutButton.svelte';

const mocks = vi.hoisted(() => ({ signOutOrWarn: vi.fn() }));

vi.mock('#lib/auth-client.ts', () => ({ signOutOrWarn: mocks.signOutOrWarn }));

beforeEach(() => {
	mocks.signOutOrWarn.mockReset().mockResolvedValue(true);
});

/** Makes the next sign out wait until the test resolves it with the result. */
function holdSignOut() {
	let finish!: (ok: boolean) => void;
	mocks.signOutOrWarn.mockReturnValueOnce(new Promise<boolean>((resolve) => (finish = resolve)));
	return finish;
}

describe('SignOutButton', () => {
	it('signs out through signOutOrWarn when clicked', async () => {
		render(SignOutButton);
		await page.getByRole('button', { name: 'Sign out' }).click();
		expect(mocks.signOutOrWarn).toHaveBeenCalledTimes(1);
	});

	it('is disabled while signing out', async () => {
		holdSignOut();
		render(SignOutButton);
		const button = page.getByRole('button', { name: 'Sign out' });
		await button.click();
		await expect.element(button).toHaveAttribute('aria-disabled', 'true');
	});

	it('re-enables when signing out returns false', async () => {
		const finish = holdSignOut();
		render(SignOutButton);
		const button = page.getByRole('button', { name: 'Sign out' });
		await button.click();
		finish(false);
		await expect.element(button).not.toHaveAttribute('aria-disabled');
	});
});
