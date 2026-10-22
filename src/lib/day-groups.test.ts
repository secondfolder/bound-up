import { describe, expect, it } from 'vitest';
import { groupByDay } from './day-groups';

describe('groupByDay', () => {
	const now = new Date('2026-10-22T12:00:00.000Z');
	const at = (iso: string) => ({ id: iso, date: new Date(iso) });

	it('names today and yesterday, dates the rest, and keeps the order it was given', () => {
		const groups = groupByDay(
			[
				at('2026-10-22T09:00:00.000Z'),
				at('2026-10-22T08:00:00.000Z'),
				at('2026-10-21T20:00:00.000Z'),
				at('2026-10-15T20:00:00.000Z'),
				at('2025-12-30T20:00:00.000Z')
			],
			(item) => item.date,
			now,
			'UTC',
			'en-US'
		);
		expect(groups.map((group) => [group.label, group.items.length])).toEqual([
			['Today', 2],
			['Yesterday', 1],
			['Thu, Oct 15', 1],
			['Tue, Dec 30, 2025', 1]
		]);
	});

	it('decides the day in the time zone it is given', () => {
		// 23:30 UTC on the 21st is already the 22nd in Sydney.
		const [group] = groupByDay(
			[at('2026-10-21T23:30:00.000Z')],
			(item) => item.date,
			now,
			'Australia/Sydney'
		);
		expect(group?.label).toBe('Today');
	});
});
