import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromBase64Url, toBase64Url, USER_HANDLE_SECRET_PREFIX } from '../encryption';

/**
 * The two ceremonies, with the browser and Better Auth stubbed at their edges.
 *
 * What is worth pinning here is what leaves the page. Both ceremonies handle a
 * secret — the PRF output and the user handle — and the whole guarantee of the
 * handle wrap is that the server never sees it. So these assert on the bodies
 * posted to Better Auth, and on which wrap a new passkey ends up with.
 */

const authFetch = vi.fn();
const deletePasskey = vi.fn().mockResolvedValue({ data: null, error: null });
vi.mock('../auth-client', () => ({
	// biome-ignore lint/style/useNamingConvention: `$fetch` is Better Auth's own name for it.
	authClient: { $fetch: authFetch, passkey: { deletePasskey, updatePasskey: vi.fn() } }
}));

const startRegistration = vi.fn();
const startAuthentication = vi.fn();
vi.mock('@simplewebauthn/browser', () => ({ startRegistration, startAuthentication }));

const { registerPasskey, signInWithPasskey } = await import('./passkey-ceremony');

const prfBytes = new Uint8Array(32).fill(7);
const credentialId = toBase64Url(new Uint8Array(16).fill(3));

/** Routes each Better Auth path to a canned answer, and records the bodies. */
function betterAuth() {
	authFetch.mockImplementation((path: string) => {
		if (path === '/passkey/generate-register-options') {
			return Promise.resolve({
				data: {
					challenge: 'c',
					rp: { id: 'bound-up.test', name: 'Bound Up' },
					user: { id: toBase64Url(new TextEncoder().encode('betterauthgeneratedid')), name: 'ada' },
					pubKeyCredParams: [],
					extensions: { prf: {} }
				},
				error: null
			});
		}
		if (path === '/passkey/verify-registration') {
			return Promise.resolve({ data: { id: 'pk-1', aaguid: null }, error: null });
		}
		if (path === '/passkey/generate-authenticate-options') {
			return Promise.resolve({ data: { challenge: 'c', allowCredentials: [] }, error: null });
		}
		if (path === '/passkey/verify-authentication') {
			return Promise.resolve({ data: { session: {} }, error: null });
		}
		return Promise.reject(new Error(`unexpected ${path}`));
	});
}

function postedBody(path: string): unknown {
	const call = authFetch.mock.calls.find(([called]) => called === path);
	return (call?.[1] as { body?: unknown } | undefined)?.body;
}

let stored: { passkeyId: string; wrap: { params: string; blob: string } } | null;
let storeOk: boolean;
let credentialsGet: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.clearAllMocks();
	betterAuth();
	stored = null;
	storeOk = true;
	vi.stubGlobal(
		'fetch',
		vi.fn((_url: string, init: RequestInit) => {
			stored = JSON.parse(String(init.body));
			return Promise.resolve(new Response(null, { status: storeOk ? 200 : 500 }));
		})
	);
	vi.stubGlobal('location', { hostname: 'bound-up.test' });
	credentialsGet = vi.fn().mockResolvedValue(null);
	vi.stubGlobal('navigator', { credentials: { get: credentialsGet } });
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function registration(clientExtensionResults: AuthenticationExtensionsClientOutputs) {
	startRegistration.mockResolvedValue({
		id: credentialId,
		rawId: credentialId,
		type: 'public-key',
		response: {},
		clientExtensionResults
	});
}

describe('registerPasskey', () => {
	const identity = 'AGE-SECRET-KEY-1EXAMPLE';
	const recipient = 'age1recipient';

	it('replaces the server-generated user handle with one carrying a fresh secret', async () => {
		registration({ prf: { results: { first: prfBytes.buffer } } });
		await registerPasskey({ identity, recipient });

		const { optionsJSON } = startRegistration.mock.calls[0][0];
		const handle = fromBase64Url(optionsJSON.user.id);
		expect(handle).toHaveLength(33);
		expect(handle[0]).toBe(USER_HANDLE_SECRET_PREFIX);
		expect(optionsJSON.extensions.prf.eval.first).toHaveLength(32);
	});

	it('posts the registration without its extension results', async () => {
		registration({ prf: { results: { first: prfBytes.buffer } } });
		await registerPasskey({ identity, recipient });

		expect(postedBody('/passkey/verify-registration')).toEqual({
			response: { id: credentialId, rawId: credentialId, type: 'public-key', response: {} }
		});
	});

	it('uses PRF from creation when the provider returned it', async () => {
		registration({ prf: { results: { first: prfBytes.buffer } } });
		const made = await registerPasskey({ identity, recipient });

		expect(made.wrapType).toBe('passkey-prf');
		expect(credentialsGet).not.toHaveBeenCalled();
		expect(JSON.parse(stored?.wrap.params ?? '{}')).toMatchObject({
			type: 'passkey-prf',
			credentialId,
			rpId: 'bound-up.test'
		});
	});

	it('asks once more for PRF when creation could not answer it', async () => {
		registration({ prf: { enabled: true } });
		credentialsGet.mockResolvedValue({
			getClientExtensionResults: () => ({ prf: { results: { first: prfBytes.buffer } } })
		});
		const made = await registerPasskey({ identity, recipient });

		expect(credentialsGet).toHaveBeenCalledTimes(1);
		expect(made.wrapType).toBe('passkey-prf');
	});

	/** Every passkey unlocks: one whose provider has no PRF gets a handle wrap. */
	it('falls back to the user handle when the provider will not do PRF', async () => {
		registration({});
		credentialsGet.mockResolvedValue({ getClientExtensionResults: () => ({}) });
		const made = await registerPasskey({ identity, recipient });

		expect(made.wrapType).toBe('passkey-handle');
		expect(JSON.parse(stored?.wrap.params ?? '{}')).toMatchObject({ type: 'passkey-handle' });
	});

	it('falls back to the user handle when the extra prompt is dismissed', async () => {
		registration({});
		credentialsGet.mockRejectedValue(new DOMException('no', 'NotAllowedError'));
		const made = await registerPasskey({ identity, recipient });
		expect(made.wrapType).toBe('passkey-handle');
	});

	/**
	 * A passkey without a wrap would sign in and open nothing, and the device
	 * would be sent round the sign-in-again loop for good.
	 */
	it('deletes the passkey again if its wrap could not be stored', async () => {
		registration({ prf: { results: { first: prfBytes.buffer } } });
		storeOk = false;

		await expect(registerPasskey({ identity, recipient })).rejects.toThrow();
		expect(deletePasskey).toHaveBeenCalledWith({ id: 'pk-1' });
	});
});

describe('signInWithPasskey', () => {
	function assertion(
		userHandle: string | undefined,
		results: AuthenticationExtensionsClientOutputs
	) {
		startAuthentication.mockResolvedValue({
			id: credentialId,
			rawId: credentialId,
			type: 'public-key',
			response: { authenticatorData: 'a', clientDataJSON: 'b', signature: 's', userHandle },
			clientExtensionResults: results
		});
	}

	it('asks for PRF with the app-wide salt, autofill included', async () => {
		assertion(undefined, {});
		await signInWithPasskey({ autoFill: true });

		const { optionsJSON, useBrowserAutofill } = startAuthentication.mock.calls[0][0];
		expect(useBrowserAutofill).toBe(true);
		expect(optionsJSON.extensions.prf.eval.first).toHaveLength(32);
	});

	/** The heart of the handle wrap's guarantee. */
	it('never posts the user handle or the PRF output to the server', async () => {
		const handle = new Uint8Array(33).fill(9);
		handle[0] = USER_HANDLE_SECRET_PREFIX;
		assertion(toBase64Url(handle), { prf: { results: { first: prfBytes.buffer } } });
		await signInWithPasskey();

		const body = JSON.stringify(postedBody('/passkey/verify-authentication'));
		expect(body).not.toContain('userHandle');
		expect(body).not.toContain(toBase64Url(handle));
		expect(body).not.toContain('clientExtensionResults');
		expect(body).toContain('"signature":"s"');
	});

	it('hands back both secrets for the gate to open the wrap with', async () => {
		const handle = new Uint8Array(33).fill(9);
		handle[0] = USER_HANDLE_SECRET_PREFIX;
		assertion(toBase64Url(handle), { prf: { results: { first: prfBytes.buffer } } });

		await expect(signInWithPasskey()).resolves.toEqual({
			credentialId,
			prf: prfBytes,
			handle: handle.slice(1)
		});
	});

	it('reports no handle secret for a handle this app did not make', async () => {
		assertion(toBase64Url(new TextEncoder().encode('betterauthgeneratedid')), {});
		await expect(signInWithPasskey()).resolves.toMatchObject({ prf: null, handle: null });
	});
});
