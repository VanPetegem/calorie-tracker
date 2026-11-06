import { describe, expect, it } from 'vitest';
import { addDays, isAllowedLogDate, loggedAtFor, localDate } from './dates';

const ZURICH = 'Europe/Zurich';

describe('localDate', () => {
	it('gives the calendar date in the zone', () => {
		expect(localDate(new Date('2026-11-04T23:30:00Z'), ZURICH)).toBe('2026-11-05');
		expect(localDate(new Date('2026-07-01T22:30:00Z'), ZURICH)).toBe('2026-07-02');
	});

	it('gives the UTC date for UTC', () => {
		expect(localDate(new Date('2026-11-04T23:30:00Z'), 'UTC')).toBe('2026-11-04');
	});
});

describe('addDays', () => {
	it.each([
		['2026-11-05', 1, '2026-11-06'],
		['2026-11-05', -1, '2026-11-04'],
		['2026-11-05', 0, '2026-11-05'],
		['2026-11-30', 1, '2026-12-01'],
		['2026-12-31', 1, '2027-01-01'],
		['2028-02-28', 1, '2028-02-29']
	])('adds %i days to %s as %s', (date, n, expected) => {
		expect(addDays(date, n)).toBe(expected);
	});
});

describe('isAllowedLogDate', () => {
	it('allows today and tomorrow, not the day after', () => {
		expect(isAllowedLogDate('2026-11-05', '2026-11-05')).toBe(true);
		expect(isAllowedLogDate('2026-11-06', '2026-11-05')).toBe(true);
		expect(isAllowedLogDate('2026-11-07', '2026-11-05')).toBe(false);
	});

	it('allows past dates', () => {
		expect(isAllowedLogDate('2026-10-01', '2026-11-05')).toBe(true);
	});

	it.each(['2026-02-30', '2026-13-01', '2026-11-5', '05.11.2026', ''])(
		'rejects %j as not a calendar date',
		(date) => {
			expect(isAllowedLogDate(date, '2026-11-05')).toBe(false);
		}
	);
});

describe('loggedAtFor', () => {
	const now = new Date('2026-11-05T11:15:00Z');

	it('uses now for today', () => {
		expect(loggedAtFor('2026-11-05', '2026-11-05', now, ZURICH)).toBe('2026-11-05T11:15:00.000Z');
	});

	it('keeps years below 100 as given', () => {
		expect(loggedAtFor('0050-03-01', '2026-11-05', now, 'UTC')).toBe('0050-03-01T11:15:00.000Z');
	});

	it('keeps the local time of day for an earlier date', () => {
		expect(loggedAtFor('2026-11-03', '2026-11-05', now, ZURICH)).toBe('2026-11-03T11:15:00.000Z');
	});

	it('uses the UTC offset in force on that date', () => {
		expect(loggedAtFor('2026-07-01', '2026-11-05', now, ZURICH)).toBe('2026-07-01T10:15:00.000Z');
	});
});
