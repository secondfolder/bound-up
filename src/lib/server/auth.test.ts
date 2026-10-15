import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db';
import { createAuth } from './auth';
import type { MailMessage } from './mail';
import { emailRateLimiter, onceEach } from './rate-limit';

// Nothing here sets a cookie, so the cookie plugin never asks for the event.
vi.mock('$app/server', () => ({
	getRequestEvent: () => {
		throw new Error('no request event in this test');
	}
}));

/**
 * Which emails Better Auth sends are held to the per-address limit. It is
 * applied where Better Auth sends, so every way of asking — the sign-up form,
 * `/api/auth/send-verification-email`, signing up again — meets it.
 */

const SECRET = 'auth-test-secret-auth-test-secret';
const PASSWORD = 'A'.repeat(43);
const EMAIL = 'ada@example.test';

let harness: TestDb;

beforeEach(async () => {
	harness = await createTestDb();
});

afterEach(() => harness.close());

/** One request's auth, recording what it would have sent once the limit had its say. */
function requestAuth() {
	const sent: MailMessage[] = [];
	const gated: Promise<void>[] = [];
	const auth = createAuth(harness.db, {
		secret: SECRET,
		origin: 'https://app.test',
		rpID: 'app.test',
		host: 'app.test',
		sendMail: (message, _what, onlyIf) => {
			gated.push(
				(async () => {
					if (!onlyIf || (await onlyIf())) {
						sent.push(message);
					}
				})()
			);
		},
		emailRateLimit: onceEach(emailRateLimiter(harness.db, SECRET))
	});
	return { auth, sent, settled: async () => await Promise.all(gated) };
}

async function signUp() {
	const request = requestAuth();
	await request.auth.api.signUpEmail({
		body: { name: 'Ada', email: EMAIL, password: PASSWORD, timezone: 'UTC' }
	});
	await request.settled();
	return request.sent;
}

describe('the per-address email limit', () => {
	it('drops a second sign-up email to one address within the minute', async () => {
		expect(await signUp()).toHaveLength(1);
		// Signing up again for the same address emails its owner — unless
		// someone has just done so.
		expect(await signUp()).toHaveLength(0);
	});

	it('limits asking for another link directly', async () => {
		expect(await signUp()).toHaveLength(1);
		const request = requestAuth();
		await request.auth.api.sendVerificationEmail({ body: { email: EMAIL } });
		await request.settled();
		expect(request.sent).toHaveLength(0);
	});

	/**
	 * Signing in only sends once the password checks out, so a stranger who has
	 * used up the address's count cannot stop its owner getting a link.
	 */
	it('still sends the link that signing in with the right password asks for', async () => {
		expect(await signUp()).toHaveLength(1);
		const request = requestAuth();
		await expect(
			request.auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } })
		).rejects.toThrow();
		await request.settled();
		expect(request.sent.map((mail) => mail.to)).toEqual([EMAIL]);
	});
});
