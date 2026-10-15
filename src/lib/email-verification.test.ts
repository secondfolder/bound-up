import { describe, expect, it } from 'vitest';
import { checkEmailCookie, cooldownRemaining, readCheckEmailCookie } from './email-verification';

describe('the check-email cookie', () => {
	it('round-trips, even for an address with a bar in it', () => {
		const value = checkEmailCookie('a|b@example.test', 1_760_529_600_000);
		expect(readCheckEmailCookie(value)).toEqual({
			email: 'a|b@example.test',
			sentAt: 1_760_529_600_000
		});
	});

	it('reads anything else as nothing sent', () => {
		expect(readCheckEmailCookie(undefined)).toBeNull();
		expect(readCheckEmailCookie('ada@example.test')).toBeNull();
		expect(readCheckEmailCookie('123|')).toBeNull();
	});
});

describe('cooldownRemaining', () => {
	it('counts down the minute and stops at zero', () => {
		expect(cooldownRemaining(0, 0)).toBe(60);
		expect(cooldownRemaining(0, 59_001)).toBe(1);
		expect(cooldownRemaining(0, 60_000)).toBe(0);
		expect(cooldownRemaining(0, 3_600_000)).toBe(0);
	});
});
