import { expect, test } from './fixtures.ts';
import { gotoHydrated } from './helpers.ts';

// The virtual authenticator is a Chrome DevTools Protocol feature.
test.skip(({ browserName }) => browserName !== 'chromium', 'chromium only (CDP WebAuthn)');

test('add a passkey, sign in with it, then delete it', async ({ page, context }) => {
	const cdp = await context.newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true
		}
	});

	await gotoHydrated(page, '/settings/security');
	await expect(page.getByRole('heading', { name: 'No passkeys yet' })).toBeVisible();
	await page.getByRole('button', { name: 'Add a passkey' }).click();
	const list = page.getByRole('list', { name: 'Passkeys' });
	await expect(list.getByRole('listitem')).toHaveCount(1);
	// Named after the device; the Desktop Chrome profile reports a Windows user agent.
	const name = 'Windows';
	await expect(list.getByRole('listitem')).toContainText(name);
	await expect(list.getByRole('listitem')).toContainText(/Added /);

	// A new browser session: no cookies, only the passkey on the authenticator.
	await context.clearCookies();
	await gotoHydrated(page, '/login');
	await page.getByRole('button', { name: 'Sign in with passkey' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
	expect((await context.cookies()).some((c) => c.name.includes('session_token'))).toBe(true);

	// Deleting asks first, in a sheet, and has no undo.
	await gotoHydrated(page, '/settings/security');
	await page.getByRole('button', { name: `Delete ${name} passkey` }).click();
	const sheet = page.getByRole('dialog', { name: `Delete ${name} passkey?` });
	await expect(sheet).toBeVisible();
	await sheet.getByRole('button', { name: 'Delete' }).click();
	await expect(sheet).toBeHidden();
	const toast = page.getByText(`${name} passkey deleted`);
	await expect(toast).toBeVisible();
	await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'No passkeys yet' })).toBeVisible();
});
