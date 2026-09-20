import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateAgeIdentity } from './identity';
import {
	describePasskeyFailure,
	unwrapIdentityWithPasskey,
	wrapIdentityToPasskey
} from './passkey';

/**
 * The passkey wrap, against a fake authenticator.
 *
 * The point is not to test age's WebAuthn support — that is upstream's job —
 * but to prove the two ends meet: that what `wrapIdentityToPasskey` produces
 * fits the `blob` column's shape, and that the same credential opens it again.
 * So the ceremony is stubbed at the one place a browser would do something
 * physical, and everything above it is the real code path.
 */

const encoder = new TextEncoder();
const rpId = 'bound-up.test';

/**
 * A credential that computes its PRF the way a real one does: deterministically
 * from its own secret and the salt it is handed, and not knowable without it.
 */
function install(secret: string) {
	const get = vi.fn(async (options: CredentialRequestOptions) => {
		const evaluated = options.publicKey?.extensions?.prf?.eval;
		if (!evaluated) throw new Error('the ceremony asked for no PRF');
		return {
			getClientExtensionResults: () => ({
				prf: {
					results: {
						first: prf(secret, evaluated.first),
						second: evaluated.second ? prf(secret, evaluated.second) : undefined
					}
				}
			})
		};
	});
	vi.stubGlobal('navigator', { credentials: { get } });
	return get;
}

function prf(secret: string, salt: BufferSource): Uint8Array {
	const bytes = ArrayBuffer.isView(salt)
		? new Uint8Array(salt.buffer, salt.byteOffset, salt.byteLength)
		: new Uint8Array(salt);
	const key = encoder.encode(secret);
	// Not a real PRF, and it does not need to be: it only has to be a stable
	// function of (secret, salt) that a different secret does not reproduce.
	const out = new Uint8Array(32);
	for (let i = 0; i < 32; i++) {
		out[i] = (key[i % key.length] ^ bytes[i % bytes.length] ^ (i * 31)) & 0xff;
	}
	return out;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('wrapIdentityToPasskey', () => {
	it('round-trips the identity through the same credential', async () => {
		const { identity } = await generateAgeIdentity();
		install('credential-one');

		const blob = await wrapIdentityToPasskey({ identity, rpId });
		await expect(unwrapIdentityWithPasskey({ blob, rpId })).resolves.toBe(identity);
	});

	it('produces a blob the wrap column will accept', async () => {
		const { identity } = await generateAgeIdentity();
		install('credential-one');

		const blob = await wrapIdentityToPasskey({ identity, rpId });
		// The same check `wrapBlobField` makes, which is what the action runs.
		expect(blob).toMatch(/^[A-Za-z0-9_-]{40,1024}$/);
		expect(blob).not.toContain(identity);
	});

	it('asks for user verification, which is what PRF requires', async () => {
		const { identity } = await generateAgeIdentity();
		const get = install('credential-one');

		await wrapIdentityToPasskey({ identity, rpId });

		const options = get.mock.calls[0][0].publicKey!;
		expect(options.userVerification).toBe('required');
		expect(options.rpId).toBe(rpId);
		// Empty, so the platform offers the user whichever passkey they like
		// rather than this app naming one it cannot know they still have.
		expect(options.allowCredentials).toEqual([]);
	});

	it('uses a fresh nonce, so two wraps of one identity differ', async () => {
		const { identity } = await generateAgeIdentity();
		install('credential-one');

		const first = await wrapIdentityToPasskey({ identity, rpId });
		const second = await wrapIdentityToPasskey({ identity, rpId });
		expect(first).not.toBe(second);
	});

	it('will not open under a different credential', async () => {
		const { identity } = await generateAgeIdentity();
		install('credential-one');
		const blob = await wrapIdentityToPasskey({ identity, rpId });

		install('credential-two');
		await expect(unwrapIdentityWithPasskey({ blob, rpId })).rejects.toThrow();
	});
});

describe('describePasskeyFailure', () => {
	it('treats a dismissed sheet as nothing worth saying', () => {
		// WebAuthn reports a cancel, a timeout and an absent credential
		// identically on purpose, so a page cannot learn which it was.
		const failure = describePasskeyFailure(
			new DOMException('The operation either timed out or was not allowed', 'NotAllowedError')
		);
		expect(failure).toEqual({ cancelled: true, message: '' });
	});

	it('keeps age’s own message for a passkey that cannot do PRF', () => {
		const failure = describePasskeyFailure(
			new Error('PRF extension not available (need macOS 15+, Chrome 132+)')
		);
		expect(failure.cancelled).toBe(false);
		expect(failure.message).toContain('PRF extension not available');
	});

	it('survives something that is not an Error at all', () => {
		expect(describePasskeyFailure('gone wrong')).toEqual({
			cancelled: false,
			message: 'gone wrong'
		});
	});
});
