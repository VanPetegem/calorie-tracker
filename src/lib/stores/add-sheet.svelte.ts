/**
 * Whether the add sheet is open. The tab bar's add button, the sidebar's and the ⌘K shortcut set it; `AddSheet`
 * (mounted once in the app layout) reads it. Task 9 (quick add, new food) and Task 12 (scan) add their modes to
 * the sheet itself and open it through `show`.
 *
 * Module state is safe here: the sheet is only ever opened in the browser, never during server rendering.
 */
class AddSheetState {
	open = $state(false);

	show(): void {
		this.open = true;
	}
}

export const addSheet = new AddSheetState();
