/**
 * The two passkey ceremonies, run so that each one also yields a key.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * Better Auth's own `passkey.addPasskey` / `signIn.passkey` are not used,
 * because both post the assertion as the browser produced it — and here the
 * assertion carries secrets:
 *
 * - the **PRF output**, in `clientExtensionResults` (Better Auth's client
 *   strips that too, but only because it has no use for it), and
 * - the **user handle**, which this app fills with a secret at registration.
 *   Better Auth's client would post it straight to the server.
 *
 * So these call the same endpoints through `authClient.$fetch`, with the same
 * `@simplewebauthn/browser` helpers Better Auth uses, and remove both before
 * anything leaves the page. The server never needed either: it verifies the
 * signature against the stored public key and looks the passkey up by its
 * credential id (checked against `@better-auth/passkey` 1.7.5).
 *
 * The payoff is that **signing in with a passkey is unlocking**: the one
 * ceremony that proves who you are also hands back the secret that opens your
 * wrap, with no second prompt. See docs/passkeys.md.
 */

import {
	type AuthenticationResponseJSON,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	type RegistrationResponseJSON,
	startAuthentication,
	startRegistration
} from '@simplewebauthn/browser';
import { authClient } from '../auth-client';
import { fromBase64Url, type PasskeyWrapType, toBase64Url } from '../encryption';
import { currentRpId } from './passkey';
import {
	newUserHandle,
	type PasskeySecrets,
	parseHandleSecret,
	passkeyPrfSalt,
	prfOutputBytes,
	wrapIdentityToPasskey
} from './passkey-wraps';

type FetchResult<T> = { data: T | null; error: { message?: string; status?: number } | null };

async function authFetch<T>(
	path: string,
	init: { method: 'GET' | 'POST'; body?: unknown }
): Promise<T> {
	const result = (await authClient.$fetch(path, { ...init, throw: false })) as FetchResult<T>;
	if (result.error || !result.data) {
		throw new Error(result.error?.message ?? 'That did not work — try again');
	}
	return result.data;
}

/** The PRF request both ceremonies make. */
async function prfExtension(): Promise<AuthenticationExtensionsClientInputs> {
	return { prf: { eval: { first: await passkeyPrfSalt() } } };
}

function prfFrom(results: AuthenticationExtensionsClientOutputs | undefined) {
	return prfOutputBytes(results?.prf?.results?.first);
}

// ── registering ──────────────────────────────────────────────────────────────

/** What registering a passkey produced, for the name dialog. */
export type RegisteredPasskey = {
	/** Better Auth's row id, which is what the Security page lists and renames. */
	passkeyId: string;
	/** Null when the platform reported the anonymous AAGUID, as Apple does. */
	aaguid: string | null;
	/** Which wrap it got — `passkey-prf` unless its provider would not do PRF. */
	wrapType: PasskeyWrapType;
};

/**
 * Evaluates PRF on a credential that has just been created.
 *
 * Needed only when `create()` did not return PRF output itself, which many
 * platforms cannot yet do at creation. A local ceremony with a random
 * challenge: nothing is verified on the server, the point is only the PRF
 * result — and it is a real evaluation through the same assertion path that
 * signing in uses, which is the only honest test (invariant 10).
 *
 * Returns null rather than throwing, for any failure: a dismissed prompt and a
 * provider without PRF both end in the handle wrap, which always works.
 */
async function evaluatePrf(credentialId: string): Promise<Uint8Array<ArrayBuffer> | null> {
	try {
		const credential = (await navigator.credentials.get({
			publicKey: {
				challenge: crypto.getRandomValues(new Uint8Array(32)),
				rpId: currentRpId(),
				allowCredentials: [{ type: 'public-key', id: fromBase64Url(credentialId) }],
				userVerification: 'preferred',
				extensions: await prfExtension()
			}
		})) as PublicKeyCredential | null;
		return prfFrom(credential?.getClientExtensionResults());
	} catch (error) {
		console.warn('PRF evaluation after registration did not complete', error);
		return null;
	}
}

/**
 * Registers a passkey and seals the identity to it, as one act.
 *
 * The order is what makes the invariant — **no passkey exists without a
 * wrap** — hold:
 *
 * 1. Fetch options, and replace `user.id` with a fresh secret handle.
 * 2. Create the credential, asking for PRF.
 * 3. Verify it with the server, minus the extension results.
 * 4. Pick the secret: PRF from `create()`, else PRF from one assertion, else
 *    the handle.
 * 5. Store the wrap. If that fails, delete the passkey again, so the user is
 *    never left with one that signs in but cannot open anything.
 *
 * `identity` is the `AGE-SECRET-KEY-1…` string, which the caller has just
 * opened with the password — the only way to it on a device that caches a
 * non-extractable `CryptoKey`.
 */
export async function registerPasskey(input: {
	identity: string;
	recipient: string;
	/** Shown while waiting, so the dialog can say which step it is on. */
	onStep?: (step: 'creating' | 'checking' | 'saving') => void;
}): Promise<RegisteredPasskey> {
	const options = await authFetch<PublicKeyCredentialCreationOptionsJSON>(
		'/passkey/generate-register-options',
		{ method: 'GET' }
	);
	const handle = newUserHandle();

	input.onStep?.('creating');
	const response: RegistrationResponseJSON = await startRegistration({
		optionsJSON: {
			...options,
			user: { ...options.user, id: toBase64Url(handle) },
			extensions: { ...options.extensions, ...(await prfExtension()) }
		}
	});
	const { clientExtensionResults, ...withoutExtensions } = response;

	const row = await authFetch<{ id: string; aaguid?: string | null }>(
		'/passkey/verify-registration',
		{ method: 'POST', body: { response: withoutExtensions } }
	);

	try {
		let prf = prfFrom(clientExtensionResults);
		if (!prf) {
			input.onStep?.('checking');
			prf = await evaluatePrf(response.id);
		}

		input.onStep?.('saving');
		const wrapType: PasskeyWrapType = prf ? 'passkey-prf' : 'passkey-handle';
		const wrap = await wrapIdentityToPasskey({
			type: wrapType,
			secret: prf ?? handle.slice(1),
			identity: input.identity,
			recipient: input.recipient,
			credentialId: response.id,
			rpId: currentRpId()
		});
		await storePasskeyWrap({ passkeyId: row.id, params: wrap.params, blob: wrap.blob });
		return { passkeyId: row.id, aaguid: row.aaguid ?? null, wrapType };
	} catch (error) {
		// A passkey without a wrap would sign in and then have nothing to open,
		// which sends the user round the sign-in-again loop for good. Undo it.
		await authClient.passkey.deletePasskey({ id: row.id }).catch(() => undefined);
		throw error;
	}
}

async function storePasskeyWrap(input: {
	passkeyId: string;
	params: unknown;
	blob: string;
}): Promise<void> {
	const response = await fetch('/api/keys/passkey-enrolled', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			passkeyId: input.passkeyId,
			wrap: { params: JSON.stringify(input.params), blob: input.blob }
		})
	});
	if (!response.ok) {
		throw new Error(`Could not save that passkey (${response.status})`);
	}
}

/**
 * Renames a passkey after the fact.
 *
 * Which is the only time it can be named from its AAGUID: the AAGUID exists
 * only in a registration response, so the name dialog cannot be shown until
 * the credential is already made. A failure here is cosmetic — the passkey
 * works, it just keeps a duller label — so the caller reports it and moves on.
 */
export async function renamePasskey(id: string, name: string): Promise<void> {
	const result = await authClient.passkey.updatePasskey({ id, name });
	if (result?.error) {
		throw new Error(result.error.message ?? 'Could not rename that passkey');
	}
}

// ── signing in ───────────────────────────────────────────────────────────────

/**
 * Signs in with a passkey, and keeps what it needs to open the identity.
 *
 * `autoFill` is passkey autofill (conditional mediation) from the email field:
 * it resolves only if the user picks a passkey there, and the PRF request
 * rides along with it, so even that path unlocks. It requires an empty
 * `allowCredentials`, which is why the PRF salt is app-wide.
 *
 * The secrets are returned to the caller — the login form stashes them for
 * `initialiseKeyring` — and are removed from the body posted to the server.
 */
export async function signInWithPasskey(
	input: { autoFill?: boolean } = {}
): Promise<PasskeySecrets> {
	const options = await authFetch<PublicKeyCredentialRequestOptionsJSON>(
		'/passkey/generate-authenticate-options',
		{ method: 'GET' }
	);

	const response: AuthenticationResponseJSON = await startAuthentication({
		optionsJSON: { ...options, extensions: { ...options.extensions, ...(await prfExtension()) } },
		useBrowserAutofill: input.autoFill ?? false
	});

	const { clientExtensionResults, ...withoutExtensions } = response;
	const { userHandle, ...assertion } = withoutExtensions.response;
	await authFetch('/passkey/verify-authentication', {
		method: 'POST',
		body: { response: { ...withoutExtensions, response: assertion } }
	});

	return {
		credentialId: response.id,
		prf: prfFrom(clientExtensionResults),
		handle: parseHandleSecret(userHandle)
	};
}
