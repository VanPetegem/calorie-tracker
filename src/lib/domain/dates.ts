/** Dates are `YYYY-MM-DD` strings. Times are UTC ISO strings. */

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

type WallClock = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
};

function wallClock(instant: Date, timeZone: string): WallClock {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric'
	}).formatToParts(instant);
	const field = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((part) => part.type === type)?.value);
	return {
		year: field('year'),
		month: field('month'),
		day: field('day'),
		hour: field('hour'),
		minute: field('minute'),
		second: field('second')
	};
}

/** Offset of the zone from UTC at an instant, in milliseconds. */
function offsetMs(instant: number, timeZone: string): number {
	const w = wallClock(new Date(instant), timeZone);
	const asUtc =
		utcDate(w.year, w.month, w.day).getTime() + ((w.hour * 60 + w.minute) * 60 + w.second) * 1000;
	return asUtc - Math.floor(instant / 1000) * 1000;
}

/** A UTC midnight Date for a calendar date. Month is 1 to 12. Unlike Date.UTC, years below 100 stay as given. */
function utcDate(year: number, month: number, day: number): Date {
	const d = new Date(0);
	d.setUTCFullYear(year, month - 1, day);
	return d;
}

function parseDate(date: string): Date {
	const [year, month, day] = date.split('-').map(Number);
	return utcDate(year, month, day);
}

function formatDate(d: Date): string {
	const year = String(d.getUTCFullYear()).padStart(4, '0');
	const month = String(d.getUTCMonth() + 1).padStart(2, '0');
	const day = String(d.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** The calendar date of `now` in the zone, as `YYYY-MM-DD`. */
export function localDate(now: Date, timeZone: string): string {
	const w = wallClock(now, timeZone);
	return formatDate(utcDate(w.year, w.month, w.day));
}

/** Adds whole days to a `YYYY-MM-DD` date. */
export function addDays(date: string, n: number): string {
	const d = parseDate(date);
	d.setUTCDate(d.getUTCDate() + n);
	return formatDate(d);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to`, negative when `to` is earlier. Calendar dates only, no time zone. */
export function daysBetween(from: string, to: string): number {
	return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / DAY_MS);
}

/** True when `date` is a `YYYY-MM-DD` string naming a real calendar date. */
export function isCalendarDate(date: string): boolean {
	return DATE_FORMAT.test(date) && formatDate(parseDate(date)) === date;
}

/** True when `date` is a real calendar date no later than tomorrow relative to `today`. */
export function isAllowedLogDate(date: string, today: string): boolean {
	return isCalendarDate(date) && date <= addDays(today, 1);
}

/**
 * The moment to store for a log entry. Today uses `now`. Any other date keeps the current local time of day
 * on that date in the zone, so the offset in force on that date applies.
 */
export function loggedAtFor(date: string, today: string, now: Date, timeZone: string): string {
	if (date === today) return now.toISOString();
	const w = wallClock(now, timeZone);
	const wall =
		parseDate(date).getTime() +
		((w.hour * 60 + w.minute) * 60 + w.second) * 1000 +
		now.getUTCMilliseconds();
	// Two passes settle the offset when the target instant falls on the other side of a DST change.
	const firstGuess = wall - offsetMs(wall, timeZone);
	return new Date(wall - offsetMs(firstGuess, timeZone)).toISOString();
}
