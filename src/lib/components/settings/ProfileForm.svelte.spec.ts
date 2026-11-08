import { error } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ProfileForm from './ProfileForm.svelte';

const field = (label: string) => page.getByLabelText(label, { exact: true });

/** Renders the Settings profile (no weight), with the day the age is counted on. */
function renderSettings(today: string, onsubmit = vi.fn().mockResolvedValue(undefined)) {
	render(ProfileForm, { withWeight: false, today, submitLabel: 'Save profile', onsubmit });
	return onsubmit;
}

describe('ProfileForm', () => {
	it('shows a height error once the field loses focus, not while it is typed', async () => {
		renderSettings('2026-11-08');
		await field('Height').fill('99');
		// Nothing is committed yet, so no message of any kind may show.
		expect(page.getByRole('alert').query()).toBeNull();
		await field('Birth date').click();
		await expect.element(page.getByText('Enter at least 100')).toBeVisible();
	});

	it('reports an age under 16 once the birth date loses focus, counted on the given day', async () => {
		// Born 8 November 2010: 15 on 7 November 2026, so the day given decides the answer.
		renderSettings('2026-11-07');
		await field('Birth date').fill('2010-11-08');
		await field('Height').click();
		await expect.element(page.getByText('Age must be 16 to 100')).toBeVisible();
	});

	it('accepts 16 on the birthday itself', async () => {
		renderSettings('2026-11-08');
		await field('Birth date').fill('2010-11-08');
		await field('Height').click();
		expect(page.getByText('Age must be 16 to 100').query()).toBeNull();
	});

	it('refuses an age out of range on submit and does not save', async () => {
		const onsubmit = renderSettings('2026-11-08');
		await page.getByRole('radio', { name: 'Male', exact: true }).click();
		// Born 8 November 2015: 11 on the day given.
		await field('Birth date').fill('2015-11-08');
		await field('Height').fill('180');
		await page.getByRole('radio', { name: 'Moderate' }).click();
		await page.getByRole('button', { name: 'Save profile' }).click();
		await expect.element(page.getByText('Age must be 16 to 100')).toBeVisible();
		expect(onsubmit).not.toHaveBeenCalled();
	});

	it('does not submit an incomplete profile and shows an error for each missing field', async () => {
		const onsubmit = renderSettings('2026-11-08');
		await page.getByRole('button', { name: 'Save profile' }).click();
		await expect.element(page.getByText('Choose one')).toBeVisible();
		await expect.element(page.getByText('Enter a date as YYYY-MM-DD')).toBeVisible();
		await expect.element(page.getByText('Enter a number')).toBeVisible();
		await expect.element(page.getByText('Choose an activity level')).toBeVisible();
		expect(onsubmit).not.toHaveBeenCalled();
	});

	it('submits the profile fields only, with no weight, when the form has no weight field', async () => {
		const onsubmit = renderSettings('2026-11-08');
		expect(page.getByLabelText('Weight', { exact: true }).query()).toBeNull();
		await page.getByRole('radio', { name: 'Male', exact: true }).click();
		await field('Birth date').fill('1990-11-04');
		await field('Height').fill('180');
		await page.getByRole('radio', { name: 'Moderate' }).click();
		await page.getByRole('button', { name: 'Save profile' }).click();
		await vi.waitFor(() =>
			expect(onsubmit).toHaveBeenCalledWith({
				profile: { sex: 'male', birthDate: '1990-11-04', heightCm: 180, activityLevel: 'moderate' },
				kg: null
			})
		);
	});

	it('asks for today weight in onboarding mode and passes it with the profile', async () => {
		const onsubmit = vi.fn().mockResolvedValue(undefined);
		render(ProfileForm, {
			withWeight: true,
			today: '2026-11-08',
			submitLabel: 'Calculate my target',
			onsubmit
		});
		await field('Weight').fill('72,5');
		await page.getByRole('radio', { name: 'Female' }).click();
		await field('Birth date').fill('1990-11-04');
		await field('Height').fill('165');
		await page.getByRole('radio', { name: 'Light' }).click();
		await page.getByRole('button', { name: 'Calculate my target' }).click();
		await vi.waitFor(() =>
			expect(onsubmit).toHaveBeenCalledWith({
				profile: { sex: 'female', birthDate: '1990-11-04', heightCm: 165, activityLevel: 'light' },
				kg: 72.5
			})
		);
	});

	it('keeps the values and offers Retry when the save fails', async () => {
		const onsubmit = vi
			.fn()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue(undefined);
		renderSettings('2026-11-08', onsubmit);
		await page.getByRole('radio', { name: 'Male', exact: true }).click();
		await field('Birth date').fill('1990-11-04');
		await field('Height').fill('180');
		await page.getByRole('radio', { name: 'Moderate' }).click();
		await page.getByRole('button', { name: 'Save profile' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Could not save');
		await expect.element(field('Height')).toHaveValue('180');
		await page.getByRole('button', { name: 'Retry' }).click();
		await vi.waitFor(() => expect(onsubmit).toHaveBeenCalledTimes(2));
	});

	it('shows the reason the server rejected the profile with', async () => {
		const onsubmit = vi.fn(async () => error(400, 'Add a weigh-in first'));
		renderSettings('2026-11-08', onsubmit);
		await page.getByRole('radio', { name: 'Male', exact: true }).click();
		await field('Birth date').fill('1990-11-04');
		await field('Height').fill('180');
		await page.getByRole('radio', { name: 'Moderate' }).click();
		await page.getByRole('button', { name: 'Save profile' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Add a weigh-in first');
	});
});
