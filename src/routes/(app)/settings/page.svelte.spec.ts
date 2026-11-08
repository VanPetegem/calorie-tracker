import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { weekRow } from '#lib/components/targets/week.fixture.ts';
import { toasts } from '#lib/stores/toasts.svelte.ts';
import Page from './+page.svelte';

const mocks = vi.hoisted(() => ({
	saveProfile: vi.fn(),
	saveGoal: vi.fn(),
	saveMacroRules: vi.fn(),
	saveContainer: vi.fn(),
	deleteContainer: vi.fn(),
	invalidateAll: vi.fn()
}));

vi.mock('./profile.remote.ts', () => ({ saveProfile: mocks.saveProfile }));
vi.mock('./targets.remote.ts', () => ({
	saveGoal: mocks.saveGoal,
	saveMacroRules: mocks.saveMacroRules
}));
vi.mock('../recipes/batches.remote.ts', () => ({
	saveContainer: mocks.saveContainer,
	deleteContainer: mocks.deleteContainer
}));
vi.mock('$app/navigation', () => ({ invalidateAll: mocks.invalidateAll }));

const THIS_WEEK = '2026-11-02';

beforeEach(() => {
	mocks.saveProfile.mockReset().mockResolvedValue(undefined);
	mocks.saveGoal.mockReset().mockResolvedValue(weekRow(THIS_WEEK));
	mocks.saveMacroRules.mockReset().mockResolvedValue(weekRow(THIS_WEEK));
	mocks.invalidateAll.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
	for (const toast of [...toasts.items]) toasts.dismiss(toast.id);
});

const toastTexts = () => toasts.items.map((toast) => toast.message);

function show() {
	return render(Page, {
		data: {
			containers: [],
			today: '2026-11-08',
			profile: {
				sex: 'male',
				birthDate: '1990-11-04',
				heightCm: 180,
				activityLevel: 'moderate'
			},
			goalRatePct: 0.35,
			macroRules: { proteinGPerKg: 1.8, fatPct: 0.25, energyDensity: 5000 },
			trendKg: 70.4,
			targets: [weekRow(THIS_WEEK, { targetKcal: 2450 })],
			currentWeekStart: THIS_WEEK
		},
		params: {},
		form: null
	} as never);
}

describe('settings page', () => {
	it('prefills the profile, saves an edited height, toasts it and refreshes', async () => {
		show();
		const height = page.getByLabelText('Height', { exact: true });
		await expect.element(height).toHaveValue('180');
		await expect.element(page.getByLabelText('Birth date')).toHaveValue('1990-11-04');
		await expect.element(page.getByRole('radio', { name: 'Male', exact: true })).toBeChecked();
		await expect.element(page.getByRole('radio', { name: 'Moderate' })).toBeChecked();
		await height.fill('185');
		await page.getByRole('button', { name: 'Save profile' }).click();
		await vi.waitFor(() => expect(toastTexts()).toEqual(['Profile saved']));
		expect(mocks.saveProfile).toHaveBeenCalledWith({
			sex: 'male',
			birthDate: '1990-11-04',
			heightCm: 185,
			activityLevel: 'moderate'
		});
		expect(mocks.invalidateAll).toHaveBeenCalledOnce();
	});

	it('saves the chosen goal rate, toasts it and refreshes', async () => {
		show();
		await page.getByRole('radio', { name: /^0\.5 %/ }).click();
		await page.getByRole('button', { name: 'Save goal' }).click();
		await vi.waitFor(() => expect(toastTexts()).toEqual(['Goal saved']));
		expect(mocks.saveGoal).toHaveBeenCalledWith({ goalRatePct: 0.5 });
		expect(mocks.invalidateAll).toHaveBeenCalledOnce();
	});

	it('saves the macro rules with the protein changed', async () => {
		show();
		await page.getByLabelText('Protein per kg').fill('2');
		await page.getByRole('button', { name: 'Save rules' }).click();
		await vi.waitFor(() => expect(toastTexts()).toEqual(['Macro rules saved']));
		expect(mocks.saveMacroRules).toHaveBeenCalledWith({
			proteinGPerKg: 2,
			fatPct: 0.25,
			energyDensity: 5000
		});
		expect(mocks.invalidateAll).toHaveBeenCalledOnce();
	});

	it("lists this week's target in the targets history", async () => {
		show();
		const history = page.getByRole('list', { name: 'Weekly targets' });
		await expect.element(history).toHaveTextContent('This week');
		await expect.element(history).toHaveTextContent('2,450 kcal');
	});
});
