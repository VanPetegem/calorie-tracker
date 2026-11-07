import { error } from '@sveltejs/kit';
import type { BatchInput, ContainerInput } from '../../schemas/batch.ts';
import type { Db } from '../db/index.ts';
import type { Container } from '../db/schema.ts';
import { RecipeNotFoundError, UnitNotAvailableError, UnknownFoodError } from '../recipes/repo.ts';
import {
	BatchLoggedError,
	BatchNotFoundError,
	ContainerNotFoundError,
	UnknownIngredientError,
	deleteBatch,
	saveBatch,
	saveContainer
} from './repo.ts';

/**
 * What the `saveBatch` command answers. A line the server cannot accept comes back with the index of that line, so
 * the form can mark it (the same shape as `saveRecipe`'s result); nothing was written.
 */
export type SaveBatchResult =
	| { ok: true; id: string }
	| {
			ok: false;
			reason: 'unknown_food' | 'unit_not_available' | 'unknown_ingredient';
			message: string;
			index: number;
	  };

const LINE_REASONS = {
	UnknownFoodError: 'unknown_food',
	UnitNotAvailableError: 'unit_not_available',
	UnknownIngredientError: 'unknown_ingredient'
} as const;

/** What the `deleteBatch` command answers. A logged batch is refused with a message; nothing was written. */
export type DeleteBatchResult =
	{ ok: true } | { ok: false; reason: 'batch_logged'; message: string };

/**
 * Saves a batch and maps the repository's typed errors for the remote layer. A food that is gone, a unit that does
 * not fit or a line that is not the batch's becomes a result with the line's index. A batch or recipe id that does
 * not exist is a 404 with its message. Anything else is not expected and propagates.
 */
export async function saveBatchResult(db: Db, input: BatchInput): Promise<SaveBatchResult> {
	try {
		const batch = await saveBatch(db, input);
		return { ok: true, id: batch.id };
	} catch (cause) {
		if (
			cause instanceof UnknownFoodError ||
			cause instanceof UnitNotAvailableError ||
			cause instanceof UnknownIngredientError
		) {
			const { message, index } = cause;
			return { ok: false, reason: LINE_REASONS[cause.name], message, index };
		}
		if (cause instanceof BatchNotFoundError || cause instanceof RecipeNotFoundError) {
			error(404, cause.message);
		}
		throw cause;
	}
}

/** Deletes a batch, or answers why it cannot be deleted. */
export async function deleteBatchResult(db: Db, id: string): Promise<DeleteBatchResult> {
	try {
		await deleteBatch(db, id);
		return { ok: true };
	} catch (cause) {
		if (cause instanceof BatchLoggedError) {
			return { ok: false, reason: 'batch_logged', message: cause.message };
		}
		throw cause;
	}
}

/** Saves a container; an id that does not exist is a 404 with its message. */
export async function saveContainerResult(db: Db, input: ContainerInput): Promise<Container> {
	try {
		return await saveContainer(db, input);
	} catch (cause) {
		if (cause instanceof ContainerNotFoundError) error(404, cause.message);
		throw cause;
	}
}
