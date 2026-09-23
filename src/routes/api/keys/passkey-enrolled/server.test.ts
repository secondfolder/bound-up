import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { passkey } from '$lib/server/db/schema';
import { passkeyPrfStatusFor } from '$lib/server/keys';
import { FAKE_WRAP_BLOB } from '$lib/testing/crypto';
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
 * Recording what a passkey enrolment established.
 *
 * Named `server.test.ts` and not `+server.test.ts`: SvelteKit reserves the `+`
 * prefix and refuses to build a route file it does not recognise.
 */

let harness: TestDb;
let ada: TestUser;

const PRF_PARAMS = JSON.stringify({
	type: 'webauthn-prf',
	version: 1,
	rpId: 'bound-up.test',
	passkeyId: 'pk-ada'
});

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
		createdAt: new Date(),
		aaguid: 'bada5566-a7aa-401f-bd96-45619a55120d'
	});
}

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	await givePasskey(ada.id, 'pk-ada');
});

afterEach(() => harness.close());

function post(json: unknown, user: TestUser | null = ada) {
	return POST(fakeEvent({ db: harness.db, user, json }));
}

describe('POST /api/keys/passkey-enrolled', () => {
	it('refuses an unsigned visitor', async () => {
		const result = await runAndCatch(() => post({ passkeyId: 'pk-ada' }, null));
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});

	it('rejects a body it cannot read', async () => {
		const result = await runAndCatch(() => POST(fakeEvent({ db: harness.db, user: ada })));
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});

	it('rejects a verdict that is not one of the two', async () => {
		const result = await runAndCatch(() => post({ passkeyId: 'pk-ada', prfStatus: 'maybe' }));
		expect(result).toMatchObject({ type: 'error', status: 400 });
	});

	it('records the verdict on its own', async () => {
		await post({ passkeyId: 'pk-ada', prfStatus: 'unsupported' });

		await expect(passkeyPrfStatusFor(harness.db, ada.id)).resolves.toEqual(
			new Map([['pk-ada', 'unsupported']])
		);
		// No wrap was sent, so none was written — a passkey that cannot do PRF
		// still signs in, and that is the whole state being recorded.
		await expect(readWrapRows(harness.db, ada.id)).resolves.toHaveLength(0);
	});

	it('records the verdict and the wrap together', async () => {
		await createTestUserKeys(harness.db, ada);

		await post({
			passkeyId: 'pk-ada',
			prfStatus: 'supported',
			wrap: { params: PRF_PARAMS, blob: FAKE_WRAP_BLOB, label: '1Password' }
		});

		await expect(passkeyPrfStatusFor(harness.db, ada.id)).resolves.toEqual(
			new Map([['pk-ada', 'supported']])
		);
		const wraps = await readWrapRows(harness.db, ada.id);
		expect(wraps.filter((wrap) => wrap.type === 'webauthn-prf')).toMatchObject([
			{ label: '1Password', blob: FAKE_WRAP_BLOB }
		]);
	});

	/**
	 * The two writes describe one event. A client that managed the first and not
	 * the second would leave a passkey marked `supported` with nothing behind
	 * it — which reads as "this unlocks your messages" and does not.
	 */
	it('refuses a wrap for an account with no identity to wrap', async () => {
		const result = await runAndCatch(() =>
			post({
				passkeyId: 'pk-ada',
				prfStatus: 'supported',
				wrap: { params: PRF_PARAMS, blob: FAKE_WRAP_BLOB }
			})
		);

		expect(result).toMatchObject({ type: 'error', status: 409 });
	});

	it("records nothing against someone else's passkey", async () => {
		const jun = await createTestUser(harness.db, { name: 'Jun' });
		await givePasskey(jun.id, 'pk-jun');

		const result = await runAndCatch(() => post({ passkeyId: 'pk-jun', prfStatus: 'unsupported' }));

		expect(result).toMatchObject({ type: 'error', status: 404 });
		await expect(passkeyPrfStatusFor(harness.db, jun.id)).resolves.toEqual(new Map());
	});

	it('rejects a wrap whose params are not a shape this version understands', async () => {
		await createTestUserKeys(harness.db, ada);

		const result = await runAndCatch(() =>
			post({
				passkeyId: 'pk-ada',
				wrap: { params: JSON.stringify({ type: 'telepathy' }), blob: FAKE_WRAP_BLOB }
			})
		);

		expect(result).toMatchObject({ type: 'error', status: 400 });
	});
});
