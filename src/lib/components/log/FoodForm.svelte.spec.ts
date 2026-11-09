import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { Food } from '#lib/server/db/schema.ts';
import FoodForm from './FoodForm.svelte';

const mocks = vi.hoisted(() => ({
	invalidateAll: vi.fn(),
	createFood: vi.fn(),
	updateFood: vi.fn(),
	readLabel: vi.fn(),
	resizeToJpegDataUri: vi.fn()
}));

vi.mock('$app/navigation', () => ({ invalidateAll: mocks.invalidateAll }));
vi.mock('../../../routes/(app)/foods.remote.ts', () => ({
	createFood: mocks.createFood,
	updateFood: mocks.updateFood,
	readLabel: mocks.readLabel
}));
vi.mock('#lib/client/resize-image.ts', () => ({ resizeToJpegDataUri: mocks.resizeToJpegDataUri }));

const saved = { id: 'food-1', name: 'Oats', kcal: 370 } as Food;

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.invalidateAll.mockResolvedValue(undefined);
	mocks.createFood.mockResolvedValue({ ok: true, food: saved });
	mocks.updateFood.mockResolvedValue({ ok: true, food: saved });
	mocks.resizeToJpegDataUri.mockResolvedValue('data:image/jpeg;base64,AAAA');
});

const field = (label: string) => page.getByLabelText(label, { exact: true });

async function fillRequired(extra: Record<string, string> = {}) {
	const values = {
		Name: 'Oats',
		Calories: '370',
		Protein: '12,5',
		Carbs: '59',
		Fat: '7',
		...extra
	};
	for (const [label, value] of Object.entries(values)) await field(label).fill(value);
}

describe('FoodForm validation', () => {
	it('rejects 901 kcal on blur and accepts 900', async () => {
		render(FoodForm, { onsaved: vi.fn() });
		await field('Calories').fill('901');
		await expect.element(page.getByText('Enter at most 900')).not.toBeInTheDocument();
		await field('Calories').element().blur();
		await expect.element(page.getByText('Enter at most 900')).toBeVisible();
		await field('Calories').fill('900');
		await field('Calories').element().blur();
		await expect.element(page.getByText('Enter at most 900')).not.toBeInTheDocument();
	});

	it('accepts a comma decimal on blur', async () => {
		render(FoodForm, { onsaved: vi.fn() });
		await field('Protein').fill('12,5');
		await field('Protein').element().blur();
		expect(page.getByRole('alert').elements()).toHaveLength(0);
	});

	it('says "Enter a number" for text in an optional field such as fiber', async () => {
		render(FoodForm, { onsaved: vi.fn() });
		await field('Fiber (optional)').fill('abc');
		await field('Fiber (optional)').element().blur();
		await expect.element(page.getByText('Enter a number')).toBeVisible();
	});

	it('does not save while a field is invalid and shows every error', async () => {
		render(FoodForm, { onsaved: vi.fn() });
		await page.getByRole('button', { name: 'Save food' }).click();
		await expect.element(page.getByText('Enter a value')).toBeVisible();
		expect(mocks.createFood).not.toHaveBeenCalled();
	});
});

describe('FoodForm saving', () => {
	it('creates a food and hands it to onsaved', async () => {
		const onsaved = vi.fn();
		render(FoodForm, { onsaved });
		await fillRequired();
		await page.getByRole('button', { name: 'Save food' }).click();
		await vi.waitFor(() => expect(onsaved).toHaveBeenCalledWith(saved));
		expect(mocks.createFood).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'Oats', kcal: 370, protein: 12.5, nutritionBasis: 'g' })
		);
		expect(mocks.invalidateAll).toHaveBeenCalled();
	});

	it('prefills from initial, such as a barcode from the miss flow', async () => {
		render(FoodForm, { onsaved: vi.fn(), initial: { barcode: '7612345678900', name: 'Muesli' } });
		await expect.element(field('Barcode (optional)')).toHaveValue('7612345678900');
		await expect.element(field('Name')).toHaveValue('Muesli');
	});

	it('updates an existing food and says past days keep their values', async () => {
		const onsaved = vi.fn();
		render(FoodForm, {
			onsaved,
			foodId: 'food-1',
			initial: { name: 'Oats', kcal: 370, protein: 12.5, carbs: 59, fat: 7, nutritionBasis: 'g' }
		});
		await expect.element(page.getByText(/Days you already logged keep their values/)).toBeVisible();
		await field('Calories').fill('380');
		await page.getByRole('button', { name: 'Save food' }).click();
		await vi.waitFor(() => expect(onsaved).toHaveBeenCalled());
		expect(mocks.updateFood).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'food-1', kcal: 380 })
		);
	});

	it('names the food that already has the barcode and does not call onsaved', async () => {
		mocks.createFood.mockResolvedValue({
			ok: false,
			reason: 'barcode_taken',
			food: { ...saved, name: 'Nutella' }
		});
		const onsaved = vi.fn();
		render(FoodForm, { onsaved });
		await fillRequired({ 'Barcode (optional)': '3017620422003' });
		await page.getByRole('button', { name: 'Save food' }).click();
		await expect.element(page.getByText(/already in your library as Nutella/)).toBeVisible();
		expect(onsaved).not.toHaveBeenCalled();
		await field('Barcode (optional)').fill('3017620422004');
		await expect.element(page.getByText(/already in your library/)).not.toBeInTheDocument();
	});

	it('shows an inline error when saving fails and keeps the values', async () => {
		mocks.createFood.mockRejectedValue(new Error('offline'));
		render(FoodForm, { onsaved: vi.fn() });
		await fillRequired();
		await page.getByRole('button', { name: 'Save food' }).click();
		await expect.element(page.getByText('Could not save. Try again.')).toBeVisible();
		await expect.element(field('Name')).toHaveValue('Oats');
	});

	it('does not call a failed refresh after a successful save a failure', async () => {
		mocks.invalidateAll.mockRejectedValue(new Error('offline'));
		const onsaved = vi.fn();
		render(FoodForm, { onsaved });
		await fillRequired();
		await page.getByRole('button', { name: 'Save food' }).click();
		await vi.waitFor(() => expect(onsaved).toHaveBeenCalled());
		expect(page.getByText('Could not save. Try again.').elements()).toHaveLength(0);
	});
});

describe('FoodForm label photo', () => {
	const labelValues = {
		nutritionBasis: 'g',
		kcal: 250,
		protein: 10,
		carbs: null,
		fat: 7,
		fiber: null,
		servingG: null
	} as const;

	async function pickPhoto() {
		const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
		const transfer = new DataTransfer();
		transfer.items.add(new File(['x'], 'label.jpg', { type: 'image/jpeg' }));
		input.files = transfer.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}

	it('fills the values read, marks each changed field and clears a marker when the field is edited', async () => {
		mocks.readLabel.mockResolvedValue({ ok: true, values: labelValues });
		render(FoodForm, { onsaved: vi.fn(), initial: { kcal: 120, carbs: 30 } });
		await pickPhoto();
		await expect.element(field('Calories')).toHaveValue('250');
		await expect.element(field('Protein')).toHaveValue('10');
		await expect.element(field('Carbs')).toHaveValue('30');
		expect(mocks.readLabel).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA');
		await expect.element(page.getByText('From photo, was 120')).toBeVisible();
		await expect.element(page.getByText('From photo', { exact: true }).first()).toBeVisible();
		await field('Calories').fill('260');
		await expect.element(page.getByText('From photo, was 120')).not.toBeInTheDocument();
		await expect.element(page.getByText('From photo', { exact: true }).first()).toBeVisible();
	});

	it('undoes a value from an earlier photo when the next photo does not print it', async () => {
		mocks.readLabel.mockResolvedValueOnce({ ok: true, values: labelValues });
		mocks.readLabel.mockResolvedValueOnce({ ok: true, values: { ...labelValues, fat: null } });
		render(FoodForm, { onsaved: vi.fn(), initial: { kcal: 120 } });
		await pickPhoto();
		await expect.element(field('Fat')).toHaveValue('7');
		await pickPhoto();
		await expect.poll(() => mocks.readLabel.mock.calls.length).toBe(2);
		await expect.element(field('Fat')).toHaveValue('');
		await expect.element(field('Calories')).toHaveValue('250');
	});

	it.each([
		['unreadable', "Couldn't read the label. It needs a per 100 g column."],
		['rate_limited', 'Too many photos, try again in a minute.'],
		['unavailable', "Couldn't reach the label reader. Try again."]
	] as const)('shows the message for %s and keeps the values', async (reason, message) => {
		mocks.readLabel.mockResolvedValue({ ok: false, reason });
		render(FoodForm, { onsaved: vi.fn(), initial: { kcal: 120 } });
		await pickPhoto();
		await expect.element(page.getByText(message)).toBeVisible();
		await expect.element(field('Calories')).toHaveValue('120');
	});

	it('switches the basis to ml when the label is per 100 ml', async () => {
		mocks.readLabel.mockResolvedValue({
			ok: true,
			values: { ...labelValues, nutritionBasis: 'ml' }
		});
		render(FoodForm, { onsaved: vi.fn() });
		await expect.element(page.getByRole('radio', { name: 'g', exact: true })).toBeChecked();
		await pickPhoto();
		await expect.element(page.getByRole('radio', { name: 'ml', exact: true })).toBeChecked();
	});

	it('says the reader is unavailable when the call is rejected', async () => {
		mocks.readLabel.mockRejectedValue(new Error('offline'));
		render(FoodForm, { onsaved: vi.fn() });
		await pickPhoto();
		await expect
			.element(page.getByText("Couldn't reach the label reader. Try again."))
			.toBeVisible();
	});

	it('says the photo could not be opened when the resize fails, without calling the reader', async () => {
		mocks.resizeToJpegDataUri.mockRejectedValue(new Error('decode failed'));
		render(FoodForm, { onsaved: vi.fn() });
		await pickPhoto();
		await expect.element(page.getByText("Couldn't open that photo.")).toBeVisible();
		expect(mocks.readLabel).not.toHaveBeenCalled();
	});

	it('shows no photo button when editing a food', async () => {
		render(FoodForm, { onsaved: vi.fn(), foodId: 'food-1' });
		await expect.element(field('Name')).toBeVisible();
		expect(page.getByRole('button', { name: 'Photograph label' }).elements()).toHaveLength(0);
	});

	it('disables the photo button while offline and says why', async () => {
		const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
		try {
			render(FoodForm, { onsaved: vi.fn() });
			await expect
				.element(page.getByRole('button', { name: 'Photograph label' }))
				.toHaveAttribute('aria-disabled', 'true');
			await expect.element(page.getByText('Needs a connection')).toBeVisible();
		} finally {
			onLine.mockRestore();
		}
	});
});
