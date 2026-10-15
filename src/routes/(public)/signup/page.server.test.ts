import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';
import { CHECK_EMAIL_COOKIE, readCheckEmailCookie } from '$lib/email-verification';
import { userKeys } from '$lib/server/db/schema';
import { user as users } from '$lib/server/db/schema/auth';
import { SIGN_UP_RESPONSE_FLOOR_MS } from '$lib/server/response-floor';
import { ADA_RECIPIENT, FAKE_WRAP_BLOB, PASSWORD_WRAP_PARAMS } from '$lib/testing/crypto';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import { actions, load } from './+page.server';

// The floor is real time; these tests check that it is waited on, not wait it
// out. `response-floor.test.ts` covers the waiting itself.
const holdUntilFloor = vi.hoisted(() =>
	vi.fn((_startedAt: number, _floorMs: number) => Promise.resolve())
);
vi.mock('$lib/server/response-floor', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/response-floor')>()),
	startTimer: () => 0,
	holdUntilFloor
}));

// See the note in the login test: this covers only the invite round-trip.

const user = {
	id: 'u1',
	name: 'Ada',
	email: 'ada@example.test',
	image: null,
	timezone: 'UTC',
	role: 'user'
};
let harness: TestDb;

beforeEach(async () => {
	harness = await createTestDb();
});

afterEach(() => harness.close());

test('offers a validated redirectTo to the page', async () => {
	const data = await runLoad(load(fakeEvent({ path: '/signup?redirectTo=%2Finvite%2Fabc' })));
	expect(data.redirectTo).toBe('/invite/abc');
});

test('drops a redirectTo that would leave the site', async () => {
	const data = await runLoad(load(fakeEvent({ path: '/signup?redirectTo=%2F%5Cevil.example' })));
	expect(data.redirectTo).toBeNull();
});

test('sends an already-signed-in visitor on to their invite', async () => {
	const result = await runAndCatch(() =>
		load(fakeEvent({ user, path: '/signup?redirectTo=%2Finvite%2Fabc' }))
	);
	expect(result).toMatchObject({ type: 'redirect', location: '/invite/abc' });
});

const validSignup = {
	name: 'Ada',
	email: 'ada@example.test',
	timezone: 'Europe/London',
	authSecret: 'A'.repeat(43),
	recipient: ADA_RECIPIENT,
	wrapParams: JSON.stringify(PASSWORD_WRAP_PARAMS),
	wrapBlob: FAKE_WRAP_BLOB
};

/** What Better Auth's `signUpEmail` does for a new address: stores the user. */
function signUpStoring(id = 'auth-u1') {
	return vi.fn(
		async ({
			body
		}: {
			body: { name: string; email: string; timezone: string; callbackURL: string };
		}) => {
			await harness.db.insert(users).values({
				id,
				name: body.name,
				email: body.email,
				emailVerified: false,
				image: null,
				timezone: body.timezone,
				createdAt: new Date(),
				updatedAt: new Date()
			});
			return { user: { id } };
		}
	);
}

describe('default action', () => {
	it('persists the submitted timezone on signup', async () => {
		const signUpEmail = vi.fn(
			async ({ body }: { body: { name: string; email: string; timezone: string } }) => {
				await harness.db.insert(users).values({
					id: 'auth-u1',
					name: body.name,
					email: body.email,
					emailVerified: false,
					image: null,
					timezone: body.timezone,
					createdAt: new Date(),
					updatedAt: new Date()
				});

				return { user: { id: 'auth-u1' } };
			}
		);

		const result = await runAndCatch(() =>
			actions.default(
				fakeEvent({
					db: harness.db,
					path: '/signup',
					formData: validSignup,
					authApi: { signUpEmail },
					cookies: {}
				})
			)
		);

		expect(result).toMatchObject({ type: 'redirect', location: '/signup/check-email' });
		expect(signUpEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({ timezone: 'Europe/London' })
			})
		);

		const rows = await harness.db
			.select({ timezone: users.timezone })
			.from(users)
			.where(eq(users.id, 'auth-u1'))
			.limit(1);
		expect(rows[0]?.timezone).toBe('Europe/London');
	});

	it('rejects an invalid timezone before calling Better Auth', async () => {
		const signUpEmail = vi.fn();

		const result = await actions.default(
			fakeEvent({
				db: harness.db,
				path: '/signup',
				formData: {
					name: 'Ada',
					email: 'ada@example.test',
					timezone: 'Mars/Base',
					authSecret: 'A'.repeat(43),
					recipient: ADA_RECIPIENT,
					wrapParams: JSON.stringify(PASSWORD_WRAP_PARAMS),
					wrapBlob: FAKE_WRAP_BLOB
				},
				authApi: { signUpEmail }
			})
		);

		expect(result).toMatchObject({ status: 400 });
		expect(signUpEmail).not.toHaveBeenCalled();
	});

	// Better Auth's HTTP endpoint is limited in the hook; this action never
	// goes through it.
	it('refuses a sign-up over the rate limit without creating anything', async () => {
		const signUpEmail = vi.fn();
		const authRateLimit = vi.fn(() => Promise.resolve({ allowed: false, retryAfterSeconds: 90 }));

		const result = await actions.default(
			fakeEvent({
				db: harness.db,
				path: '/signup',
				formData: {
					name: 'Ada',
					email: 'ada@example.test',
					timezone: 'Europe/London',
					authSecret: 'A'.repeat(43),
					recipient: ADA_RECIPIENT,
					wrapParams: JSON.stringify(PASSWORD_WRAP_PARAMS),
					wrapBlob: FAKE_WRAP_BLOB
				},
				authApi: { signUpEmail },
				authRateLimit
			})
		);

		expect(authRateLimit).toHaveBeenCalledWith('sign-up');
		expect(signUpEmail).not.toHaveBeenCalled();
		expect(result).toMatchObject({ status: 429 });
		expect(JSON.stringify(result)).toContain('Try again in 2 minutes');
	});
});

/**
 * Signing up no longer signs in: it ends on "check your email", and the link
 * in it comes back to the login page. See docs/email.md.
 */
describe('email verification', () => {
	it('ends on the check-email page, carrying redirectTo both there and in the link', async () => {
		const signUpEmail = signUpStoring();
		const cookies: Record<string, string> = {};
		const result = await runAndCatch(() =>
			actions.default(
				fakeEvent({
					db: harness.db,
					path: '/signup?redirectTo=%2Finvite%2Fabc',
					formData: validSignup,
					authApi: { signUpEmail },
					cookies
				})
			)
		);
		expect(result).toMatchObject({
			type: 'redirect',
			location: '/signup/check-email?redirectTo=%2Finvite%2Fabc'
		});
		expect(signUpEmail.mock.calls[0]?.[0].body.callbackURL).toBe(
			'/login?verified=1&redirectTo=%2Finvite%2Fabc'
		);
		// So the next page can say where the link went.
		expect(readCheckEmailCookie(cookies[CHECK_EMAIL_COOKIE])?.email).toBe('ada@example.test');
	});

	/**
	 * A taken address skips the account and key writes, so it would answer
	 * faster; both have to wait out the same floor before answering.
	 */
	it('holds a new and a taken address to the same response floor', async () => {
		const run = (signUpEmail: (...args: never[]) => unknown) =>
			runAndCatch(() =>
				actions.default(
					fakeEvent({
						db: harness.db,
						path: '/signup',
						formData: validSignup,
						authApi: { signUpEmail },
						cookies: {}
					})
				)
			);
		holdUntilFloor.mockClear();
		await run(signUpStoring());
		await run(vi.fn(() => Promise.resolve({ user: { id: 'never-stored' } })));
		expect(holdUntilFloor.mock.calls).toEqual([
			[0, SIGN_UP_RESPONSE_FLOOR_MS],
			[0, SIGN_UP_RESPONSE_FLOOR_MS]
		]);
	});

	it('stores keys for a new account', async () => {
		await runAndCatch(() =>
			actions.default(
				fakeEvent({
					db: harness.db,
					path: '/signup',
					formData: validSignup,
					authApi: { signUpEmail: signUpStoring() },
					cookies: {}
				})
			)
		);
		const keys = await harness.db
			.select({ recipient: userKeys.recipient })
			.from(userKeys)
			.where(eq(userKeys.userId, 'auth-u1'));
		expect(keys).toEqual([{ recipient: ADA_RECIPIENT }]);
	});

	/**
	 * Better Auth answers a sign-up for a taken address with a user that was
	 * never stored. The page must look exactly as it does for a new account, and
	 * must not try to write keys for a user that does not exist.
	 */
	it('treats a taken address exactly like a new one', async () => {
		const signUpEmail = vi.fn(() => Promise.resolve({ user: { id: 'never-stored' } }));
		const cookies: Record<string, string> = {};
		const result = await runAndCatch(() =>
			actions.default(
				fakeEvent({
					db: harness.db,
					path: '/signup',
					formData: validSignup,
					authApi: { signUpEmail },
					cookies
				})
			)
		);
		expect(result).toMatchObject({ type: 'redirect', location: '/signup/check-email' });
		expect(readCheckEmailCookie(cookies[CHECK_EMAIL_COOKIE])?.email).toBe('ada@example.test');
		const keys = await harness.db.select({ userId: userKeys.userId }).from(userKeys);
		expect(keys).toEqual([]);
	});
});
