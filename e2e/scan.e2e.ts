import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { gotoHydrated } from './helpers.ts';

// Barcode scanner. The camera and the detector are replaced in the page (addInitScript): getUserMedia returns the
// stream of a canvas, and a global BarcodeDetector, which the scanner prefers over its zxing ponyfill, reports the
// chosen code. Open Food Facts answers from e2e/off-stub.mjs: 3017620422003 and 5449000000996 are products,
// 0000000000000 is an outage and any other valid code is unknown. The OFF product limiter (12 a minute, shared)
// allows the few reads below: at most four per browser project.

const NUTELLA = '3017620422003';
const COLA = '5449000000996';
const OUTAGE = '0000000000000';

/** A day per browser project nobody else logs on, so the two projects never see each other's entries. */
function scanDate(projectName: string): string {
	return projectName.startsWith('chromium') ? '2020-05-10' : '2020-05-11';
}

/** An EAN-13 with a valid check digit that no stub knows and no earlier run created. */
function freshBarcode(): string {
	const body = `2${String(Date.now()).slice(-11)}`;
	let sum = 0;
	for (let i = 0; i < body.length; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
	return `${body}${(10 - (sum % 10)) % 10}`;
}

type Camera = { code?: string; deny?: boolean; torch?: boolean };

async function mockCamera(page: Page, camera: Camera) {
	await page.addInitScript(({ code, deny, torch }) => {
		const w = window as unknown as Record<string, unknown>;
		w.__tracks = [] as MediaStreamTrack[];
		w.__vibrated = [] as number[];
		navigator.vibrate = (pattern) => {
			(w.__vibrated as number[]).push(pattern as number);
			return true;
		};
		const getUserMedia = async () => {
			if (deny) throw new DOMException('Permission denied', 'NotAllowedError');
			const canvas = document.createElement('canvas');
			canvas.width = 320;
			canvas.height = 240;
			const context = canvas.getContext('2d')!;
			context.fillStyle = 'gray';
			context.fillRect(0, 0, 320, 240);
			const stream = canvas.captureStream(10);
			// Keep drawing so the video keeps delivering frames.
			const timer = setInterval(() => context.fillRect(0, 0, 320, 240), 100);
			for (const track of stream.getVideoTracks()) {
				if (torch) {
					(track as unknown as { getCapabilities: () => object }).getCapabilities = () => ({
						torch: true
					});
					track.applyConstraints = async () => {};
				}
				const stop = track.stop.bind(track);
				track.stop = () => {
					clearInterval(timer);
					stop();
				};
				(w.__tracks as MediaStreamTrack[]).push(track);
			}
			return stream;
		};
		// The whole object is replaced: WebKit ignores a getUserMedia override on the real MediaDevices.
		Object.defineProperty(navigator, 'mediaDevices', {
			value: { getUserMedia },
			configurable: true
		});
		(globalThis as unknown as Record<string, unknown>).BarcodeDetector = class {
			async detect() {
				return code ? [{ rawValue: code, format: 'ean_13' }] : [];
			}
		};
	}, camera);
}

async function openScanner(page: Page) {
	const phone = (page.viewportSize()?.width ?? 0) < 1024;
	const nav = page.getByRole('navigation', { name: 'Primary' });
	await nav.getByRole('button', { name: phone ? 'Add food' : /^Add food/ }).click();
	const sheet = page.locator('dialog[data-sheet][open]');
	await expect(sheet.getByRole('searchbox', { name: 'Search foods' })).toBeVisible();
	// The camera stays off until Scan is tapped: no stream is live before it (an earlier one has ended).
	expect(
		await page.evaluate(() =>
			(window as never as { __tracks: MediaStreamTrack[] }).__tracks.every(
				(track) => track.readyState === 'ended'
			)
		)
	).toBe(true);
	await sheet.getByRole('button', { name: 'Scan', exact: true }).click();
	await expect(sheet.getByRole('heading', { name: 'Scan barcode' })).toBeVisible();
	return sheet;
}

test('scanning a known product goes straight to the amount step and logs it', async ({
	page
}, testInfo) => {
	await mockCamera(page, { code: NUTELLA });
	await gotoHydrated(page, `/day/${scanDate(testInfo.project.name)}`);
	const sheet = await openScanner(page);

	await expect(sheet.getByRole('heading', { name: 'Nutella' })).toBeVisible();
	expect(
		await page.evaluate(() => (window as never as { __vibrated: number[] }).__vibrated)
	).toEqual([50]);
	await sheet.getByLabel('Amount').fill('30');
	await sheet.getByRole('button', { name: 'Log' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('button', { name: /^Nutella/ }).first()).toBeVisible();
});

test('an unknown barcode opens the food form with the barcode, and the next scan finds the food', async ({
	page
}, testInfo) => {
	const barcode = freshBarcode();
	const name = `Scanned bar ${testInfo.project.name} ${testInfo.retry} ${Date.now()}`;
	await mockCamera(page, { code: barcode });
	await gotoHydrated(page, `/day/${scanDate(testInfo.project.name)}`);

	const sheet = await openScanner(page);
	await expect(sheet.getByRole('heading', { name: 'New food' })).toBeVisible();
	await expect(sheet.getByLabel('Barcode (optional)')).toHaveValue(barcode);
	await sheet.getByLabel('Name', { exact: true }).fill(name);
	await sheet.getByLabel('Calories', { exact: true }).fill('400');
	await sheet.getByLabel('Protein', { exact: true }).fill('10');
	await sheet.getByLabel('Carbs', { exact: true }).fill('50');
	await sheet.getByLabel('Fat', { exact: true }).fill('15');
	await sheet.getByRole('button', { name: 'Save food' }).click();

	await expect(sheet.getByLabel('Amount')).toBeVisible();
	await sheet.getByLabel('Amount').fill('100');
	await sheet.getByRole('button', { name: 'Log' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();

	// The same code now finds the custom food in the library.
	const again = await openScanner(page);
	await expect(again.getByRole('heading', { name })).toBeVisible();
	await expect(again.getByLabel('Amount')).toBeVisible();
});

test('a denied camera explains why and manual entry still works', async ({ page }) => {
	await mockCamera(page, { deny: true });
	await gotoHydrated(page, '/');
	const sheet = await openScanner(page);

	await expect(sheet.getByText(/Camera access was denied/)).toBeVisible();
	await expect(sheet.getByText('Accepts EAN-13, UPC-A or EAN-8.', { exact: false })).toBeVisible();

	await sheet.getByLabel('Barcode number').fill('12345');
	await sheet.getByRole('button', { name: 'Look up' }).click();
	await expect(sheet.getByText('That is not a valid barcode.')).toBeVisible();

	await sheet.getByLabel('Barcode number').fill(COLA);
	await sheet.getByRole('button', { name: 'Look up' }).click();
	await expect(sheet.getByRole('heading', { name: 'Coca-Cola Original' })).toBeVisible();
	await expect(sheet.getByLabel('Amount')).toBeVisible();
});

test('a browser without a camera API falls back to manual entry', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
	});
	await gotoHydrated(page, '/');
	const phone = (page.viewportSize()?.width ?? 0) < 1024;
	await page
		.getByRole('navigation', { name: 'Primary' })
		.getByRole('button', { name: phone ? 'Add food' : /^Add food/ })
		.click();
	const sheet = page.locator('dialog[data-sheet][open]');
	await sheet.getByRole('button', { name: 'Scan', exact: true }).click();
	await expect(sheet.getByText(/cannot open the camera/)).toBeVisible();
	await expect(sheet.getByLabel('Barcode number')).toBeVisible();
});

test('an unreachable product database keeps the barcode for manual entry', async ({ page }) => {
	await mockCamera(page, { code: OUTAGE });
	await gotoHydrated(page, '/');
	const sheet = await openScanner(page);

	await expect(sheet.getByText('Product database unreachable')).toBeVisible();
	await sheet.getByRole('button', { name: 'Enter the food manually' }).click();
	await expect(sheet.getByRole('heading', { name: 'New food' })).toBeVisible();
	await expect(sheet.getByLabel('Barcode (optional)')).toHaveValue(OUTAGE);
});

test('the torch button shows only when the camera reports a torch', async ({ page }) => {
	await mockCamera(page, { torch: true });
	await gotoHydrated(page, '/');
	const sheet = await openScanner(page);
	await sheet.getByRole('button', { name: 'Turn torch on' }).click();
	await expect(sheet.getByRole('button', { name: 'Turn torch off' })).toBeVisible();
});

test('there is no torch button without torch support, and closing the sheet stops the camera', async ({
	page
}) => {
	await mockCamera(page, {});
	await gotoHydrated(page, '/');
	const sheet = await openScanner(page);
	await expect(sheet.getByText('Point the camera at the barcode')).toBeVisible();
	await expect(sheet.getByRole('button', { name: /torch/ })).toHaveCount(0);

	await page.keyboard.press('Escape');
	await expect(sheet).toBeHidden();
	await expect
		.poll(() =>
			page.evaluate(() =>
				(window as never as { __tracks: MediaStreamTrack[] }).__tracks.map((t) => t.readyState)
			)
		)
		.toEqual(['ended']);
});
