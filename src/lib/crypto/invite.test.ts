import { describe, expect, it } from 'vitest';
import { toBase64, toBase64Url } from '../encryption';
import { ADA_IDENTITY, ADA_RECIPIENT, JUN_IDENTITY, JUN_RECIPIENT } from '../testing/crypto';
import { loadAge } from './identity';
import { generateInviteKey, unwrapInviteKey, wrapInviteKey } from './invite';
import { wrapVaultKey } from './vault';

const PARTNERSHIP = '00000000-0000-4000-8000-000000000001';
const ada = { identity: ADA_IDENTITY, recipient: ADA_RECIPIENT };

/** A wrap as a server could make one: any payload, encrypted to a public recipient. */
async function forgedWrap(payload: object, recipient: string): Promise<string> {
	const age = await loadAge();
	const encrypter = new age.Encrypter();
	encrypter.addRecipient(recipient);
	return toBase64(await encrypter.encrypt(new TextEncoder().encode(JSON.stringify(payload))));
}

describe('the invite key’s wrap', () => {
	it('opens for the inviter who made it', async () => {
		const key = generateInviteKey();
		const wrap = await wrapInviteKey(PARTNERSHIP, key, ada);
		expect(await unwrapInviteKey(PARTNERSHIP, wrap, ada)).toEqual(key);
		expect(
			await unwrapInviteKey(PARTNERSHIP, wrap, { identity: JUN_IDENTITY, recipient: JUN_RECIPIENT })
		).toBeNull();
	});

	/**
	 * The inviter's page builds the link from whatever this opens to, and seals
	 * edited names under it: a key the server chose would leak both.
	 */
	it('refuses a key the server made up and wrapped to the inviter', async () => {
		const forged = await forgedWrap(
			{
				v: 2,
				vaultId: `invite:${PARTNERSHIP}`,
				key: toBase64Url(generateInviteKey()),
				mac: toBase64Url(new Uint8Array(32))
			},
			ADA_RECIPIENT
		);
		expect(await unwrapInviteKey(PARTNERSHIP, forged, ada)).toBeNull();
	});

	it('refuses the wrap for another invite', async () => {
		const wrap = await wrapInviteKey(PARTNERSHIP, generateInviteKey(), ada);
		expect(await unwrapInviteKey('00000000-0000-4000-8000-0000000000ff', wrap, ada)).toBeNull();
	});

	it('still opens one from before the MAC, while those are accepted', async () => {
		const key = generateInviteKey();
		const wrap = await wrapVaultKey({
			vaultId: `invite:${PARTNERSHIP}`,
			raw: key,
			recipient: ADA_RECIPIENT
		});
		expect(await unwrapInviteKey(PARTNERSHIP, wrap, ada)).toEqual(key);
	});
});
