import { describe, expect, it } from 'vitest';
import {
	ALL_CONTEXT,
	parseContext,
	readCookie,
	sameContext,
	serialiseContext,
	spacesInContext,
	validContext
} from './context';

const SPACE = '0b6f1f4e-2c1a-4c47-9a39-3d9f3c0e8a11';
const OTHER = '5f0e8b7a-1d2c-4b3a-8f9e-0a1b2c3d4e5f';

describe('parseContext', () => {
	it('reads a space id, and Everyone', () => {
		expect(parseContext(SPACE)).toEqual({ kind: 'space', spaceId: SPACE });
		expect(parseContext('all')).toEqual(ALL_CONTEXT);
	});

	it('is Everyone for anything else: an ambient context falls back, it never fails', () => {
		for (const value of [undefined, null, '', 'self', 'not-a-uuid', `${SPACE}x`]) {
			expect(parseContext(value)).toEqual(ALL_CONTEXT);
		}
	});

	it('round-trips through the cookie value', () => {
		for (const context of [ALL_CONTEXT, parseContext(SPACE)]) {
			expect(parseContext(serialiseContext(context))).toEqual(context);
		}
	});
});

describe('validContext', () => {
	it('keeps a space the viewer is in, and makes any other Everyone', () => {
		expect(validContext(parseContext(SPACE), [SPACE])).toEqual(parseContext(SPACE));
		expect(validContext(parseContext(OTHER), [SPACE])).toEqual(ALL_CONTEXT);
		expect(validContext(ALL_CONTEXT, [])).toEqual(ALL_CONTEXT);
	});
});

describe('spacesInContext', () => {
	const spaces = [{ id: SPACE }, { id: OTHER }];
	it('is every space in Everyone and the one named otherwise', () => {
		expect(spacesInContext(ALL_CONTEXT, spaces)).toEqual(spaces);
		expect(spacesInContext(parseContext(OTHER), spaces)).toEqual([{ id: OTHER }]);
	});
});

describe('sameContext', () => {
	it('compares by value', () => {
		expect(sameContext(parseContext(SPACE), { kind: 'space', spaceId: SPACE })).toBe(true);
		expect(sameContext(parseContext(SPACE), ALL_CONTEXT)).toBe(false);
	});
});

describe('readCookie', () => {
	it('finds one cookie among several', () => {
		expect(readCookie(`debug=1; context=${SPACE}; other=x`, 'context')).toBe(SPACE);
		expect(readCookie('debug=1', 'context')).toBeNull();
		expect(readCookie('', 'context')).toBeNull();
	});
});
