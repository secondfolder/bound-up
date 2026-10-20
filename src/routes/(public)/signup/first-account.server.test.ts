import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { user as users } from '$lib/server/db/schema/auth';
import { ADA_RECIPIENT, FAKE_WRAP_BLOB, PASSWORD_WRAP_PARAMS } from '$lib/testing/crypto';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestUser } from '$lib/testing/fixtures';
import { testSettings } from '$lib/testing/settings';
import { actions } from './+page.server';

/**
 * The first account on a server whose email is not set up yet: confirmed
 * without a link, so someone can reach the admin screen to set email up.
 *
 * A file of its own because it needs `dev` false. Under `vite dev` (and so
 * vitest) an unset mailer falls back to the local outbox, and email always
 * works.
 */
vi.mock('$app/environment', () => ({ dev: false, browser: false, building: false }));
vi.mock('$lib/server/response-floor', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/response-floor')>()),
	startTimer: () => 0,
	holdUntilFloor: () => Promise.resolve()
}));

const signup = {
	name: 'Ada',
	email: 'ada@example.test',
	timezone: 'Europe/London',
	authSecret: 'A'.repeat(43),
	recipient: ADA_RECIPIENT,
	wrapParams: JSON.stringify(PASSWORD_WRAP_PARAMS),
	wrapBlob: FAKE_WRAP_BLOB
};

let harness: TestDb;

beforeEach(async () => {
	harness = await createTestDb();
});

afterEach(() => harness.close());

/** Better Auth's `signUpEmail` for a new address: stores an unconfirmed user. */
const signUpEmail = vi.fn(async ({ body }: { body: { name: string; email: string } }) => {
	await harness.db.insert(users).values({
		id: 'new-account',
		name: body.name,
		email: body.email,
		emailVerified: false,
		image: null,
		timezone: 'UTC',
		createdAt: new Date(),
		updatedAt: new Date()
	});
	return { user: { id: 'new-account' } };
});

function signUp(settings = testSettings()) {
	return runAndCatch(() =>
		actions.default(
			fakeEvent({
				db: harness.db,
				path: '/signup?redirectTo=%2Fhome',
				formData: signup,
				authApi: { signUpEmail },
				cookies: {},
				settings
			})
		)
	);
}

async function verified(): Promise<boolean | undefined> {
	const [row] = await harness.db
		.select({ emailVerified: users.emailVerified })
		.from(users)
		.where(eq(users.id, 'new-account'));
	return row?.emailVerified;
}

describe('the first account on a server with no email', () => {
	it('is confirmed without a link, and sent to log in saying why', async () => {
		expect(await signUp()).toMatchObject({
			type: 'redirect',
			location: '/login?setup=1&redirectTo=%2Fhome'
		});
		expect(await verified()).toBe(true);
	});

	it('is not, once email works', async () => {
		const result = await signUp(
			testSettings({ mailFrom: 'hi@example.test', mailTransport: 'resend', resendApiKey: 're_1' })
		);
		expect(result).toMatchObject({
			type: 'redirect',
			location: '/signup/check-email?redirectTo=%2Fhome'
		});
		expect(await verified()).toBe(false);
	});

	it('is not, for any account after the first', async () => {
		await createTestUser(harness.db);
		expect(await signUp()).toMatchObject({ location: '/signup/check-email?redirectTo=%2Fhome' });
		expect(await verified()).toBe(false);
	});
});
