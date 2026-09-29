import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db';
import { authRateLimits } from './db/schema';
import {
	AUTH_RATE_LIMITS,
	authRateLimiter,
	bucketForAuthPath,
	clientBucket,
	consumeRateLimit,
	pruneRateLimits,
	rateLimitMessage
} from './rate-limit';

const SECRET = 'rate-limit-test-secret';
const start = new Date('2026-09-29T00:00:00Z');
const later = (seconds: number) => new Date(start.getTime() + seconds * 1000);
const rule = { max: 3, windowSeconds: 10 };

let harness: TestDb;

beforeEach(async () => {
	harness = await createTestDb();
});

afterEach(() => harness.close());

describe('consumeRateLimit', () => {
	it('allows up to the limit in a window, then refuses with the time left', async () => {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			await expect(consumeRateLimit(harness.db, SECRET, 'a', [rule], start)).resolves.toEqual({
				allowed: true
			});
		}
		await expect(consumeRateLimit(harness.db, SECRET, 'a', [rule], later(4))).resolves.toEqual({
			allowed: false,
			retryAfterSeconds: 6
		});
	});

	it('starts counting again once the window has closed', async () => {
		for (let attempt = 0; attempt < 4; attempt += 1) {
			await consumeRateLimit(harness.db, SECRET, 'a', [rule], start);
		}
		await expect(consumeRateLimit(harness.db, SECRET, 'a', [rule], later(10))).resolves.toEqual({
			allowed: true
		});
	});

	it('counts each scope on its own', async () => {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			await consumeRateLimit(harness.db, SECRET, 'a', [rule], start);
		}
		await expect(consumeRateLimit(harness.db, SECRET, 'b', [rule], start)).resolves.toEqual({
			allowed: true
		});
	});

	// The hour-long rule is what stops a guesser who paces themselves under the
	// short one.
	it('refuses when any one rule is over, reporting the longest wait', async () => {
		const rules = [
			{ max: 100, windowSeconds: 10 },
			{ max: 2, windowSeconds: 3600 }
		];
		await consumeRateLimit(harness.db, SECRET, 'a', rules, start);
		await consumeRateLimit(harness.db, SECRET, 'a', rules, later(20));
		await expect(consumeRateLimit(harness.db, SECRET, 'a', rules, later(40))).resolves.toEqual({
			allowed: false,
			retryAfterSeconds: 3560
		});
	});

	// Concurrent attempts are what a single read-then-write would let through.
	it('never lets more than the limit through at once', async () => {
		const results = await Promise.all(
			Array.from({ length: 10 }, () => consumeRateLimit(harness.db, SECRET, 'a', [rule], start))
		);
		expect(results.filter((result) => result.allowed)).toHaveLength(3);
	});

	// A client address is guessable, so it is only ever stored keyed.
	it('stores neither the scope nor the address in the clear', async () => {
		await consumeRateLimit(harness.db, SECRET, 'sign-in|203.0.113.7', [rule], start);
		const rows = await harness.db.select({ key: authRateLimits.key }).from(authRateLimits);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.key).toMatch(/^[0-9a-f]{64}$/);
		expect(rows[0]?.key).not.toContain('203.0.113.7');
	});
});

describe('authRateLimiter', () => {
	it('shares one budget between everything a client does in a bucket', async () => {
		const limit = authRateLimiter(harness.db, SECRET, '203.0.113.7');
		const [shortRule] = AUTH_RATE_LIMITS['sign-in'];
		for (let attempt = 0; attempt < shortRule.max; attempt += 1) {
			await expect(limit('sign-in')).resolves.toEqual({ allowed: true });
		}
		await expect(limit('sign-in')).resolves.toMatchObject({ allowed: false });
		// A different bucket, and a different client, are untouched.
		await expect(limit('sign-up')).resolves.toEqual({ allowed: true });
		await expect(authRateLimiter(harness.db, SECRET, '203.0.113.8')('sign-in')).resolves.toEqual({
			allowed: true
		});
	});
});

describe('clientBucket', () => {
	it('keeps an IPv4 address as it is', () => {
		expect(clientBucket('203.0.113.7')).toBe('203.0.113.7');
	});

	it('counts an IPv4-mapped IPv6 address as the IPv4 it is', () => {
		expect(clientBucket('::ffff:203.0.113.7')).toBe('203.0.113.7');
	});

	// One subscriber gets a whole /64; per address, they could rotate forever.
	it('counts IPv6 by its /64, however it is written', () => {
		const bucket = '2001:0db8:0000:0001::/64';
		expect(clientBucket('2001:db8:0:1::1')).toBe(bucket);
		expect(clientBucket('2001:db8:0:1:ffff:ffff:ffff:ffff')).toBe(bucket);
		expect(clientBucket('2001:DB8:0:1::abcd')).toBe(bucket);
		expect(clientBucket('2001:db8:0:2::1')).not.toBe(bucket);
		expect(clientBucket('::1')).toBe('0000:0000:0000:0000::/64');
		expect(clientBucket('fe80::1%eth0')).toBe('fe80:0000:0000:0000::/64');
	});
});

describe('bucketForAuthPath', () => {
	it('maps the Better Auth endpoints that are the same attempt as a form', () => {
		expect(bucketForAuthPath('/sign-in/email')).toBe('sign-in');
		expect(bucketForAuthPath('/sign-up/email')).toBe('sign-up');
		expect(bucketForAuthPath('/change-password')).toBe('change-password');
		expect(bucketForAuthPath('/get-session')).toBeNull();
		expect(bucketForAuthPath('/passkey/verify-authentication')).toBeNull();
	});
});

describe('rateLimitMessage', () => {
	it('says how long to wait, in the unit that reads naturally', () => {
		expect(rateLimitMessage(1)).toBe('Too many attempts. Try again in 1 second.');
		expect(rateLimitMessage(42)).toBe('Too many attempts. Try again in 42 seconds.');
		expect(rateLimitMessage(61)).toBe('Too many attempts. Try again in 2 minutes.');
		expect(rateLimitMessage(3600)).toBe('Too many attempts. Try again in 60 minutes.');
	});
});

describe('pruneRateLimits', () => {
	it('deletes only counters whose window has closed', async () => {
		await consumeRateLimit(harness.db, SECRET, 'short', [{ max: 1, windowSeconds: 10 }], start);
		await consumeRateLimit(harness.db, SECRET, 'long', [{ max: 1, windowSeconds: 3600 }], start);
		await expect(pruneRateLimits(harness.db, later(60))).resolves.toBe(1);
		await expect(harness.db.select().from(authRateLimits)).resolves.toHaveLength(1);
	});
});
