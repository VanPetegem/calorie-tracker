import type { HandleServerError } from '@sveltejs/kit/hooks';

/**
 * SvelteKit's default `handleError` behaviour, except that a failed remote function schema check logs only the
 * issue paths and messages. The default logs the issues whole, and valibot issues carry the `input`, which for
 * `readLabel` is the photo.
 */
export const handleError: HandleServerError = ({ kind, error, issues }) => {
	if (kind === 'validation') {
		console.error(
			'Remote function schema validation failed:',
			issues.map((issue) => ({
				path: issue.path?.map((segment) =>
					String(typeof segment === 'object' ? segment.key : segment)
				),
				message: issue.message
			}))
		);
		return;
	}

	if (kind !== 'unknown') return;

	let e = error;
	while (e instanceof Error) {
		if (e.stack) console.error(e.stack);
		e = e.cause;
	}
	if (e) console.error(String(e));
};
