/**
 * Registering a passkey and sealing the message identity to it, in one go.
 *
 * BROWSER ONLY — see the note at the top of `kdf.ts`.
 *
 * The sequence lives here rather than in `AddPasskeyFlow.svelte` because its
 * ordering is load-bearing and worth testing without a DOM:
 *
 * 1. The password is proved **before** anything is registered, so a typo does
 *    not leave a stray passkey behind.
 * 2. The identity is opened locally, because sealing needs it as a string and
 *    a cached `CryptoKey` can never be turned back into one.
 * 3. Only then is the credential created, and only then sealed.
 *
 * The component keeps the dialogs, the copy and the error rendering.
 */

import { authClient } from '../auth-client';
import { fromBase64Url } from '../encryption';
import type { PasskeyPrfStatusValue } from '../encryption';
import {
	currentRpId,
	describePasskeyFailure,
	encodeAgeCredentialIdentity,
	wrapIdentityToPasskey,
	type PasskeyFailure
} from './passkey';

/** What the registration ceremony told us about the credential it made. */
export type PasskeyRegistration = {
	/** Better Auth's row id, which is what the Security page lists. */
	passkeyId: string;
	/** age's handle for this exact credential, so the seal cannot wander. */
	ageIdentity: string;
	/** Null when the platform reported the anonymous AAGUID, as Apple does. */
	aaguid: string | null;
	/**
	 * `prf.enabled` from the registration response.
	 *
	 * A hint and never a verdict. Samsung Pass and KeePassXC answer `false`
	 * here and then return PRF output perfectly well at assertion, and
	 * Microsoft Password Manager does the reverse — so this only decides
	 * whether the UI warns before trying, never whether to try. See
	 * docs/passkeys.md.
	 */
	prfEnabled: boolean;
};

export type SealResult =
	/** The credential really did produce PRF output, and here is the wrap. */
	| { kind: 'sealed'; wrapParams: string; wrapBlob: string }
	/** It answered, and could not. This is the verdict the warning is about. */
	| { kind: 'no-prf'; failure: PasskeyFailure }
	/**
	 * The ceremony was dismissed, or failed for some reason that says nothing
	 * about PRF. Deliberately distinct from `no-prf`: recording "unsupported"
	 * because someone cancelled a Face ID sheet would put a permanent warning
	 * on a perfectly good passkey.
	 */
	| { kind: 'failed'; failure: PasskeyFailure };

/**
 * Registers a passkey through Better Auth and reads what it can do.
 *
 * `returnWebAuthnResponse` is the whole reason this is not a one-liner at the
 * call site: without it the client discards `clientExtensionResults`, and
 * `prf.enabled` with it. The PRF extension itself is requested server-side, in
 * `PRF_REGISTRATION_EXTENSIONS`, on every passkey this app creates.
 *
 * The name is deliberately left unset. It is chosen afterwards, in a dialog
 * pre-filled from the AAGUID this call returns — which cannot be known any
 * earlier, because the AAGUID only exists in a registration response.
 */
export async function registerPasskey(): Promise<PasskeyRegistration> {
	const result = await authClient.passkey.addPasskey({ returnWebAuthnResponse: true });
	if (result?.error) {
		throw new Error(result.error.message ?? 'Could not add that passkey');
	}

	const row = result?.data as { id?: string; aaguid?: string | null } | null | undefined;
	const webauthn = (
		result as {
			webauthn?: {
				response?: { id?: string; response?: { transports?: string[] } };
				clientExtensionResults?: { prf?: { enabled?: boolean } };
			};
		}
	)?.webauthn;

	const passkeyId = row?.id;
	const credentialId = webauthn?.response?.id;
	if (!passkeyId || !credentialId) {
		// Better Auth returned a shape this code does not understand, which is
		// worth failing loudly on rather than silently registering a passkey
		// nothing can ever seal to.
		throw new Error('That passkey was registered but could not be read back');
	}

	return {
		passkeyId,
		ageIdentity: encodeAgeCredentialIdentity({
			credentialId: fromBase64Url(credentialId),
			rpId: currentRpId(),
			transports: webauthn?.response?.response?.transports ?? []
		}),
		aaguid: row?.aaguid ?? null,
		prfEnabled: webauthn?.clientExtensionResults?.prf?.enabled === true
	};
}

/**
 * Seals the identity to a credential that was just registered.
 *
 * Runs a real PRF evaluation, which is the only honest way to answer "can this
 * passkey unlock messages". Bound to the new credential via `ageIdentity`, so
 * the user is not shown a chooser seconds after creating the very passkey this
 * is about, and so the verdict is unambiguously about that credential.
 *
 * Never throws: every outcome is something the dialog has to say, and the
 * difference between "your password manager cannot do this" and "you dismissed
 * the prompt" is the whole reason `SealResult` has three members.
 */
export async function sealToPasskey(input: {
	identity: string;
	registration: PasskeyRegistration;
}): Promise<SealResult> {
	const rpId = currentRpId();
	try {
		const wrapBlob = await wrapIdentityToPasskey({
			identity: input.identity,
			rpId,
			ageIdentity: input.registration.ageIdentity
		});
		return {
			kind: 'sealed',
			wrapBlob,
			wrapParams: JSON.stringify({
				type: 'webauthn-prf',
				version: 1,
				rpId,
				passkeyId: input.registration.passkeyId,
				ageIdentity: input.registration.ageIdentity
			})
		};
	} catch (error) {
		const failure = describePasskeyFailure(error);
		return { kind: failure.kind === 'no-prf' ? 'no-prf' : 'failed', failure };
	}
}

/**
 * The verdict to record, or null when this attempt proved nothing.
 *
 * `failed` returns null on purpose. A dismissed sheet, a timeout and a dropped
 * connection all land there, and none of them is evidence about the
 * credential — writing `unsupported` for any of them would brand a working
 * passkey with a warning it could not shake off.
 *
 * When there is no identity to seal (an account with no message keys yet), the
 * registration flag is all there is. It is trusted only in the negative
 * direction it is reliable in reverse — a provider claiming `enabled` may still
 * fail at assertion, so `true` is recorded as nothing rather than as a promise.
 */
export function verdictFor(input: {
	seal: SealResult | null;
	prfEnabled: boolean;
}): PasskeyPrfStatusValue | null {
	if (input.seal) {
		if (input.seal.kind === 'sealed') return 'supported';
		return input.seal.kind === 'no-prf' ? 'unsupported' : null;
	}
	return input.prfEnabled ? null : 'unsupported';
}

// ── server round trips ───────────────────────────────────────────────────────

/**
 * Asks the server whether the password really is this account's.
 *
 * Runs *before* the registration ceremony, so a mistyped password does not
 * leave a passkey behind that the user did not mean to create. The browser has
 * usually already opened the stored wrap with it by this point — but that is a
 * check on the device, and a permission is enforced on the server (invariant
 * 14).
 */
export async function verifyPasswordWithServer(authSecret: string): Promise<boolean> {
	const response = await fetch('/api/keys/verify-password', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ authSecret })
	});
	if (response.status === 403) return false;
	if (!response.ok) throw new Error(`Could not check your password (${response.status})`);
	return true;
}

/**
 * Records what the enrolment established, and stores the wrap if there is one.
 *
 * Throws on failure, and the caller says so rather than swallowing it: unlike
 * `noteWrapUsed`, a lost write here means the user believes they have passkey
 * unlock and does not.
 */
export async function recordEnrolment(input: {
	passkeyId: string;
	prfStatus?: PasskeyPrfStatusValue;
	wrap?: { params: string; blob: string; label?: string };
}): Promise<void> {
	const response = await fetch('/api/keys/passkey-enrolled', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});
	if (!response.ok) throw new Error(`Could not save that passkey (${response.status})`);
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
	if (result?.error) throw new Error(result.error.message ?? 'Could not rename that passkey');
}
