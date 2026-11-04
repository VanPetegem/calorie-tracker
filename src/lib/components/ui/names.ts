/**
 * Every component exported from index.ts. The /design route renders one section per name, with a heading whose
 * `id` equals the name, and design.e2e asserts it. Add a name here whenever a component is exported.
 * Kept in its own file so Node-side tests (Playwright) can import it without loading .svelte files.
 */
export const componentNames = [
	'Button',
	'IconButton',
	'Input',
	'NumberInput',
	'SegmentedControl',
	'Card',
	'Badge',
	'ProgressBar',
	'MacroBar',
	'Skeleton',
	'EmptyState',
	'ListItem'
] as const;
