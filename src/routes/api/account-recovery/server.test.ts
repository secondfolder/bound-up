import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_REQUESTS_PER_EMAIL } from '$lib/server/recovery';
import { ADA_RECIPIENT, FAKE_WRAP_BLOB, PASSWORD_WRAP_PARAMS } from '$lib/testing/crypto';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { POST as start } from './+server';
import { POST as complete } from './complete/+server';
import { POST as status } from './status/+server';

/**
 * The three partner-assisted sign-in endpoints, at the HTTP edge: what they
 * accept, and what they answer. The flow itself is `server/recovery.test.ts`.
 */

let harness: TestDb;
const authContext = {
	secret: 'test-auth-secret',
	password: { hash: vi.fn(async (value: string) => `hashed:${value}`) }
};

beforeEach(async () => {
	harness = await createTestDb();
});

afterEach(() => harness.close());

const validStart = {
	email: 'nobody@example.test',
	recipient: ADA_RECIPIENT,
	wrapParams: JSON.stringify(PASSWORD_WRAP_PARAMS),
	wrapBlob: FAKE_WRAP_BLOB
};

/** Any of the three handlers; each types its own event, which a fake cannot satisfy for all. */
function post(handler: (event: never) => Response | Promise<Response>, json: unknown) {
	return handler(fakeEvent({ db: harness.db, json, authContext, clientAddress: '203.0.113.9' }));
}

describe('POST /api/account-recovery', () => {
	it('hands back a token, with no session needed', async () => {
		const response = await post(start, validStart);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ token: expect.stringMatching(/^[\w-]{43}$/) });
	});

	/** The requester gets back in with a password; no other kind of wrap will do. */
	it('refuses anything but a password wrap', async () => {
		const result = await runAndCatch(() =>
			post(start, {
				...validStart,
				wrapParams: JSON.stringify({
					type: 'passkey-prf',
					version: 1,
					credentialId: 'c',
					rpId: 'bound-up.test'
				})
			})
		);
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});

	it('refuses a malformed body', async () => {
		const result = await runAndCatch(() => post(start, { email: 'not an email' }));
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});

	it('answers 429 once the limit is reached', async () => {
		for (let i = 0; i < MAX_REQUESTS_PER_EMAIL; i += 1) {
			await post(start, validStart);
		}
		const result = await runAndCatch(() => post(start, validStart));
		expect(result).toMatchObject({ type: 'error', status: 429 });
	});

	it('still works where the client address is unknown', async () => {
		const response = await start(fakeEvent({ db: harness.db, json: validStart, authContext }));
		expect(response.status).toBe(200);
	});
});

describe('POST /api/account-recovery/status', () => {
	it('reads a pending request', async () => {
		const { token } = await (await post(start, validStart)).json();
		const response = await post(status, { token });
		await expect(response.json()).resolves.toEqual({ status: 'pending' });
	});

	it('refuses a malformed token', async () => {
		const result = await runAndCatch(() => post(status, { token: 'short' }));
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});
});

describe('POST /api/account-recovery/complete', () => {
	it('refuses a request nobody has approved', async () => {
		const { token } = await (await post(start, validStart)).json();
		const result = await runAndCatch(() => post(complete, { token, authSecret: 'A'.repeat(43) }));
		// No account behind this email, so it can never complete.
		expect(result).toMatchObject({ type: 'error', status: 410 });
		// Hashed with Better Auth's own hasher, so sign-in verifies it like any other.
		expect(authContext.password.hash).toHaveBeenCalledWith('A'.repeat(43));
	});

	it('refuses a body without a well-formed auth secret', async () => {
		const result = await runAndCatch(() =>
			post(complete, { token: 'x'.repeat(43), authSecret: 'my actual password' })
		);
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});
});
