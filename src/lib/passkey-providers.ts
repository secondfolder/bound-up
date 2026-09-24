/**
 * Which passkey provider a credential came from, for its label.
 *
 * Pure and alias-free, like `encryption.ts` and `partnership.ts`: the Security
 * page's `load` resolves a name on the server, and the add-a-passkey dialog
 * does the same in the browser, so this file is in both graphs and must not
 * reach for `$lib`, `$env` or anything with a runtime.
 *
 * The AAGUID identifies an authenticator *model* and arrives only in the
 * registration response. It used to feed a survey of which providers could do
 * PRF, too; that went when every passkey became able to unlock (a provider
 * without PRF gets a user-handle wrap instead — see docs/passkeys.md), leaving
 * nothing for the survey to warn about.
 */

export type PasskeyProvider = {
	/** Verbatim from the community AAGUID list, so names match other apps. */
	name: string;
};

/**
 * AAGUID to provider, for the ones this app can name.
 *
 * Mirrors `commonAuthenticatorNames` in `@better-auth/passkey`, which in turn
 * mirrors `passkeydeveloper/passkey-authenticator-aaguids`. It is duplicated
 * rather than imported because Better Auth exports `getAuthenticatorName` from
 * its **server** entry, and pulling that whole plugin into the browser bundle
 * to read a fourteen-entry object would be a poor trade. `passkey-providers.test.ts`
 * imports the upstream map and asserts the two agree, so the copy cannot drift
 * silently.
 *
 * Names are verbatim from upstream; `lookupProviderName` returns them as-is and
 * `providerForAaguid` tidies the two Apple spellings into one.
 */
const AAGUID_NAMES: Readonly<Record<string, string>> = {
	'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Password Manager',
	'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'Apple Passwords',
	'dd4ec289-e01d-41c9-bb89-70fa845d4bf2': 'iCloud Keychain (Managed)',
	'08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
	'9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'Windows Hello',
	'6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'Windows Hello',
	'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
	'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
	'531126d6-e717-415c-9320-3d9aa6981239': 'Dashlane',
	'b78a0a55-6ef8-d246-a042-ba0f6d55050c': 'LastPass',
	'b84e4048-15dc-4dd0-8640-f4f60813c8af': 'NordPass',
	'50726f74-6f6e-5061-7373-50726f746f6e': 'Proton Pass',
	'0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6': 'Keeper',
	'53414d53-554e-4700-0000-000000000000': 'Samsung Pass'
};

/**
 * What a privacy-preserving platform reports instead of identifying itself.
 *
 * Apple zeroes the AAGUID under the default `attestation: "none"`, which is the
 * flow this app uses — so an iCloud Keychain passkey, the single most common
 * kind, resolves to nothing here. That is expected, and every caller has to
 * have an answer for `null` rather than treating it as an error. Asking for
 * attestation to get a real value would put a consent prompt in front of every
 * registration to improve a default label, which is not a trade worth making.
 */
const ANONYMOUS_AAGUID = '00000000-0000-0000-0000-000000000000';

/** The provider's name, or null when the AAGUID is absent, zeroed or unknown. */
export function lookupProviderName(aaguid: string | null | undefined): string | null {
	const normalised = aaguid?.trim().toLowerCase();
	if (!normalised || normalised === ANONYMOUS_AAGUID) {
		return null;
	}
	return AAGUID_NAMES[normalised] ?? null;
}

/**
 * Upstream's two Apple spellings, shown as one.
 *
 * An explicit map rather than a fuzzy match on the name: the two entries differ
 * only in a parenthetical, and a prefix or substring rule that got them right
 * today would go wrong the first time upstream renamed anything.
 */
const PROVIDER_ALIASES: Readonly<Record<string, string>> = {
	'Apple Passwords': 'Apple Passwords (iCloud Keychain)',
	'iCloud Keychain (Managed)': 'Apple Passwords (iCloud Keychain)'
};

/** The provider to label a passkey with, or null when the AAGUID says nothing. */
export function providerForAaguid(aaguid: string | null | undefined): PasskeyProvider | null {
	const name = lookupProviderName(aaguid);
	if (!name) {
		return null;
	}
	return { name: PROVIDER_ALIASES[name] ?? name };
}
