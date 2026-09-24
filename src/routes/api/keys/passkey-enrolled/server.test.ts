import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { passkey } from '$lib/server/db/schema';
import { FAKE_WRAP_BLOB, PASSWORD_WRAP_PARAMS } from '$lib/testing/crypto';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestUser,
	createTestUserKeys,
	readWrapRows,
	type TestUser
} from '$lib/testing/fixtures';
import { POST } from './+server';

/**
 * Storing the wrap a new passkey was sealed to.
 *
 * Named `server.test.ts` and not `+server.test.ts`: SvelteKit reserves the `+`
 * prefix and refuses to build a route file it does not recognise.
 */

let harness: TestDb;
let ada: TestUser;

const wrapParams = (type: 'passkey-prf' | 'passkey-handle', credentialId = 'cred-pk-ada') =>
	JSON.stringify({ type, version: 1, credentialId, rpId: 'bound-up.test' });

async function givePasskey(userId: string, id: string) {
	await harness.db.insert(passkey).values({
		id,
		name: 'A passkey',
		publicKey: 'irrelevant',
		userId,
		credentialID: `cred-${id}`,
		counter: 0,
		deviceType: 'singleDevice',
		backedUp: false,
		transports: 'internal',
		createdAt: new Date()
	});
}

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	await createTestUserKeys(harness.db, ada);
	await givePasskey(ada.id, 'pk-ada');
});

afterEach(() => harness.close());

function post(json: unknown, user: TestUser | null = ada) {
	return POST(fakeEvent({ db: harness.db, user, json }));
}

describe('POST /api/keys/passkey-enrolled', () => {
	it('refuses an unsigned visitor', async () => {
		const result = await runAndCatch(() =>
			post(
				{ passkeyId: 'pk-ada', wrap: { params: wrapParams('passkey-prf'), blob: FAKE_WRAP_BLOB } },
				null
			)
		);
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});

	it('rejects a body it cannot read', async () => {
		const result = await runAndCatch(() => POST(fakeEvent({ db: harness.db, user: ada })));
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});

	/** Every passkey is created with its wrap, so there is nothing to record without one. */
	it('rejects a passkey with no wrap', async () => {
		const result = await runAndCatch(() => post({ passkeyId: 'pk-ada' }));
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});

	it('stores a PRF wrap', async () => {
		await post({
			passkeyId: 'pk-ada',
			wrap: { params: wrapParams('passkey-prf'), blob: FAKE_WRAP_BLOB }
		});
		const wraps = await readWrapRows(harness.db, ada.id);
		expect(wraps.map((wrap) => wrap.type).sort()).toEqual(['passkey-prf', 'password']);
	});

	it('stores a user-handle wrap', async () => {
		await post({
			passkeyId: 'pk-ada',
			wrap: { params: wrapParams('passkey-handle'), blob: FAKE_WRAP_BLOB }
		});
		const wraps = await readWrapRows(harness.db, ada.id);
		expect(wraps.map((wrap) => wrap.type).sort()).toEqual(['passkey-handle', 'password']);
	});

	it('refuses a password wrap, which is not what a passkey gets', async () => {
		const result = await runAndCatch(() =>
			post({
				passkeyId: 'pk-ada',
				wrap: { params: JSON.stringify(PASSWORD_WRAP_PARAMS), blob: FAKE_WRAP_BLOB }
			})
		);
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});

	it('refuses a wrap naming a credential other than the passkey’s own', async () => {
		const result = await runAndCatch(() =>
			post({
				passkeyId: 'pk-ada',
				wrap: { params: wrapParams('passkey-prf', 'cred-somebody-else'), blob: FAKE_WRAP_BLOB }
			})
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	it("stores nothing against someone else's passkey", async () => {
		const jun = await createTestUser(harness.db, { name: 'Jun' });
		await givePasskey(jun.id, 'pk-jun');

		const result = await runAndCatch(() =>
			post({
				passkeyId: 'pk-jun',
				wrap: { params: wrapParams('passkey-prf', 'cred-pk-jun'), blob: FAKE_WRAP_BLOB }
			})
		);

		expect(result).toMatchObject({ type: 'error', status: 404 });
		await expect(readWrapRows(harness.db, jun.id)).resolves.toHaveLength(0);
	});

	it('rejects a wrap whose params are not a shape this version understands', async () => {
		const result = await runAndCatch(() =>
			post({
				passkeyId: 'pk-ada',
				wrap: { params: JSON.stringify({ type: 'webauthn-prf', version: 1 }), blob: FAKE_WRAP_BLOB }
			})
		);
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});
});
