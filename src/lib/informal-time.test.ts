import { describe, expect, it } from 'vitest';
import { informalTime, informalWhen, nearDay, sentenceCase } from './informal-time';

const at = (iso: string) => new Date(iso);

describe('informalTime', () => {
	it('drops ":00" and closes up a lower-case day period, in a 12-hour locale', () => {
		expect(informalTime(at('2026-10-22T09:00:00Z'), { timeZone: 'UTC', locale: 'en-US' })).toBe(
			'9am'
		);
		expect(informalTime(at('2026-10-22T18:30:00Z'), { timeZone: 'UTC', locale: 'en-US' })).toBe(
			'6:30pm'
		);
		expect(informalTime(at('2026-10-22T00:05:00Z'), { timeZone: 'UTC', locale: 'en-AU' })).toBe(
			'12:05am'
		);
	});

	it('leaves a 24-hour locale as it writes it', () => {
		expect(informalTime(at('2026-10-22T21:00:00Z'), { timeZone: 'UTC', locale: 'en-GB' })).toBe(
			'21:00'
		);
	});

	it('is the time in the time zone it is given', () => {
		expect(
			informalTime(at('2026-10-22T21:00:00Z'), { timeZone: 'Australia/Sydney', locale: 'en-US' })
		).toBe('8am');
	});
});

describe('nearDay', () => {
	it('says today, tomorrow and yesterday in the reader’s words, and nothing further off', () => {
		expect(nearDay(0, 'en')).toBe('today');
		expect(nearDay(1, 'en')).toBe('tomorrow');
		expect(nearDay(-1, 'en')).toBe('yesterday');
		expect(nearDay(2, 'en')).toBeNull();
		expect(nearDay(1, 'fr')).toBe('demain');
	});
});

describe('sentenceCase', () => {
	it('capitalises only the first letter', () => {
		expect(sentenceCase('tomorrow 9am')).toBe('Tomorrow 9am');
	});
});

describe('informalWhen', () => {
	const now = new Date('2026-10-22T10:00:00.000Z');
	const when = (iso: string, options = {}) =>
		informalWhen(new Date(iso), now, { timeZone: 'UTC', locale: 'en-US', ...options });

	it('names nearby days either way, and weekdays within a week', () => {
		expect(when('2026-10-22T18:00:00Z')).toBe('Today 6pm');
		expect(when('2026-10-21T18:40:00Z')).toBe('Yesterday 6:40pm');
		expect(when('2026-10-23T09:00:00Z', { capitalise: false })).toBe('tomorrow 9am');
		expect(when('2026-10-24T19:00:00Z')).toBe('Sat 7pm');
		expect(when('2026-10-18T19:00:00Z')).toBe('Sun 7pm');
	});

	it('dates anything further, with the time unless asked not to', () => {
		expect(when('2026-11-03T09:00:00Z')).toBe('Nov 3, 9am');
		expect(when('2026-11-03T09:00:00Z', { timeWhenFar: false })).toBe('Nov 3');
		expect(when('2025-12-30T09:00:00Z')).toBe('Dec 30, 2025, 9am');
	});
});
