/**
 * Which passkey provider a credential came from, and whether it can do PRF.
 *
 * Pure and alias-free, like `encryption.ts` and `partnership.ts`: the Security
 * page's `load` resolves a name on the server, and the warning dialog renders
 * the table in the browser, so this file is in both graphs and must not reach
 * for `$lib`, `$env` or anything with a runtime.
 *
 * Two separate questions live here, and conflating them is the mistake this
 * file exists to prevent:
 *
 * 1. **Who made this credential?** Answered by the AAGUID, which identifies an
 *    authenticator *model* and arrives only in the registration response.
 * 2. **Can that provider return PRF output to this site?** Answered by
 *    `PRF_PROVIDERS`, which is a hand-maintained survey and is **never** used
 *    to decide anything. The verdict for a real credential always comes from
 *    actually trying it — see `docs/passkeys.md`. This table is copy: it tells
 *    someone whose passkey just failed which manager to use instead.
 */

/**
 * How well a provider supports the WebAuthn PRF extension for third-party
 * sites, as surveyed in September 2026.
 *
 * `partial` is the interesting one and the reason nothing here is load-bearing:
 * several providers answer `prf.enabled: false` at credential *creation* and
 * then return PRF output perfectly well at assertion (Samsung Pass, KeePassXC),
 * and at least one does the reverse (Microsoft Password Manager). A flow that
 * trusted the creation-time flag would write off working authenticators.
 */
export type PrfSupport = 'full' | 'partial' | 'none';

export type PasskeyProvider = {
	/** Verbatim from the community AAGUID list, so names match other apps. */
	name: string;
	prf: PrfSupport;
	/** Shown beside `partial` and `none` rows. Says what actually breaks. */
	note?: string;
};

/**
 * The providers people actually ask about, worst-case-first within each group.
 *
 * Rendered as-is by the "this passkey cannot unlock your messages" dialog, so
 * the copy has exactly one source. Ordered `full` → `partial` → `none` because
 * someone reading it is choosing where to put their next passkey.
 */
export const PRF_PROVIDERS: readonly PasskeyProvider[] = [
	{ name: 'Apple Passwords (iCloud Keychain)', prf: 'full' },
	{ name: 'Google Password Manager', prf: 'full' },
	{
		name: 'Windows Hello',
		prf: 'full',
		note: 'Needs the February 2026 Windows 11 update and Chrome/Edge 147+ or Firefox 148+.'
	},
	{ name: '1Password', prf: 'full' },
	{ name: 'Proton Pass', prf: 'full' },
	{ name: 'Keeper', prf: 'full' },
	{ name: 'Enpass', prf: 'full' },
	{
		name: 'Bitwarden',
		prf: 'partial',
		note: 'Depends on the platform — works on Linux with Firefox, not on iOS or Safari.'
	},
	{
		name: 'KeePassXC',
		prf: 'partial',
		note: 'Usually refuses at the moment a passkey is created, then works afterwards.'
	},
	{
		name: 'Samsung Pass',
		prf: 'partial',
		note: 'Says no when the passkey is created, then works when it is used.'
	},
	{
		name: 'Microsoft Password Manager',
		prf: 'partial',
		note: 'Accepts the passkey, then refuses every time it is used to unlock.'
	},
	{
		name: 'Dashlane',
		prf: 'none',
		note: 'Uses this feature for its own vault, but does not offer it to other sites.'
	},
	{ name: 'NordPass', prf: 'none' }
];

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
 * Names are verbatim from upstream except where a `PRF_PROVIDERS` row already
 * says the same thing more usefully — `lookupProviderName` returns the upstream
 * spelling and `providerForAaguid` maps it onto a row.
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
	if (!normalised || normalised === ANONYMOUS_AAGUID) return null;
	return AAGUID_NAMES[normalised] ?? null;
}

/**
 * Upstream's spelling to the `PRF_PROVIDERS` row that describes it.
 *
 * An explicit map rather than a fuzzy match on the name: the two Apple entries
 * differ only in a parenthetical, and a prefix or substring rule that got them
 * right today would go wrong the first time upstream renamed anything.
 */
const PROVIDER_ALIASES: Readonly<Record<string, string>> = {
	'Apple Passwords': 'Apple Passwords (iCloud Keychain)',
	'iCloud Keychain (Managed)': 'Apple Passwords (iCloud Keychain)'
};

/**
 * The provider and its PRF standing, or null when the AAGUID says nothing.
 *
 * A name with no `PRF_PROVIDERS` row — LastPass today — comes back as
 * `prf: 'partial'` with no note. That is the honest answer rather than a
 * placeholder: an unsurveyed provider is precisely one whose behaviour is
 * unknown, and `partial` is the value that promises nothing either way.
 */
export function providerForAaguid(aaguid: string | null | undefined): PasskeyProvider | null {
	const name = lookupProviderName(aaguid);
	if (!name) return null;

	const rowName = PROVIDER_ALIASES[name] ?? name;
	return PRF_PROVIDERS.find((provider) => provider.name === rowName) ?? { name, prf: 'partial' };
}
