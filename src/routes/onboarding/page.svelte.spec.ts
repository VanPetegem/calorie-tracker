import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { weekRow } from '#lib/components/targets/week.fixture.ts';
import { PROFILE_ALREADY_SET_UP } from '#lib/schemas/settings.ts';
import Page from './+page.svelte';

const mocks = vi.hoisted(() => ({ completeOnboarding: vi.fn(), goto: vi.fn() }));

vi.mock('./onboarding.remote.ts', () => ({ completeOnboarding: mocks.completeOnboarding }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto, invalidateAll: vi.fn() }));

beforeEach(() => {
	mocks.completeOnboarding.mockReset();
	mocks.goto.mockReset().mockResolvedValue(undefined);
});

async function fillAndSubmit() {
	render(Page, { data: { kg: null, today: '2026-11-08' }, params: {}, form: null } as never);
	await page.getByLabelText('Weight', { exact: true }).fill('72');
	await page.getByRole('radio', { name: 'Male', exact: true }).click();
	await page.getByLabelText('Birth date').fill('1990-11-04');
	await page.getByLabelText('Height', { exact: true }).fill('180');
	await page.getByRole('radio', { name: 'Moderate' }).click();
	await page.getByRole('button', { name: 'Calculate my target' }).click();
}

describe('onboarding page', () => {
	it('goes to Today when the profile is already set up', async () => {
		mocks.completeOnboarding.mockImplementation(async () => error(400, PROFILE_ALREADY_SET_UP));
		await fillAndSubmit();
		await vi.waitFor(() => expect(mocks.goto).toHaveBeenCalledWith('/'));
		expect(page.getByRole('alert').elements()).toHaveLength(0);
	});

	it('stays on the form for a 400 other than already set up', async () => {
		mocks.completeOnboarding.mockImplementation(async () => error(400, 'Age must be 16 to 100'));
		await fillAndSubmit();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Age must be 16 to 100');
		expect(mocks.goto).not.toHaveBeenCalled();
	});

	it('shows the first target after a save', async () => {
		mocks.completeOnboarding.mockResolvedValue(weekRow('2026-11-02', { targetKcal: 2450 }));
		await fillAndSubmit();
		await expect.element(page.getByRole('heading', { name: 'Your first target' })).toBeVisible();
		expect(mocks.goto).not.toHaveBeenCalled();
	});
});
