import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';
import {
	CHECK_EMAIL_COOKIE,
	checkEmailCookie,
	RESENT_MESSAGE,
	readCheckEmailCookie,
	resendAction
} from '$lib/email-verification';
import { emailRateLimiter } from '$lib/server/rate-limit';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import { actions, load } from './+page.server';

/**
 * The page sign-up ends on. Everything here has to read the same whether or
 * not the address has an account — sign-up sends people here either way.
 */

let harness: TestDb;

beforeEach(async () => {
	harness = await createTestDb();
});

afterEach(() => harness.close());

const authContext = { secret: 'test-secret-for-check-email' };

function resend(
	email: string,
	options: { sendVerificationEmail?: () => Promise<unknown>; path?: string } = {}
) {
	const sendVerificationEmail = vi.fn(
		options.sendVerificationEmail ?? (() => Promise.resolve({ status: true }))
	);
	const cookies: Record<string, string> = {};
	const result = runAction(
		actions,
		'resend',
		fakeEvent({
			db: harness.db,
			path: options.path ?? '/signup/check-email',
			formData: { email },
			authApi: { sendVerificationEmail },
			authContext,
			emailRateLimit: emailRateLimiter(harness.db, authContext.secret),
			cookies
		})
	);
	return { result, sendVerificationEmail, cookies };
}

test('says where the link went, from the cookie sign-up set', async () => {
	const data = await runLoad(
		load(
			fakeEvent({
				path: '/signup/check-email',
				cookies: { [CHECK_EMAIL_COOKIE]: checkEmailCookie('ada@example.test', Date.now()) }
			})
		)
	);
	expect(data.email).toBe('ada@example.test');
	expect(data.resendForm.data.email).toBe('ada@example.test');
});

test('still works without the cookie', async () => {
	const data = await runLoad(load(fakeEvent({ path: '/signup/check-email', cookies: {} })));
	expect(data.email).toBeNull();
});

test('sends a signed-in visitor on', async () => {
	const user = {
		id: 'u1',
		name: 'Ada',
		email: 'ada@example.test',
		image: null,
		timezone: 'UTC',
		role: 'user'
	};
	const result = await runAndCatch(() =>
		load(fakeEvent({ user, path: '/signup/check-email?redirectTo=%2Finvite%2Fabc', cookies: {} }))
	);
	expect(result).toMatchObject({ type: 'redirect', location: '/invite/abc' });
});

test('asks Better Auth for a new link that comes back to sign-in with redirectTo', async () => {
	const { result, sendVerificationEmail } = resend('Ada@Example.test', {
		path: '/signup/check-email?redirectTo=%2Finvite%2Fabc'
	});
	expect(await result).toMatchObject({ form: { message: RESENT_MESSAGE } });
	expect(sendVerificationEmail).toHaveBeenCalledWith({
		body: { email: 'ada@example.test', callbackURL: '/login?verified=1&redirectTo=%2Finvite%2Fabc' }
	});
});

/**
 * Better Auth itself answers the same for an unknown address; this checks the
 * page does not add a difference of its own.
 */
test('says the same thing whatever Better Auth found', async () => {
	const answer = async (email: string) => {
		const { form } = (await resend(email).result) as { form: { valid: boolean; message: unknown } };
		return { valid: form.valid, message: form.message };
	};
	expect(await answer('nobody@example.test')).toEqual(await answer('ada@example.test'));
});

test('refuses over the per-client limit without sending', async () => {
	const sendVerificationEmail = vi.fn();
	const authRateLimit = vi.fn(() =>
		Promise.resolve({ allowed: false as const, retryAfterSeconds: 30 })
	);
	const result = await runAction(
		actions,
		'resend',
		fakeEvent({
			db: harness.db,
			path: '/signup/check-email',
			formData: { email: 'ada@example.test' },
			authApi: { sendVerificationEmail },
			authContext,
			authRateLimit,
			cookies: {}
		})
	);
	expect(authRateLimit).toHaveBeenCalledWith('verification-email');
	expect(sendVerificationEmail).not.toHaveBeenCalled();
	expect(result).toMatchObject({ status: 429 });
});

/**
 * One link a minute per address, whichever client asks — the countdown the
 * page shows — and four an hour. Many clients cannot fill one inbox between
 * them.
 */
describe('the per-address limit', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
	});
	afterEach(() => vi.useRealTimers());

	it('refuses a second link within the minute, saying how long to wait', async () => {
		expect(await resend('ada@example.test').result).toMatchObject({
			form: { message: RESENT_MESSAGE }
		});
		vi.setSystemTime(new Date('2026-10-15T12:00:20Z'));
		const { result, sendVerificationEmail } = resend('ADA@example.test');
		expect(await result).toMatchObject({ status: 429, data: { retryAfterSeconds: 40 } });
		expect(sendVerificationEmail).not.toHaveBeenCalled();
		// Another address is unaffected.
		expect(await resend('jun@example.test').result).toMatchObject({
			form: { message: RESENT_MESSAGE }
		});
	});

	it('allows another once the minute is up, up to four an hour', async () => {
		for (let minute = 0; minute < 4; minute += 1) {
			vi.setSystemTime(new Date(Date.UTC(2026, 9, 15, 12, minute, 0)));
			expect(await resend('Ada@Example.Test').result).toMatchObject({
				form: { message: RESENT_MESSAGE }
			});
		}
		vi.setSystemTime(new Date(Date.UTC(2026, 9, 15, 12, 5, 0)));
		expect(await resend('ada@example.test').result).toMatchObject({ status: 429 });
	});
});

describe('the countdown', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
	});
	afterEach(() => vi.useRealTimers());

	const arriving = (cookies: Record<string, string>) =>
		runLoad(load(fakeEvent({ path: '/signup/check-email', cookies })));

	it('waits out only what is left of the minute since the link went', async () => {
		const justSent = { [CHECK_EMAIL_COOKIE]: checkEmailCookie('a@b.test', Date.now()) };
		expect((await arriving(justSent)).cooldownSeconds).toBe(60);
		vi.setSystemTime(new Date('2026-10-15T12:00:45Z'));
		expect((await arriving(justSent)).cooldownSeconds).toBe(15);
		// Coming back later: nothing to wait for.
		vi.setSystemTime(new Date('2026-10-15T12:30:00Z'));
		expect((await arriving(justSent)).cooldownSeconds).toBe(0);
	});

	it('offers a link at once when nothing is known to have been sent', async () => {
		expect((await arriving({})).cooldownSeconds).toBe(0);
		expect((await arriving({ [CHECK_EMAIL_COOKIE]: 'not the format' })).cooldownSeconds).toBe(0);
	});

	it('starts again from a resend, as a reload would see it', async () => {
		const { result, cookies } = resend('Ada@Example.test');
		await result;
		expect(readCheckEmailCookie(cookies[CHECK_EMAIL_COOKIE])).toEqual({
			email: 'ada@example.test',
			sentAt: Date.now()
		});
	});
});

/** `?/resend` alone would replace the page's query, and with it the invite. */
test("posts the resend to an action that keeps the page's redirectTo", () => {
	expect(resendAction('/invite/abc')).toBe('?/resend&redirectTo=%2Finvite%2Fabc');
	expect(resendAction(null)).toBe('?/resend');
	expect(resendAction('https://evil.example')).toBe('?/resend');
});
