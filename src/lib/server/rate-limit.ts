import { lte, sql } from 'drizzle-orm';
import type { Db } from './db';
import { authRateLimits } from './db/schema';
import { keyedHash } from './keyed-hash';

/**
 * The rate limit on signing in, signing up and changing a password.
 *
 * The app's own rather than Better Auth's, which it replaces (`rateLimit` in
 * `auth.ts` is off). Better Auth's limiter runs only in its HTTP router, so it
 * never saw the `/login`, `/signup` and change-password form actions, which
 * call `locals.auth.api.*` directly — the only way those forms sign anyone in.
 * It was also switched on only when `NODE_ENV` is `production`, which Workers
 * does not set, and kept its counts in memory, which on Workers is one isolate
 * of many. So in practice nothing limited password guessing at all.
 *
 * Counted per client address (from SvelteKit's `getClientAddress()`, see
 * `clientBucket`) and per bucket, in the database, with a fixed window per
 * rule. The HTTP endpoints and the form actions share buckets, so alternating
 * between them buys nothing. See docs/self-hosting.md for what a self-hoster
 * has to set for the address to be the client's rather than their proxy's.
 *
 * Relative imports only: `scheduled.ts` prunes the table, and wrangler bundles
 * that without SvelteKit's aliases.
 */

export type RateLimitRule = { max: number; windowSeconds: number };

/**
 * Every attempt counts, successful or not — counting only failures would need
 * a second write after Better Auth answers, and a real person signs in once.
 *
 * Two windows each: a short one against a burst, and an hour against the slow
 * and steady guesser the short one alone lets through (3 per 10 seconds is
 * still 26,000 a day). Generous enough for a household behind one address.
 */
export const AUTH_RATE_LIMITS = {
	'sign-in': [
		{ max: 5, windowSeconds: 60 },
		{ max: 30, windowSeconds: 60 * 60 }
	],
	'sign-up': [
		{ max: 3, windowSeconds: 60 },
		{ max: 10, windowSeconds: 60 * 60 }
	],
	'change-password': [
		{ max: 5, windowSeconds: 60 },
		{ max: 20, windowSeconds: 60 * 60 }
	]
} as const satisfies Record<string, readonly RateLimitRule[]>;

export type AuthRateLimitBucket = keyof typeof AUTH_RATE_LIMITS;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** What `locals.authRateLimit` is: one attempt against a bucket, for this request's client. */
export type AuthRateLimiter = (bucket: AuthRateLimitBucket) => Promise<RateLimitResult>;

/** The limiter a disabled deployment gets: `vite dev`, and `AUTH_RATE_LIMIT=off`. */
export const unlimited: AuthRateLimiter = () => Promise.resolve({ allowed: true });

/**
 * The Better Auth endpoint paths (under `/api/auth`) that are the same attempt
 * as a form action, so the hook can count them in the same bucket.
 */
export function bucketForAuthPath(path: string): AuthRateLimitBucket | null {
	if (path.startsWith('/sign-in/')) {
		return 'sign-in';
	}
	if (path.startsWith('/sign-up/')) {
		return 'sign-up';
	}
	if (path === '/change-password') {
		return 'change-password';
	}
	return null;
}

const IPV4_MAPPED: RegExp = /^::ffff:(?<ipv4>\d{1,3}(?:\.\d{1,3}){3})$/i;

/**
 * What a client address is counted as: itself for IPv4, its /64 for IPv6.
 *
 * A single IPv6 subscriber is handed a whole /64 — 2^64 addresses — so
 * counting each address alone would let one guesser pick a fresh address per
 * attempt. The /64 is the unit an ISP gives one customer, which is what Better
 * Auth's own limiter used too. An IPv4-mapped address counts as the IPv4 it is.
 */
export function clientBucket(address: string): string {
	const mapped: RegExpExecArray | null = IPV4_MAPPED.exec(address);
	if (mapped?.groups?.ipv4) {
		return mapped.groups.ipv4;
	}
	if (!address.includes(':')) {
		return address;
	}
	// Drops a zone index (`fe80::1%eth0`), then expands `::`.
	const [bare = ''] = address.toLowerCase().split('%');
	const [head = '', tail] = bare.split('::');
	const left = head ? head.split(':') : [];
	const right = tail ? tail.split(':') : [];
	const groups =
		tail === undefined
			? left
			: [
					...left,
					...new Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'),
					...right
				];
	return `${groups
		.slice(0, 4)
		.map((group) => group.padStart(4, '0'))
		.join(':')}::/64`;
}

/**
 * Records one attempt against every rule and says whether it may go ahead.
 *
 * One upsert per rule, run together in a batch: the row's count goes up by one,
 * or starts again at one if its window has closed. SQLite evaluates every
 * `SET` expression against the row as it was, so the two `CASE`s agree, and
 * a statement is atomic on both D1 and libsql, so concurrent attempts cannot
 * all read a count under the limit. Refused attempts still count, which keeps
 * a hammering client refused until it stops.
 */
export async function consumeRateLimit(
	db: Db,
	secret: string,
	scope: string,
	rules: readonly RateLimitRule[],
	now: Date = new Date()
): Promise<RateLimitResult> {
	const at = now.getTime();
	// Hashed first, and the queries built afterwards without an `await`: a
	// Drizzle query is a thenable, so one returned from an async callback is
	// executed on the spot rather than handed to the batch.
	const keys = await Promise.all(
		rules.map((rule) => keyedHash(secret, 'rate-limit', `${rule.windowSeconds}|${scope}`))
	);
	const statements = rules.map((rule, index) => {
		const end = at + rule.windowSeconds * 1000;
		const closed = sql`${authRateLimits.windowEnd} <= ${at}`;
		return db
			.insert(authRateLimits)
			.values({ key: keys[index] ?? '', count: 1, windowEnd: new Date(end) })
			.onConflictDoUpdate({
				target: authRateLimits.key,
				set: {
					count: sql`CASE WHEN ${closed} THEN 1 ELSE ${authRateLimits.count} + 1 END`,
					windowEnd: sql`CASE WHEN ${closed} THEN ${end} ELSE ${authRateLimits.windowEnd} END`
				}
			})
			.returning({ count: authRateLimits.count, windowEnd: authRateLimits.windowEnd });
	});
	const [first, ...rest] = statements;
	if (!first) {
		return { allowed: true };
	}
	const results = await db.batch([first, ...rest]);

	let retryAfterSeconds = 0;
	results.forEach(([row], index) => {
		const rule = rules[index];
		if (row && rule && row.count > rule.max) {
			const wait = Math.ceil((row.windowEnd.getTime() - at) / 1000);
			retryAfterSeconds = Math.max(retryAfterSeconds, wait, 1);
		}
	});
	return retryAfterSeconds > 0 ? { allowed: false, retryAfterSeconds } : { allowed: true };
}

/** Builds `locals.authRateLimit` for one request's client. */
export function authRateLimiter(db: Db, secret: string, clientAddress: string): AuthRateLimiter {
	const client = clientBucket(clientAddress);
	return (bucket) => consumeRateLimit(db, secret, `${bucket}|${client}`, AUTH_RATE_LIMITS[bucket]);
}

/** The message a form shows when refused. Says how long, and nothing about why. */
export function rateLimitMessage(retryAfterSeconds: number): string {
	const minutes = Math.ceil(retryAfterSeconds / 60);
	const wait =
		retryAfterSeconds < 60
			? `${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}`
			: `${minutes} minute${minutes === 1 ? '' : 's'}`;
	return `Too many attempts. Try again in ${wait}.`;
}

/**
 * Deletes counters whose window has closed. Run with the media sweep —
 * `scheduled.ts` on Workers, `self-hosted/sweep.ts` in the Docker image — so
 * the table holds only the last hour's clients.
 */
export async function pruneRateLimits(db: Db, now: Date = new Date()): Promise<number> {
	const deleted = await db
		.delete(authRateLimits)
		.where(lte(authRateLimits.windowEnd, now))
		.returning({ key: authRateLimits.key });
	return deleted.length;
}
