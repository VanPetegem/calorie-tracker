import { command } from '$app/server';
import { BatchIdInput, BatchInput, ContainerIdInput, ContainerInput } from '#lib/schemas/batch.ts';
import {
	deleteContainer as removeContainer,
	finishBatch as finish,
	reopenBatch as reopen
} from '#lib/server/batches/repo.ts';
import {
	deleteBatchResult,
	saveBatchResult,
	saveContainerResult,
	type DeleteBatchResult,
	type SaveBatchResult
} from '#lib/server/batches/result.ts';
import { appContext } from '#lib/server/context.ts';

/*
 * Batch and container writes. Each command validates its input with the shared schema; the server snapshots every
 * new line from its food and computes the totals, so no nutrition crosses the wire. The pages read through `load`,
 * so callers `await invalidateAll()` after a command resolves.
 */

/**
 * Creates (no id) or replaces a whole batch. A food that is gone, a unit that does not fit or a line that is not the
 * batch's comes back as `{ ok: false, ... index }` so the form can mark the line; an unknown batch or recipe is a 404.
 */
export const saveBatch = command(BatchInput, async (input): Promise<SaveBatchResult> => {
	const { db } = await appContext();
	return saveBatchResult(db, input);
});

/** Marks a batch finished; it leaves the add sheet. */
export const finishBatch = command(BatchIdInput, async ({ id }) => {
	const { db } = await appContext();
	await finish(db, id);
});

/** Makes a finished batch active again. */
export const reopenBatch = command(BatchIdInput, async ({ id }) => {
	const { db } = await appContext();
	await reopen(db, id);
});

/** Deletes a batch nobody logged; a logged one comes back as `{ ok: false, reason: 'batch_logged' }`. */
export const deleteBatch = command(BatchIdInput, async ({ id }): Promise<DeleteBatchResult> => {
	const { db } = await appContext();
	return deleteBatchResult(db, id);
});

/** Creates (no id) or changes a container and returns it; an unknown id is a 404. */
export const saveContainer = command(ContainerInput, async (input) => {
	const { db } = await appContext();
	return saveContainerResult(db, input);
});

/** Deletes a container. Batches keep their net weight. */
export const deleteContainer = command(ContainerIdInput, async ({ id }) => {
	const { db } = await appContext();
	await removeContainer(db, id);
});
