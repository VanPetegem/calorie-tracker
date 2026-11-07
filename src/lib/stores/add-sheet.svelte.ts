import type { BatchSummary } from '#lib/server/batches/repo.ts';

/**
 * Whether the add sheet is open. The tab bar's add button, the sidebar's and the ⌘K shortcut set it; `AddSheet`
 * (mounted once in the app layout) reads it. Task 9 (quick add, new food) and Task 12 (scan) add their modes to
 * the sheet itself and open it through `show`.
 *
 * Module state is safe here: the sheet is only ever opened in the browser, never during server rendering.
 */
class AddSheetState {
	open = $state(false);
	/** A batch to open the sheet at (its amount step). `AddSheet` takes it when it opens and clears it. */
	batch = $state.raw<BatchSummary | null>(null);

	/** Opens the sheet at its search step. A sheet that is already open stays where it is, so ⌘K never drops a typed amount. */
	show(): void {
		if (!this.open) this.batch = null;
		this.open = true;
	}

	/** Opens the sheet at the amount step of `batch`, as the batch page's Log button does. */
	openBatch(batch: BatchSummary): void {
		this.batch = batch;
		this.open = true;
	}
}

export const addSheet = new AddSheetState();
