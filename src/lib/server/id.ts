import { uuidv7 } from 'uuidv7';

/** A new row id: a UUIDv7, so ids sort by creation time. */
export function newId(): string {
	return uuidv7();
}
