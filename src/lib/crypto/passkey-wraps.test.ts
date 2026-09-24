import { describe, expect, it } from 'vitest';
import { toBase64Url, USER_HANDLE_SECRET_PREFIX } from '../encryption';
import {
	newUserHandle,
	openPasskeyWrap,
	parseHandleSecret,
	passkeyPrfSalt,
	passkeyWrapKey,
	prfOutputBytes,
	wrapIdentityToPasskey
} from './passkey-wraps';
import { unwrapIdentity } from './wrap';

/**
 * The frozen vectors are the tests that matter most here, for the same reason
 * as the one in `kdf.test.ts`: every passkey's wrap was made with this salt,
 * these HKDF `info` strings and this envelope. If any of them moved, nothing
 * would fail locally — every existing passkey would just stop opening anything,
 * on every device, at the next sign-in. They were produced by an independent
 * implementation (plain Node WebCrypto, not this module) and must never be
 * regenerated to make a failure go away.
 */
const FROZEN_IDENTITY =
	'AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQFAKE';
const FROZEN_RECIPIENT = 'age1frozenvectorrecipient';
const counting = (from: number) => new Uint8Array(32).map((_, i) => i + from);

describe('frozen vectors', () => {
	it('evaluates PRF with SHA-256 of the versioned salt string', async () => {
		const salt = await passkeyPrfSalt();
		expect(Buffer.from(salt).toString('hex')).toBe(
			'dc62592c3d09966e269dc2d27ee4d6a46fdf914176ef921ee0c3d565642e96d8'
		);
	});

	it('opens a passkey-prf wrap made from a known PRF output', async () => {
		const blob =
			'AAcOFRwjKjE4P0ZNmKfdX5x_YElhv0p_JJUfo1qZ5LLTWiTyF3FOFGzV0eFUgep47l8M-l2UuwBPI8Dymo1bfd6-Nnc42SFRA0ev28DFcRf0VGG1aL-gvrHHiFg_syVvrUI9ecPK';
		const wrapKey = await passkeyWrapKey('passkey-prf', counting(1));
		await expect(unwrapIdentity({ wrapKey, blob, recipient: FROZEN_RECIPIENT })).resolves.toBe(
			FROZEN_IDENTITY
		);
	});

	it('opens a passkey-handle wrap made from a known handle secret', async () => {
		const blob =
			'AAcOFRwjKjE4P0ZNFMRdo8hOOubxc6ldcl6TuaSq6Zp60l-sc6E9eLWxmmCUkWaurk42AWmArTKhNd_xXIsIMMdxAMhgp3xUE6r-gWEjHssF9KJzpUDaAubGfIchPaPLkjkA1hPE';
		const wrapKey = await passkeyWrapKey('passkey-handle', counting(101));
		await expect(unwrapIdentity({ wrapKey, blob, recipient: FROZEN_RECIPIENT })).resolves.toBe(
			FROZEN_IDENTITY
		);
	});

	/** Distinct `info` strings, so one secret can never open the other kind. */
	it('keeps the two kinds apart even for the same secret', async () => {
		const secret = counting(1);
		const { blob } = await wrapIdentityToPasskey({
			type: 'passkey-prf',
			secret,
			identity: FROZEN_IDENTITY,
			recipient: FROZEN_RECIPIENT,
			credentialId: 'cred',
			rpId: 'bound-up.test'
		});
		const wrongKind = await passkeyWrapKey('passkey-handle', secret);
		await expect(
			unwrapIdentity({ wrapKey: wrongKind, blob, recipient: FROZEN_RECIPIENT })
		).resolves.toBeNull();
	});
});

describe('the user handle', () => {
	it('is the prefix byte and 32 random bytes', () => {
		const handle = newUserHandle();
		expect(handle).toHaveLength(33);
		expect(handle[0]).toBe(USER_HANDLE_SECRET_PREFIX);
		expect(toBase64Url(newUserHandle())).not.toBe(toBase64Url(handle));
	});

	it('gives back the secret from what an assertion reports', () => {
		const handle = newUserHandle();
		expect(parseHandleSecret(toBase64Url(handle))).toEqual(handle.slice(1));
	});

	/**
	 * Better Auth generates its own handle — 32 lowercase letters and digits —
	 * and sends it through the server. It must never be mistaken for a secret.
	 */
	it('refuses a handle Better Auth generated', () => {
		const generated = new TextEncoder().encode('abcdefghijklmnopqrstuvwxyz012345');
		expect(parseHandleSecret(toBase64Url(generated))).toBeNull();
	});

	it('refuses anything of the wrong length or prefix', () => {
		expect(parseHandleSecret(null)).toBeNull();
		expect(parseHandleSecret('')).toBeNull();
		expect(parseHandleSecret('not base64url!')).toBeNull();
		const short = new Uint8Array(20);
		short[0] = USER_HANDLE_SECRET_PREFIX;
		expect(parseHandleSecret(toBase64Url(short))).toBeNull();
		const wrongPrefix = newUserHandle();
		wrongPrefix[0] = 0x02;
		expect(parseHandleSecret(toBase64Url(wrongPrefix))).toBeNull();
	});
});

describe('PRF output shapes', () => {
	it('takes an ArrayBuffer, a typed array or base64url alike', () => {
		const bytes = counting(5);
		expect(prfOutputBytes(bytes.buffer)).toEqual(bytes);
		expect(prfOutputBytes(bytes)).toEqual(bytes);
		expect(prfOutputBytes(toBase64Url(bytes))).toEqual(bytes);
	});

	it('reports nothing for anything else', () => {
		expect(prfOutputBytes(undefined)).toBeNull();
		expect(prfOutputBytes({})).toBeNull();
		expect(prfOutputBytes('not base64url!')).toBeNull();
	});
});

describe('openPasskeyWrap', () => {
	const recipient = 'age1recipient';
	const identity = 'AGE-SECRET-KEY-1EXAMPLE';

	async function wrapFor(
		type: 'passkey-prf' | 'passkey-handle',
		credentialId: string,
		from: number
	) {
		const made = await wrapIdentityToPasskey({
			type,
			secret: counting(from),
			identity,
			recipient,
			credentialId,
			rpId: 'bound-up.test'
		});
		return { id: `wrap-${credentialId}`, ...made };
	}

	it('opens the wrap of the credential that signed in, with the matching secret', async () => {
		const wraps = [await wrapFor('passkey-prf', 'a', 1), await wrapFor('passkey-handle', 'b', 50)];
		await expect(
			openPasskeyWrap({
				secrets: { credentialId: 'b', prf: null, handle: counting(50) },
				recipient,
				wraps
			})
		).resolves.toEqual({ identity, wrapId: 'wrap-b' });
		await expect(
			openPasskeyWrap({
				secrets: { credentialId: 'a', prf: counting(1), handle: null },
				recipient,
				wraps
			})
		).resolves.toEqual({ identity, wrapId: 'wrap-a' });
	});

	/**
	 * Matched by credential, never by trying every wrap: a secret from one
	 * passkey must not be tried against another's.
	 */
	it('opens nothing for a credential with no wrap', async () => {
		const wraps = [await wrapFor('passkey-prf', 'a', 1)];
		await expect(
			openPasskeyWrap({
				secrets: { credentialId: 'other', prf: counting(1), handle: null },
				recipient,
				wraps
			})
		).resolves.toBeNull();
	});

	it('opens nothing when the secret its wrap needs did not come back', async () => {
		const wraps = [await wrapFor('passkey-prf', 'a', 1)];
		await expect(
			openPasskeyWrap({
				secrets: { credentialId: 'a', prf: null, handle: counting(1) },
				recipient,
				wraps
			})
		).resolves.toBeNull();
	});
});
