import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateAgeIdentity, loadAge } from './identity';
import {
	describePasskeyFailure,
	encodeAgeCredentialIdentity,
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

	it('pins allowCredentials when given an age identity', async () => {
		const { identity } = await generateAgeIdentity();
		const get = install('credential-one');
		const credentialId = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);

		await wrapIdentityToPasskey({
			identity,
			rpId,
			ageIdentity: encodeAgeCredentialIdentity({
				credentialId,
				rpId,
				transports: ['internal']
			})
		});

		const options = get.mock.calls[0][0].publicKey!;
		expect(options.allowCredentials).toHaveLength(1);
		const allowed = options.allowCredentials![0];
		expect(new Uint8Array(allowed.id as ArrayBuffer)).toEqual(credentialId);
		expect(allowed.transports).toEqual(['internal']);
		// The rp id comes out of the identity string, not the argument.
		expect(options.rpId).toBe(rpId);
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
	it('still says something when nothing answered', () => {
		// The bug this replaced: WebAuthn reports a cancel, a timeout and an
		// absent credential identically on purpose, so treating the first as
		// "nothing to report" made the third look like a dead button.
		const failure = describePasskeyFailure(
			new DOMException('The operation either timed out or was not allowed', 'NotAllowedError')
		);
		expect(failure.kind).toBe('no-assertion');
		expect(failure.message).not.toBe('');
	});

	it('blames the authenticator, not the operating system, for a missing PRF', () => {
		const failure = describePasskeyFailure(
			new Error('PRF extension not available (need macOS 15+, Chrome 132+)')
		);
		expect(failure.kind).toBe('no-prf');
		// age's own text names macOS 15 and Chrome 132, which reads as nonsense
		// to someone already on macOS 15 whose password manager is the problem.
		expect(failure.message).not.toContain('macOS 15');
		expect(failure.message).toMatch(/passkey cannot unlock/i);
	});

	it('catches the half-answer too', () => {
		// age needs both PRF outputs; an authenticator returning one is just as
		// unusable, and says so differently.
		expect(describePasskeyFailure(new Error('Missing second PRF result')).kind).toBe('no-prf');
	});

	it('keeps a message nobody predicted, verbatim', () => {
		const failure = describePasskeyFailure(new Error('something else entirely'));
		expect(failure).toEqual({ kind: 'unknown', message: 'something else entirely' });
	});

	it('survives something that is not an Error at all', () => {
		expect(describePasskeyFailure('gone wrong')).toEqual({
			kind: 'unknown',
			message: 'gone wrong'
		});
	});
});

/**
 * The one piece of `age-encryption`'s private format this app reproduces.
 *
 * `createCredential()` builds these strings and exports neither the encoder nor
 * a usable way to get one for a credential Better Auth registered. So the
 * encoding is hand-rolled, and these are the tests that make that safe: a
 * frozen vector, and a round trip through age's own decoder. If a version bump
 * ever changes the format, this fails in CI rather than on a phone.
 */
describe('encodeAgeCredentialIdentity', () => {
	const credentialId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

	it('matches a frozen vector', () => {
		expect(
			encodeAgeCredentialIdentity({
				credentialId,
				rpId: 'example.com',
				transports: ['internal', 'hybrid']
			})
		).toBe(
			'AGE-PLUGIN-FIDO2PRF-1Q9GQZQSRQSZSVPCGPY9QKRQDPC83Q6M90PSK6URVV5HXXMMDSF5XJMN5V4EXUCTVVE58JCNJD9JQXV52FR'
		);
	});

	it('decodes back to the same three values, in age itself', async () => {
		const age = await loadAge();
		const encoded = encodeAgeCredentialIdentity({
			credentialId,
			rpId: 'example.com',
			transports: ['internal', 'hybrid']
		});

		// `credId`, `rpId` and `transports` are `private` in TypeScript only, so
		// reading them is how the decoder's output can be inspected at all —
		// age exports `decodeIdentity` no more than it exports the encoder.
		const decoded = new age.webauthn.WebAuthnIdentity({ identity: encoded }) as unknown as {
			credId: Uint8Array;
			rpId: string;
			transports: string[];
		};
		expect(new Uint8Array(decoded.credId)).toEqual(credentialId);
		expect(decoded.rpId).toBe('example.com');
		expect(decoded.transports).toEqual(['internal', 'hybrid']);
	});

	it('handles an empty transport list and a long credential id', async () => {
		const age = await loadAge();
		// Real credential ids run well past the 23-byte CBOR short form, which is
		// the boundary the length encoding gets wrong if it is written carelessly.
		const long = new Uint8Array(64).map((_, index) => (index * 7) & 0xff);
		const encoded = encodeAgeCredentialIdentity({
			credentialId: long,
			rpId: 'bound-up.test',
			transports: []
		});

		const decoded = new age.webauthn.WebAuthnIdentity({ identity: encoded }) as unknown as {
			credId: Uint8Array;
			transports: string[];
		};
		expect(new Uint8Array(decoded.credId)).toEqual(long);
		expect(decoded.transports).toEqual([]);
	});
});
