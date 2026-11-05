import { describe, expect, it } from 'vitest';
import { addPasskeyError, signInPasskeyError } from './auth-errors.ts';

describe('addPasskeyError', () => {
	it('asks to sign in again when the session is too old to add a passkey', () => {
		const result = addPasskeyError({
			code: 'SESSION_NOT_FRESH',
			message: 'Session is not fresh',
			status: 403
		});
		expect(result.signInAgain).toBe(true);
		expect(result.message).not.toContain('Session is not fresh');
		expect(result.message).toMatch(/sign in again/i);
	});

	it('says plainly that a cancelled ceremony saved nothing', () => {
		expect(
			addPasskeyError({
				code: 'ERROR_CEREMONY_ABORTED',
				message: 'Registration cancelled',
				status: 400
			})
		).toEqual({ message: 'No passkey was saved.', signInAgain: false });
	});

	it('names a passkey that is already on the account', () => {
		const result = addPasskeyError({
			code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED',
			message: 'Previously registered',
			status: 400
		});
		expect(result).toEqual({
			message: 'This device already has a passkey for kcal.',
			signInAgain: false
		});
	});

	it('falls back to a generic message for anything else', () => {
		expect(addPasskeyError({ status: 500 })).toEqual({
			message: 'The passkey was not saved. Try again.',
			signInAgain: false
		});
	});
});

describe('signInPasskeyError', () => {
	it('explains the rate limit', () => {
		expect(signInPasskeyError({ status: 429 })).toBe(
			'Too many attempts. Wait a minute, then try again.'
		);
	});

	it('offers the password otherwise', () => {
		expect(signInPasskeyError({ code: 'AUTH_CANCELLED', status: 400 })).toBe(
			'No passkey was used. Try again, or sign in with your email and password.'
		);
	});
});
