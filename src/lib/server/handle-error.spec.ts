import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleError } from './handle-error.ts';

const event = {} as RequestEvent;

afterEach(() => vi.restoreAllMocks());

describe('handleError', () => {
	it('logs only the paths and messages of validation issues, never the input', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const photo = 'data:image/jpeg;base64,SECRETPHOTO';
		handleError({
			kind: 'validation',
			error: { status: 400, message: 'Bad Request' },
			issues: [{ message: 'Too long', path: [{ key: 'photo' }], input: photo } as never],
			event
		});
		expect(log.mock.calls).toEqual([
			['Remote function schema validation failed:', [{ path: ['photo'], message: 'Too long' }]]
		]);
		expect(JSON.stringify(log.mock.calls)).not.toContain('SECRETPHOTO');
	});

	it('logs the stack of an unknown error and its causes like SvelteKit does', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const cause = new Error('inner');
		handleError({ kind: 'unknown', error: new Error('outer', { cause }), event });
		expect(log.mock.calls.map(([line]) => String(line).split('\n')[0])).toEqual([
			'Error: outer',
			'Error: inner'
		]);
	});

	it('logs nothing for app and framework errors', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		handleError({ kind: 'framework', error: { status: 404, message: 'Not Found' }, event });
		expect(log).not.toHaveBeenCalled();
	});
});
