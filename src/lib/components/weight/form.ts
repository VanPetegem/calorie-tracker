import type * as v from 'valibot';

/** The message of the first issue of a failed parse for `field`, or undefined. */
export function fieldIssue(
	issues: readonly v.BaseIssue<unknown>[] | undefined,
	field: string
): string | undefined {
	return issues?.find((issue) => issue.path?.[0]?.key === field)?.message;
}

/**
 * Commits a number field of `form` that is still being typed in. `NumberInput` commits on blur only, so Enter, or a
 * button tapped on iOS (which does not take focus, so the field never blurs), would otherwise use the old number.
 */
export function commitFocusedInput(form: HTMLFormElement | undefined): void {
	const active = document.activeElement;
	if (active instanceof HTMLInputElement && form?.contains(active)) active.blur();
}
