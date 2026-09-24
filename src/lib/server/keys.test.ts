import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	ADA_RECIPIENT,
	FAKE_WRAP_BLOB,
	JUN_RECIPIENT,
	PASSWORD_WRAP_PARAMS
} from '../testing/crypto';
import { createTestDb, type TestDb } from '../testing/db';
import {
	createTestPartnership,
	createTestUser,
	createTestUserKeys,
	readWrapRows,
	type TestUser
} from '../testing/fixtures';
import { passkey } from './db/schema';
import {
	addPasskeyWrap,
	addWrap,
	deleteOtherPasswordWraps,
	deletePasskeyWithWrap,
	deleteWrap,
	getRecipientsForPartnership,
	getUnlockBundle,
	getUserRecipient,
	listWrapsForUser,
	putUserKeys
} from './keys';

let harness: TestDb;
let ada: TestUser;
let jun: TestUser;

const passwordWrap = (blob = FAKE_WRAP_BLOB) =>
	({ type: 'password', params: PASSWORD_WRAP_PARAMS, blob }) as const;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	jun = await createTestUser(harness.db, { name: 'Jun' });
});

afterEach(() => harness.close());

describe('putUserKeys', () => {
	it('writes the recipient and its first wrap together', async () => {
		await putUserKeys(harness.db, ada.id, { recipient: ADA_RECIPIENT, wrap: passwordWrap() });

		await expect(getUserRecipient(harness.db, ada.id)).resolves.toBe(ADA_RECIPIENT);
		await expect(readWrapRows(harness.db, ada.id)).resolves.toHaveLength(1);
	});

	it('round-trips the JSON params rather than stringifying them', async () => {
		await putUserKeys(harness.db, ada.id, { recipient: ADA_RECIPIENT, wrap: passwordWrap() });
		const [wrap] = await listWrapsForUser(harness.db, ada.id);
		expect(wrap.params).toEqual(PASSWORD_WRAP_PARAMS);
	});

	/**
	 * Overwriting a recipient is how message history gets lost, so it has to go
	 * through `replaceUserKeys`, which says so in its name. The unique
	 * constraint is what makes that a rule rather than a convention.
	 */
	it('refuses a second set of keys for the same user', async () => {
		await putUserKeys(harness.db, ada.id, { recipient: ADA_RECIPIENT, wrap: passwordWrap() });
		await expect(
			putUserKeys(harness.db, ada.id, { recipient: JUN_RECIPIENT, wrap: passwordWrap() })
		).rejects.toThrow();
	});

	it('refuses keys for a user that does not exist', async () => {
		await expect(
			putUserKeys(harness.db, 'nobody', { recipient: ADA_RECIPIENT, wrap: passwordWrap() })
		).rejects.toThrow();
	});
});

describe('getUserRecipient', () => {
	it('is null for an account with no keys, which is broken data', async () => {
		await expect(getUserRecipient(harness.db, ada.id)).resolves.toBeNull();
	});
});

describe('listWrapsForUser', () => {
	it('never returns another user’s wraps', async () => {
		await createTestUserKeys(harness.db, ada);
		await createTestUserKeys(harness.db, jun);

		const adaWraps = await listWrapsForUser(harness.db, ada.id);
		const junWraps = await listWrapsForUser(harness.db, jun.id);
		expect(adaWraps).toHaveLength(1);
		expect(junWraps).toHaveLength(1);
		expect(adaWraps[0].id).not.toBe(junWraps[0].id);
	});

	it('is empty for a user with no keys', async () => {
		await expect(listWrapsForUser(harness.db, ada.id)).resolves.toEqual([]);
	});
});

describe('getUnlockBundle', () => {
	/**
	 * Every account is created with keys, so an account without them is broken
	 * data, and the endpoint turns this null into an error rather than a state.
	 */
	it('is null for an account with no keys', async () => {
		await expect(getUnlockBundle(harness.db, ada.id)).resolves.toBeNull();
	});

	/**
	 * The state a malicious server could manufacture by deleting the wraps. The
	 * dangerous response would be to generate a fresh identity, which would
	 * permanently orphan every message the user had received — so the bundle
	 * still reports the key it has, with no way in.
	 */
	it('still reports the recipient when every wrap is gone', async () => {
		await createTestUserKeys(harness.db, ada, { recipient: ADA_RECIPIENT });
		const [wrap] = await listWrapsForUser(harness.db, ada.id);
		await deleteWrap(harness.db, wrap.id, ada.id);

		await expect(getUnlockBundle(harness.db, ada.id)).resolves.toEqual({
			recipient: ADA_RECIPIENT,
			wraps: []
		});
	});
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
		createdAt: new Date()
	});
}

const passkeyWrap = (credentialId: string) =>
	({
		type: 'passkey-prf',
		params: { type: 'passkey-prf', version: 1, credentialId, rpId: 'bound-up.test' },
		blob: FAKE_WRAP_BLOB
	}) as const;

describe('addPasskeyWrap', () => {
	it('stores the wrap for the user’s own passkey', async () => {
		await createTestUserKeys(harness.db, ada);
		await givePasskey(ada.id, 'pk-ada');

		await expect(
			addPasskeyWrap(harness.db, ada.id, { passkeyId: 'pk-ada', wrap: passkeyWrap('cred-pk-ada') })
		).resolves.toBe(true);
		const types = (await readWrapRows(harness.db, ada.id))
			.map((wrap) => wrap.type)
			.sort((a, b) => a.localeCompare(b));
		expect(types).toEqual(['passkey-prf', 'password']);
	});

	it('refuses someone else’s passkey', async () => {
		await givePasskey(jun.id, 'pk-jun');
		await expect(
			addPasskeyWrap(harness.db, ada.id, { passkeyId: 'pk-jun', wrap: passkeyWrap('cred-pk-jun') })
		).resolves.toBe(false);
		await expect(readWrapRows(harness.db, ada.id)).resolves.toHaveLength(0);
	});

	/**
	 * Sign-in matches a wrap to its passkey by credential id, and so does
	 * deletion. A wrap naming another credential could never be opened or
	 * cleaned up.
	 */
	it('refuses a wrap that names a different credential', async () => {
		await givePasskey(ada.id, 'pk-ada');
		await expect(
			addPasskeyWrap(harness.db, ada.id, { passkeyId: 'pk-ada', wrap: passkeyWrap('cred-other') })
		).resolves.toBe(false);
	});

	it('refuses a password wrap', async () => {
		await givePasskey(ada.id, 'pk-ada');
		await expect(
			addPasskeyWrap(harness.db, ada.id, { passkeyId: 'pk-ada', wrap: passwordWrap() })
		).resolves.toBe(false);
	});
});

describe('deletePasskeyWithWrap', () => {
	it('removes the passkey and its wrap, and nothing else', async () => {
		await createTestUserKeys(harness.db, ada);
		await givePasskey(ada.id, 'pk-one');
		await givePasskey(ada.id, 'pk-two');
		await addPasskeyWrap(harness.db, ada.id, {
			passkeyId: 'pk-one',
			wrap: passkeyWrap('cred-pk-one')
		});
		await addPasskeyWrap(harness.db, ada.id, {
			passkeyId: 'pk-two',
			wrap: passkeyWrap('cred-pk-two')
		});

		await expect(deletePasskeyWithWrap(harness.db, ada.id, 'pk-one')).resolves.toBe(true);

		const wraps = await listWrapsForUser(harness.db, ada.id);
		expect(wraps.map((wrap) => wrap.type).sort((a, b) => a.localeCompare(b))).toEqual([
			'passkey-prf',
			'password'
		]);
		expect(
			wraps.some(
				(wrap) => wrap.params.type !== 'password' && wrap.params.credentialId === 'cred-pk-one'
			)
		).toBe(false);
		const passkeys = await harness.db.select().from(passkey).where(eq(passkey.userId, ada.id));
		expect(passkeys.map((row) => row.id)).toEqual(['pk-two']);
	});

	it('refuses someone else’s passkey', async () => {
		await givePasskey(jun.id, 'pk-jun');
		await expect(deletePasskeyWithWrap(harness.db, ada.id, 'pk-jun')).resolves.toBe(false);
		await expect(
			harness.db.select().from(passkey).where(eq(passkey.id, 'pk-jun'))
		).resolves.toHaveLength(1);
	});
});

describe('addWrap + deleteOtherPasswordWraps', () => {
	/**
	 * The password-change sequence, and the reason the table has no unique index
	 * on (user_id, type): the new wrap is inserted before the credential
	 * changes, so both exist briefly and exactly one opens under whichever
	 * password is current.
	 */
	it('leaves exactly the surviving wrap', async () => {
		await createTestUserKeys(harness.db, ada);
		const newId = await addWrap(harness.db, ada.id, passwordWrap('bmV3LXdyYXA'));
		expect(await readWrapRows(harness.db, ada.id)).toHaveLength(2);

		await deleteOtherPasswordWraps(harness.db, ada.id, newId);
		const remaining = await readWrapRows(harness.db, ada.id);
		expect(remaining).toHaveLength(1);
		expect(remaining[0].id).toBe(newId);
		expect(remaining[0].blob).toBe('bmV3LXdyYXA');
	});

	it('keeps non-password wraps, so a passkey survives a password change', async () => {
		await createTestUserKeys(harness.db, ada);
		await addWrap(harness.db, ada.id, { ...passkeyWrap('cred-ada'), label: 'iPhone passkey' });
		const newId = await addWrap(harness.db, ada.id, passwordWrap('bmV3'));

		await deleteOtherPasswordWraps(harness.db, ada.id, newId);
		const types = (await readWrapRows(harness.db, ada.id)).map((w) => w.type).sort();
		expect(types).toEqual(['passkey-prf', 'password']);
	});

	it('does not touch another user’s wraps', async () => {
		await createTestUserKeys(harness.db, ada);
		await createTestUserKeys(harness.db, jun);
		const adaNew = await addWrap(harness.db, ada.id, passwordWrap('bmV3'));

		await deleteOtherPasswordWraps(harness.db, ada.id, adaNew);
		expect(await readWrapRows(harness.db, jun.id)).toHaveLength(1);
	});
});

describe('deleteWrap', () => {
	it('removes only the owner’s wrap', async () => {
		await createTestUserKeys(harness.db, ada);
		const [wrap] = await listWrapsForUser(harness.db, ada.id);

		await expect(deleteWrap(harness.db, wrap.id, jun.id)).resolves.toBe(false);
		expect(await readWrapRows(harness.db, ada.id)).toHaveLength(1);

		await expect(deleteWrap(harness.db, wrap.id, ada.id)).resolves.toBe(true);
		expect(await readWrapRows(harness.db, ada.id)).toHaveLength(0);
	});
});

describe('getRecipientsForPartnership', () => {
	it('resolves mine/theirs from each side of the same row', async () => {
		const adaKeys = await createTestUserKeys(harness.db, ada);
		const junKeys = await createTestUserKeys(harness.db, jun);
		const partnership = await createTestPartnership(harness.db, ada, jun);

		await expect(getRecipientsForPartnership(harness.db, partnership.id, ada.id)).resolves.toEqual({
			mine: adaKeys.recipient,
			theirs: junKeys.recipient
		});

		// The per-viewer flip, which is the same trap as the name columns.
		await expect(getRecipientsForPartnership(harness.db, partnership.id, jun.id)).resolves.toEqual({
			mine: junKeys.recipient,
			theirs: adaKeys.recipient
		});
	});

	/**
	 * Every account has keys, so a partnership missing one is broken data, and
	 * reads as "no such partner" rather than a board that cannot send.
	 */
	it('is null when either key is missing', async () => {
		await createTestUserKeys(harness.db, ada);
		const partnership = await createTestPartnership(harness.db, ada, jun);

		await expect(
			getRecipientsForPartnership(harness.db, partnership.id, ada.id)
		).resolves.toBeNull();
	});

	it('is null for someone who is not in the partnership', async () => {
		await createTestUserKeys(harness.db, ada);
		const partnership = await createTestPartnership(harness.db, ada, jun);
		const stranger = await createTestUser(harness.db);

		await expect(
			getRecipientsForPartnership(harness.db, partnership.id, stranger.id)
		).resolves.toBeNull();
	});

	// There is nobody to encrypt to yet, and no second person to compare a
	// safety number with.
	it('is null for a pending invite', async () => {
		const { createTestInvite } = await import('../testing/fixtures');
		const invite = await createTestInvite(harness.db, ada);
		await expect(getRecipientsForPartnership(harness.db, invite.id, ada.id)).resolves.toBeNull();
	});

	it('is null for an id that does not exist', async () => {
		await expect(getRecipientsForPartnership(harness.db, 'nope', ada.id)).resolves.toBeNull();
	});
});
