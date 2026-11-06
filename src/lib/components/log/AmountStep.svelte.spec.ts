import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { Food } from '#lib/server/db/schema.ts';
import { sampleBatch } from '../recipes/batch.fixture.ts';
import AmountStep from './AmountStep.svelte';
import { batchSource, entryBatchSource, NO_ENTRY_WEIGHT_HINT } from './amount.ts';

type TestFood = Pick<
	Food,
	'name' | 'brand' | 'nutritionBasis' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'servingG'
>;

const oats: TestFood = {
	name: 'Oats',
	brand: null,
	nutritionBasis: 'g',
	kcal: 250,
	protein: 10,
	carbs: 40,
	fat: 5,
	fiber: 8,
	servingG: 40
};

const plain: TestFood = { ...oats, servingG: null };
const juice: TestFood = { ...plain, name: 'Juice', nutritionBasis: 'ml' };

function props(food = oats, extra: Record<string, unknown> = {}) {
	return { food, mode: 'add' as const, onsubmit: vi.fn(), ...extra };
}

const amountField = () => page.getByLabelText('Amount');

describe('AmountStep', () => {
	it('starts at one serving for a food with a serving weight', async () => {
		render(AmountStep, props());
		await expect.element(amountField()).toHaveValue('1');
		await expect.element(page.getByRole('radio', { name: 'serving' })).toBeChecked();
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('100 kcal');
	});

	it('previews 1,5 servings of a 40 g serving as 60 g worth of kcal', async () => {
		render(AmountStep, props());
		await amountField().fill('1,5');
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('150 kcal');
		await expect.element(page.getByText('60 g')).toBeVisible();
	});

	it('shows the given per 100 values in the header and the preview, not the food values', async () => {
		render(
			AmountStep,
			props(plain, { per100: { kcal: 200, protein: 8, carbs: 30, fat: 4, fiber: null } })
		);
		await expect.element(page.getByText('200 kcal per 100 g')).toBeVisible();
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('200 kcal');
	});

	it('starts at 100 g without a serving weight and offers no serving unit', async () => {
		render(AmountStep, props(plain));
		await expect.element(amountField()).toHaveValue('100');
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('250 kcal');
		expect(page.getByRole('radio', { name: 'serving' }).elements()).toHaveLength(0);
	});

	it('labels the base unit ml for a liquid', async () => {
		render(AmountStep, props(juice));
		await expect.element(page.getByRole('radio', { name: 'ml' })).toBeChecked();
	});

	it('keeps the grams when the unit is switched', async () => {
		render(AmountStep, props(oats, { initial: { amount: 80, unit: 'g' } }));
		await page.getByRole('radio', { name: 'serving' }).click();
		await expect.element(amountField()).toHaveValue('2');
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('200 kcal');
	});

	it('submits the typed amount and unit', async () => {
		const p = props();
		render(AmountStep, p);
		await amountField().fill('2,5');
		await page.getByRole('button', { name: 'Log' }).click();
		expect(p.onsubmit).toHaveBeenCalledWith({ amount: 2.5, unit: 'serving' });
	});

	it('submits on Enter', async () => {
		const p = props(plain);
		render(AmountStep, p);
		await amountField().fill('200');
		await userEvent.keyboard('{Enter}');
		expect(p.onsubmit).toHaveBeenCalledWith({ amount: 200, unit: 'g' });
	});

	it('blocks an empty or invalid amount', async () => {
		const p = props(plain);
		render(AmountStep, p);
		await amountField().fill('abc');
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('0 kcal');
		await page.getByRole('button', { name: 'Log' }).click({ force: true });
		expect(p.onsubmit).not.toHaveBeenCalled();
	});

	it('flags an amount above the limit of the unit', async () => {
		render(AmountStep, props());
		await amountField().fill('51');
		await amountField().element().blur();
		await expect.element(page.getByText('Too much for this unit')).toBeVisible();
	});

	it('says Save in edit mode', async () => {
		render(AmountStep, props(oats, { mode: 'edit' }));
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeVisible();
	});

	it('shows an error when submitting fails and lets the person try again', async () => {
		const onsubmit = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(undefined);
		render(AmountStep, props(oats, { onsubmit }));
		await page.getByRole('button', { name: 'Log' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Could not save');
		await page.getByRole('button', { name: 'Log' }).click();
		expect(onsubmit).toHaveBeenCalledTimes(2);
	});

	it('offers Edit food only when asked to', async () => {
		const onedit = vi.fn();
		const view = render(AmountStep, props(oats, { onedit }));
		await page.getByRole('button', { name: 'Edit food' }).click();
		expect(onedit).toHaveBeenCalledOnce();
		view.unmount();
		render(AmountStep, props());
		expect(page.getByRole('button', { name: 'Edit food' }).elements()).toHaveLength(0);
	});

	it('labels the submit button with submitLabel instead of Log', async () => {
		render(AmountStep, props(oats, { submitLabel: 'Add' }));
		await expect.element(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
		expect(page.getByRole('button', { name: 'Log' }).elements()).toHaveLength(0);
	});
});

describe('AmountStep for a batch', () => {
	const stew = () => batchSource(sampleBatch());
	const unweighed = () => batchSource(sampleBatch({ cookedWeightG: null }));

	function batchProps(batch = stew(), extra: Record<string, unknown> = {}) {
		return { batch, mode: 'add' as const, onsubmit: vi.fn(), ...extra };
	}

	it('starts at one portion and previews its kcal', async () => {
		render(AmountStep, batchProps());
		await expect.element(amountField()).toHaveValue('1');
		await expect.element(page.getByRole('radio', { name: 'portion' })).toBeChecked();
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('500 kcal');
		await expect.element(page.getByText('500 kcal per portion')).toBeVisible();
	});

	it('previews 1,5 portions as 750 kcal and 600 g', async () => {
		render(AmountStep, batchProps());
		await amountField().fill('1,5');
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('750 kcal');
		await expect.element(page.getByText('600 g')).toBeVisible();
	});

	it('keeps the quantity when switching to grams, and previews grams', async () => {
		render(AmountStep, batchProps());
		await amountField().fill('1,5');
		await page.getByRole('radio', { name: 'g', exact: true }).click();
		await expect.element(amountField()).toHaveValue('600');
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('750 kcal');
		await amountField().fill('200');
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('250 kcal');
	});

	it('disables grams without a cooked weight and says why', async () => {
		const p = batchProps(unweighed());
		render(AmountStep, p);
		const grams = page.getByRole('radio', { name: 'g', exact: true });
		await expect.element(grams).toHaveAttribute('aria-disabled', 'true');
		await expect.element(page.getByText('Add the cooked weight to log grams')).toBeVisible();
		await grams.click({ force: true });
		await expect.element(page.getByRole('radio', { name: 'portion' })).toBeChecked();
		await page.getByRole('button', { name: 'Log' }).click();
		expect(p.onsubmit).toHaveBeenCalledWith({ amount: 1, unit: 'portion' });
	});

	it('does not offer the grams hint when the batch is weighed', async () => {
		render(AmountStep, batchProps());
		expect(page.getByText('Add the cooked weight to log grams').elements()).toHaveLength(0);
	});

	it('submits portions and grams', async () => {
		const p = batchProps();
		render(AmountStep, p);
		await amountField().fill('1,5');
		await userEvent.keyboard('{Enter}');
		expect(p.onsubmit).toHaveBeenLastCalledWith({ amount: 1.5, unit: 'portion' });
		await page.getByRole('radio', { name: 'g', exact: true }).click();
		await amountField().fill('200');
		await page.getByRole('button', { name: 'Log' }).click();
		expect(p.onsubmit).toHaveBeenLastCalledWith({ amount: 200, unit: 'g' });
	});

	it.each(['', '   ', '0', '-1', 'abc'])(
		'previews 0 and blocks the button for the input "%s", without throwing',
		async (text) => {
			const p = batchProps();
			render(AmountStep, p);
			await amountField().fill(text);
			await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('0 kcal');
			await userEvent.keyboard('{Enter}');
			await page.getByRole('button', { name: 'Log' }).click({ force: true });
			expect(p.onsubmit).not.toHaveBeenCalled();
			await expect.element(page.getByRole('radio', { name: 'portion' })).toBeChecked();
		}
	);

	it('flags more than 100 portions', async () => {
		render(AmountStep, batchProps());
		await amountField().fill('101');
		await amountField().element().blur();
		await expect.element(page.getByText('Too much for this unit')).toBeVisible();
	});

	describe('editing an entry', () => {
		const portionEntry = {
			kcal: 750,
			protein: 45,
			carbs: 75,
			fat: 30,
			fiber: null,
			amount: 1.5,
			unit: 'portion',
			grams: 600,
			label: 'Beef stew'
		};

		it('starts from the entry amount and rescales its own snapshot, not the batch', async () => {
			// The batch has changed since: this entry still prices at 500 kcal per portion.
			const p = batchProps(entryBatchSource(portionEntry, 100)!, {
				mode: 'edit',
				initial: { amount: 1.5, unit: 'portion' }
			});
			render(AmountStep, p);
			await expect.element(amountField()).toHaveValue('1.5');
			await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('750 kcal');
			await amountField().fill('2');
			await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('1000 kcal');
			await page.getByRole('button', { name: 'Save' }).click();
			expect(p.onsubmit).toHaveBeenCalledWith({ amount: 2, unit: 'portion' });
		});

		it('switches a gram entry to portions with the batch current portion weight', async () => {
			const entry = {
				...portionEntry,
				kcal: 250,
				protein: 15,
				carbs: 25,
				fat: 10,
				amount: 200,
				unit: 'g',
				grams: 200
			};
			render(
				AmountStep,
				batchProps(entryBatchSource(entry, 400)!, {
					mode: 'edit',
					initial: { amount: 200, unit: 'g' }
				})
			);
			await page.getByRole('radio', { name: 'portion' }).click();
			await expect.element(amountField()).toHaveValue('0.5');
			await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('250 kcal');
			await amountField().fill('1');
			await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('500 kcal');
		});

		it('edits an entry without grams in portions only', async () => {
			const entry = { ...portionEntry, amount: 2, grams: null };
			render(
				AmountStep,
				batchProps(entryBatchSource(entry, 400)!, {
					mode: 'edit',
					initial: { amount: 2, unit: 'portion' }
				})
			);
			await expect
				.element(page.getByRole('radio', { name: 'g', exact: true }))
				.toHaveAttribute('aria-disabled', 'true');
			await expect.element(page.getByText(NO_ENTRY_WEIGHT_HINT)).toBeVisible();
			await amountField().fill('1');
			await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('375 kcal');
		});
	});
});
