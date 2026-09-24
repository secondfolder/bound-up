import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FAKE_WRAP_BLOB, PASSWORD_WRAP_PARAMS } from '../testing/crypto';
import { createTestDb, type TestDb } from '../testing/db';
import {
	createTestInvite,
	createTestPartnership,
	createTestThread,
	createTestUser,
	createTestUserKeys,
	readUserKeysRow,
	readWrapRows,
	type TestUser
} from '../testing/fixtures';
import {
	account,
	accountRecoveryRequests,
	historyRestoreRequests,
	passkey,
	session
} from './db/schema';
import { applyHistoryRestore, declineHistoryRestore, listRestoreRequests } from './messaging';
import {
	completeAccountRecovery,
	MAX_REQUESTS_PER_EMAIL,
	MAX_REQUESTS_PER_IP,
	RECOVERY_TTL_MS,
	recoveryStatus,
	startAccountRecovery
} from './recovery';

/**
 * Partner-assisted sign-in, end to end on the server: starting a request with
 * no session, a partner approving it by re-encrypting, and completing it.
 */

let harness: TestDb;
let ada: TestUser;
let jun: TestUser;
let partnershipId: string;

const SECRET = 'test-auth-secret';
const NEW_RECIPIENT = 'age1newrecipientforada';
const NEW_BLOB = 'bmV3LXdyYXAtYmxvYi10aGF0LWlzLWxvbmctZW5vdWdo';

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	jun = await createTestUser(harness.db, { name: 'Jun' });
	await createTestUserKeys(harness.db, ada);
	await createTestUserKeys(harness.db, jun);
	partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
});

afterEach(() => harness.close());

function start(email: string, options: { ip?: string; now?: Date } = {}) {
	return startAccountRecovery(
		harness.db,
		{
			email,
			recipient: NEW_RECIPIENT,
			wrap: { params: PASSWORD_WRAP_PARAMS, blob: NEW_BLOB },
			ip: options.ip ?? '203.0.113.9',
			secret: SECRET
		},
		options.now
	);
}

async function startOk(email = ada.email, options: { ip?: string; now?: Date } = {}) {
	const result = await start(email, options);
	if (!result.ok) {
		throw new Error('expected the request to start');
	}
	return result.token;
}

/** Jun re-encrypts everything and finishes, which is what approves the sign-in. */
async function approveAsJun() {
	const [request] = await listRestoreRequests(harness.db, partnershipId, jun.id);
	await applyHistoryRestore(harness.db, {
		partnershipId,
		requestId: request.id,
		actorId: jun.id,
		messages: [],
		final: true
	});
}

describe('starting a request', () => {
	/**
	 * The rule the whole endpoint is written around: nothing in the answer says
	 * whether the email has an account, or whether that account has a partner.
	 */
	it('answers the same for a real account, one with no partner, and no account', async () => {
		const loner = await createTestUser(harness.db, { name: 'Lone' });
		const answers = await Promise.all([
			start(ada.email),
			start(loner.email, { ip: '203.0.113.10' }),
			start('nobody@example.test', { ip: '203.0.113.11' })
		]);

		for (const answer of answers) {
			expect(Object.keys(answer).sort()).toEqual(['ok', 'token']);
			expect(answer).toMatchObject({ ok: true, token: expect.stringMatching(/^[\w-]{43}$/) });
		}
	});

	it('keeps neither the token nor the email in the clear', async () => {
		const token = await startOk();
		const [row] = await harness.db.select().from(accountRecoveryRequests);

		expect(row.tokenHash).not.toBe(token);
		expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
		expect(JSON.stringify(row)).not.toContain(ada.email);
		expect(JSON.stringify(row)).not.toContain('203.0.113.9');
		expect(row).toMatchObject({ userId: ada.id, recipient: NEW_RECIPIENT, status: 'pending' });
	});

	it('asks every partner, and nobody else', async () => {
		const cas = await createTestUser(harness.db, { name: 'Cas' });
		await createTestUserKeys(harness.db, cas);
		const second = await createTestPartnership(harness.db, ada, cas);
		// A pending invite is not a partner yet.
		await createTestInvite(harness.db, ada);

		await startOk();

		const restores = await harness.db.select().from(historyRestoreRequests);
		expect(restores.map((row) => row.partnershipId).sort()).toEqual(
			[partnershipId, second.id].sort()
		);
		expect(restores.every((row) => row.requestedRecipient === NEW_RECIPIENT)).toBe(true);
	});

	it('replaces an earlier pending request, so a partner sees one code', async () => {
		const first = await startOk();
		await startOk();

		await expect(listRestoreRequests(harness.db, partnershipId, jun.id)).resolves.toHaveLength(1);
		await expect(recoveryStatus(harness.db, first)).resolves.toBe('expired');
	});

	/** An unknown email reaches the limit at exactly the same rate. */
	it('limits requests per email, whether or not the account exists', async () => {
		for (const email of [ada.email, 'nobody@example.test']) {
			for (let i = 0; i < MAX_REQUESTS_PER_EMAIL; i += 1) {
				await startOk(email, { ip: `198.51.100.${i}` });
			}
			await expect(start(email, { ip: '198.51.100.99' })).resolves.toEqual({
				ok: false,
				reason: 'rate-limited'
			});
		}
	});

	it('limits requests per address', async () => {
		for (let i = 0; i < MAX_REQUESTS_PER_IP; i += 1) {
			await startOk(`person${i}@example.test`, { ip: '192.0.2.1' });
		}
		await expect(start('one-more@example.test', { ip: '192.0.2.1' })).resolves.toMatchObject({
			ok: false
		});
		// Someone else is unaffected.
		await expect(start('one-more@example.test', { ip: '192.0.2.2' })).resolves.toMatchObject({
			ok: true
		});
	});
});

describe('where a request stands', () => {
	it('is pending until a partner finishes, then approved', async () => {
		const token = await startOk();
		await expect(recoveryStatus(harness.db, token)).resolves.toBe('pending');

		await approveAsJun();
		await expect(recoveryStatus(harness.db, token)).resolves.toBe('approved');
	});

	it('is declined once every partner said the code did not match', async () => {
		const token = await startOk();
		const [request] = await listRestoreRequests(harness.db, partnershipId, jun.id);
		await declineHistoryRestore(harness.db, {
			partnershipId,
			requestId: request.id,
			actorId: jun.id
		});

		await expect(recoveryStatus(harness.db, token)).resolves.toBe('declined');
	});

	it('expires', async () => {
		const token = await startOk();
		const later = new Date(Date.now() + RECOVERY_TTL_MS + 1000);
		await expect(recoveryStatus(harness.db, token, later)).resolves.toBe('expired');
	});

	it('says nothing about a token it does not know', async () => {
		await expect(recoveryStatus(harness.db, 'x'.repeat(43))).resolves.toBe('expired');
	});

	/** For an unknown email there is nobody to answer, and it looks like waiting. */
	it('stays pending for an email with no account', async () => {
		const token = await startOk('nobody@example.test');
		await expect(recoveryStatus(harness.db, token)).resolves.toBe('pending');
	});

	/** Only the other member can approve — the requester cannot vouch for themselves. */
	it('cannot be approved by the requester or a stranger', async () => {
		const token = await startOk();
		const [request] = await listRestoreRequests(harness.db, partnershipId, ada.id);
		const stranger = await createTestUser(harness.db);
		for (const actorId of [ada.id, stranger.id]) {
			await applyHistoryRestore(harness.db, {
				partnershipId,
				requestId: request.id,
				actorId,
				messages: [],
				final: true
			});
		}
		await expect(recoveryStatus(harness.db, token)).resolves.toBe('pending');
	});
});

describe('completing a request', () => {
	beforeEach(async () => {
		await harness.db.insert(account).values({
			id: `acct-${ada.id}`,
			accountId: ada.id,
			providerId: 'credential',
			userId: ada.id,
			password: 'old-hash',
			createdAt: new Date(),
			updatedAt: new Date()
		});
		await harness.db.insert(passkey).values({
			id: 'pk-ada',
			name: 'Old phone',
			publicKey: 'irrelevant',
			userId: ada.id,
			credentialID: 'cred-ada',
			counter: 0,
			deviceType: 'singleDevice',
			backedUp: false,
			transports: 'internal',
			createdAt: new Date()
		});
		await harness.db.insert(session).values({
			id: 'session-lost-phone',
			token: 'lost-phone',
			userId: ada.id,
			expiresAt: new Date(Date.now() + 86_400_000),
			createdAt: new Date(),
			updatedAt: new Date()
		});
	});

	it('refuses before a partner has approved', async () => {
		const token = await startOk();
		await expect(
			completeAccountRecovery(harness.db, { token, passwordHash: 'new-hash' })
		).resolves.toEqual({ ok: false, reason: 'not-approved' });
		await expect(readUserKeysRow(harness.db, ada.id)).resolves.not.toMatchObject({
			recipient: NEW_RECIPIENT
		});
	});

	it('refuses a token it does not know', async () => {
		await expect(
			completeAccountRecovery(harness.db, { token: 'y'.repeat(43), passwordHash: 'new-hash' })
		).resolves.toEqual({ ok: false, reason: 'expired' });
	});

	/**
	 * Everything in one batch: new keys and password in, every old way into the
	 * account out, so whoever holds the lost devices is signed out and nothing
	 * left behind can sign in to a device that could never get its key.
	 */
	it('swaps in the new keys and password, and removes every other way in', async () => {
		await createTestThread(harness.db, partnershipId, jun);
		const token = await startOk();
		await approveAsJun();

		await expect(
			completeAccountRecovery(harness.db, { token, passwordHash: 'new-hash' })
		).resolves.toEqual({ ok: true, userId: ada.id });

		await expect(readUserKeysRow(harness.db, ada.id)).resolves.toMatchObject({
			recipient: NEW_RECIPIENT
		});
		const wraps = await readWrapRows(harness.db, ada.id);
		expect(wraps).toHaveLength(1);
		expect(wraps[0]).toMatchObject({ type: 'password', blob: NEW_BLOB });
		expect(wraps[0].blob).not.toBe(FAKE_WRAP_BLOB);

		const [credential] = await harness.db
			.select({ password: account.password })
			.from(account)
			.where(eq(account.userId, ada.id));
		expect(credential.password).toBe('new-hash');
		await expect(
			harness.db.select().from(passkey).where(eq(passkey.userId, ada.id))
		).resolves.toHaveLength(0);
		await expect(
			harness.db.select().from(session).where(eq(session.userId, ada.id))
		).resolves.toHaveLength(0);

		// Done, and cannot be done twice.
		await expect(recoveryStatus(harness.db, token)).resolves.toBe('completed');
		await expect(
			completeAccountRecovery(harness.db, { token, passwordHash: 'again' })
		).resolves.toEqual({ ok: false, reason: 'not-approved' });
	});

	it('leaves the partner who helped untouched', async () => {
		const token = await startOk();
		await approveAsJun();
		const before = await readUserKeysRow(harness.db, jun.id);

		await completeAccountRecovery(harness.db, { token, passwordHash: 'new-hash' });

		await expect(readUserKeysRow(harness.db, jun.id)).resolves.toMatchObject({
			recipient: before.recipient
		});
		await expect(readWrapRows(harness.db, jun.id)).resolves.toHaveLength(1);
	});
});
