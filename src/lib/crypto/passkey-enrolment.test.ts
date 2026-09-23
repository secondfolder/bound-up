import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defined } from '$lib/testing/defined';

/**
 * Registering a passkey, and deciding what it proved.
 *
 * The ordering this covers is the point of the module: the password is proved
 * before anything is registered, and the PRF verdict comes from a real
 * evaluation rather than from the flag the registration response carries. The
 * flag and the evaluation disagree in both directions in the field — see
 * docs/passkeys.md — so a test that only checked the flag would be testing the
 * bug.
 */

const addPasskey = vi.fn();
const updatePasskey = vi.fn();

vi.mock('../auth-client', () => ({
	authClient: { passkey: { addPasskey, updatePasskey } }
}));

const {
	recordEnrolment,
	registerPasskey,
	renamePasskey,
	sealToPasskey,
	verdictFor,
	verifyPasswordWithServer
} = await import('./passkey-enrolment');
const { encodeAgeCredentialIdentity } = await import('./passkey');

/** base64url of the 16 bytes 1..16, which is what a credential id looks like. */
const CREDENTIAL_ID = 'AQIDBAUGBwgJCgsMDQ4PEA';
const CREDENTIAL_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

function registrationResponse(overrides: Record<string, unknown> = {}) {
	return {
		data: { id: 'pk-1', aaguid: 'bada5566-a7aa-401f-bd96-45619a55120d' },
		webauthn: {
			response: { id: CREDENTIAL_ID, response: { transports: ['internal', 'hybrid'] } },
			clientExtensionResults: { prf: { enabled: true } }
		},
		...overrides
	};
}

beforeEach(() => {
	vi.stubGlobal('location', { hostname: 'bound-up.test' });
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe('registerPasskey', () => {
	it('reads back the id, the AAGUID and the PRF flag', async () => {
		addPasskey.mockResolvedValue(registrationResponse());

		await expect(registerPasskey()).resolves.toMatchObject({
			passkeyId: 'pk-1',
			aaguid: 'bada5566-a7aa-401f-bd96-45619a55120d',
			prfEnabled: true
		});
	});

	/**
	 * Without `returnWebAuthnResponse` Better Auth's client discards
	 * `clientExtensionResults`, and `prf.enabled` with it — so this flag is the
	 * whole reason the call is not a one-liner at the call site.
	 */
	it('asks for the WebAuthn response, without which there is no PRF flag', async () => {
		addPasskey.mockResolvedValue(registrationResponse());
		await registerPasskey();
		expect(addPasskey).toHaveBeenCalledWith({ returnWebAuthnResponse: true });
	});

	/** The name is chosen afterwards, from an AAGUID that does not exist yet. */
	it('registers with no name at all', async () => {
		addPasskey.mockResolvedValue(registrationResponse());
		await registerPasskey();
		expect(addPasskey.mock.calls[0][0]).not.toHaveProperty('name');
	});

	it('binds an age identity to exactly that credential', async () => {
		addPasskey.mockResolvedValue(registrationResponse());

		const registration = await registerPasskey();
		expect(registration.ageIdentity).toBe(
			encodeAgeCredentialIdentity({
				credentialId: CREDENTIAL_BYTES,
				rpId: 'bound-up.test',
				transports: ['internal', 'hybrid']
			})
		);
	});

	it('copes with an authenticator that reports no transports', async () => {
		addPasskey.mockResolvedValue(
			registrationResponse({
				webauthn: {
					response: { id: CREDENTIAL_ID, response: {} },
					clientExtensionResults: {}
				}
			})
		);

		const registration = await registerPasskey();
		expect(registration.prfEnabled).toBe(false);
		expect(registration.ageIdentity).toBe(
			encodeAgeCredentialIdentity({
				credentialId: CREDENTIAL_BYTES,
				rpId: 'bound-up.test',
				transports: []
			})
		);
	});

	/** Apple zeroes it under the default attestation, which is not an error. */
	it('reports a missing AAGUID as null rather than failing', async () => {
		addPasskey.mockResolvedValue(registrationResponse({ data: { id: 'pk-1' } }));
		await expect(registerPasskey()).resolves.toMatchObject({ aaguid: null });
	});

	it('surfaces a refused registration', async () => {
		addPasskey.mockResolvedValue({ error: { message: 'Registration cancelled' } });
		await expect(registerPasskey()).rejects.toThrow('Registration cancelled');
	});

	/**
	 * A passkey that exists but cannot be read back is worse than none: nothing
	 * could ever seal to it, and nothing would say so.
	 */
	it('fails loudly on a response it cannot read', async () => {
		addPasskey.mockResolvedValue(registrationResponse({ data: {} }));
		await expect(registerPasskey()).rejects.toThrow(/could not be read back/);
	});
});

describe('verdictFor', () => {
	const registration = { prfEnabled: true };

	it('records supported only when a seal actually worked', () => {
		expect(
			verdictFor({
				seal: { kind: 'sealed', wrapParams: '{}', wrapBlob: 'x' },
				...registration
			})
		).toBe('supported');
	});

	it('records unsupported when the credential answered without PRF', () => {
		expect(
			verdictFor({
				seal: { kind: 'no-prf', failure: { kind: 'no-prf', message: 'no' } },
				...registration
			})
		).toBe('unsupported');
	});

	/**
	 * The distinction that stops a dismissed Face ID sheet branding a working
	 * passkey with a warning it could never shake off.
	 */
	it('records nothing when the attempt proved nothing', () => {
		expect(
			verdictFor({
				seal: { kind: 'failed', failure: { kind: 'no-assertion', message: 'cancelled' } },
				...registration
			})
		).toBeNull();
	});

	describe('with no identity to seal', () => {
		it('trusts a negative flag, because there is nothing else to go on', () => {
			expect(verdictFor({ seal: null, prfEnabled: false })).toBe('unsupported');
		});

		/**
		 * And does not trust a positive one. A provider claiming `enabled` can
		 * still fail at assertion — Microsoft Password Manager does — so this
		 * stays "not checked" rather than becoming a promise.
		 */
		it('makes no promise from a positive flag', () => {
			expect(verdictFor({ seal: null, prfEnabled: true })).toBeNull();
		});
	});
});

describe('sealToPasskey', () => {
	// A real one, not a placeholder: age parses `identity` to pin
	// `allowCredentials`, so an unparseable string fails the ceremony for the
	// wrong reason and the test would pass against a broken encoder.
	const registration = {
		passkeyId: 'pk-1',
		ageIdentity: encodeAgeCredentialIdentity({
			credentialId: CREDENTIAL_BYTES,
			rpId: 'bound-up.test',
			transports: ['internal']
		}),
		aaguid: null,
		prfEnabled: true
	};

	/**
	 * A fake authenticator, the same shape as the one in `passkey.test.ts`: a
	 * stable function of (secret, salt) that a different secret cannot reproduce.
	 */
	function install(options: { prf: boolean }) {
		vi.stubGlobal('navigator', {
			credentials: {
				get: vi.fn(async (request: CredentialRequestOptions) => ({
					getClientExtensionResults: () =>
						options.prf
							? {
									prf: {
										results: {
											first: saltedBytes(request, 'first'),
											second: saltedBytes(request, 'second')
										}
									}
								}
							: {}
				}))
			}
		});
	}

	function saltedBytes(request: CredentialRequestOptions, which: 'first' | 'second'): Uint8Array {
		const salt = defined(
			request.publicKey?.extensions?.prf?.eval?.[which],
			`the ${which} PRF salt`
		) as Uint8Array;
		return new Uint8Array(32).map((_, index) => (salt[index % salt.length] ^ index) & 0xff);
	}

	it('produces a wrap that names the credential it was sealed to', async () => {
		install({ prf: true });

		const result = await sealToPasskey({ identity: 'AGE-SECRET-KEY-1TEST', registration });
		expect(result.kind).toBe('sealed');
		if (result.kind !== 'sealed') {
			return;
		}
		expect(JSON.parse(result.wrapParams)).toEqual({
			type: 'webauthn-prf',
			version: 1,
			rpId: 'bound-up.test',
			passkeyId: 'pk-1',
			ageIdentity: registration.ageIdentity
		});
	});

	it('reports a provider that returned no PRF output as exactly that', async () => {
		install({ prf: false });

		const result = await sealToPasskey({ identity: 'AGE-SECRET-KEY-1TEST', registration });
		expect(result.kind).toBe('no-prf');
	});

	/** A dismissal is not evidence about the credential. See `verdictFor`. */
	it('keeps a dismissal separate from a PRF failure', async () => {
		vi.stubGlobal('navigator', {
			credentials: {
				get: vi.fn(() => Promise.reject(new DOMException('not allowed', 'NotAllowedError')))
			}
		});

		const result = await sealToPasskey({ identity: 'AGE-SECRET-KEY-1TEST', registration });
		expect(result.kind).toBe('failed');
	});
});

describe('the server round trips', () => {
	it('treats a 403 as a wrong password rather than an error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 403 }))
		);
		await expect(verifyPasswordWithServer('x'.repeat(43))).resolves.toBe(false);
	});

	it('throws on anything else, which is not a wrong password', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 500 }))
		);
		await expect(verifyPasswordWithServer('x'.repeat(43))).rejects.toThrow(/500/);
	});

	/**
	 * Unlike `noteWrapUsed`, a lost write here means the user believes they have
	 * passkey unlock and does not — so it must not be swallowed.
	 */
	it('refuses to report a failed enrolment write as success', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 409 }))
		);
		await expect(recordEnrolment({ passkeyId: 'pk-1' })).rejects.toThrow(/409/);
	});

	it('posts the verdict and the wrap together', async () => {
		const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await recordEnrolment({
			passkeyId: 'pk-1',
			prfStatus: 'supported',
			wrap: { params: '{}', blob: 'blob', label: '1Password' }
		});

		expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
			passkeyId: 'pk-1',
			prfStatus: 'supported',
			wrap: { params: '{}', blob: 'blob', label: '1Password' }
		});
	});

	it('surfaces a rename that did not take', async () => {
		updatePasskey.mockResolvedValue({ error: { message: 'nope' } });
		await expect(renamePasskey('pk-1', 'Laptop')).rejects.toThrow('nope');
	});
});
