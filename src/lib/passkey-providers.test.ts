import { describe, expect, it } from 'vitest';
import { commonAuthenticatorNames, getAuthenticatorName } from '@better-auth/passkey';
import {
	lookupProviderName,
	providerForAaguid,
	PRF_PROVIDERS,
	type PasskeyProvider
} from './passkey-providers';

/**
 * The local AAGUID table is a copy, so the test that matters is the one that
 * fails when it drifts.
 *
 * Better Auth exports `commonAuthenticatorNames` from its server entry, which a
 * node-project test can import freely and a browser bundle cannot. Comparing
 * against it here is what lets `passkey-providers.ts` stay a plain object with
 * no dependency, and still be wrong loudly rather than quietly.
 */
describe('the AAGUID table', () => {
	it('agrees with @better-auth/passkey on every AAGUID it knows', () => {
		for (const [aaguid, name] of Object.entries(commonAuthenticatorNames)) {
			expect(lookupProviderName(aaguid), aaguid).toBe(name);
		}
	});

	it('knows no AAGUID upstream does not', () => {
		// The other direction, so a typo in a key here cannot hide as an extra
		// entry. If a provider genuinely needs adding before upstream has it,
		// this is the assertion to relax deliberately rather than by accident.
		for (const aaguid of Object.keys(commonAuthenticatorNames)) {
			expect(getAuthenticatorName(aaguid)).toBe(lookupProviderName(aaguid));
		}
	});

	it('is case- and whitespace-insensitive, like upstream', () => {
		expect(lookupProviderName('  BADA5566-A7AA-401F-BD96-45619A55120D  ')).toBe('1Password');
	});

	/**
	 * Apple zeroes the AAGUID under `attestation: "none"`, which is the flow
	 * this app uses — so the most common passkey in existence lands here. Every
	 * caller has to treat it as "no name", never as an error.
	 */
	it('reports nothing for the anonymous AAGUID', () => {
		expect(lookupProviderName('00000000-0000-0000-0000-000000000000')).toBeNull();
		expect(providerForAaguid('00000000-0000-0000-0000-000000000000')).toBeNull();
	});

	it('reports nothing for an absent or unknown AAGUID', () => {
		expect(lookupProviderName(null)).toBeNull();
		expect(lookupProviderName(undefined)).toBeNull();
		expect(lookupProviderName('')).toBeNull();
		expect(lookupProviderName('11111111-2222-3333-4444-555555555555')).toBeNull();
	});
});

describe('resolving a provider', () => {
	it('maps both Apple AAGUIDs onto the one row', () => {
		const passwords = providerForAaguid('fbfc3007-154e-4ecc-8c0b-6e020557d7bd');
		const managed = providerForAaguid('dd4ec289-e01d-41c9-bb89-70fa845d4bf2');
		expect(passwords?.name).toBe('Apple Passwords (iCloud Keychain)');
		expect(managed).toEqual(passwords);
		expect(passwords?.prf).toBe('full');
	});

	it('carries the PRF verdict for a surveyed provider', () => {
		expect(providerForAaguid('531126d6-e717-415c-9320-3d9aa6981239')).toMatchObject({
			name: 'Dashlane',
			prf: 'none'
		});
		expect(providerForAaguid('d548826e-79b4-db40-a3d8-11116f7e8349')?.prf).toBe('partial');
	});

	/**
	 * LastPass is in the AAGUID list and not in the survey. Claiming `full` or
	 * `none` for it would be inventing a fact; `partial` promises nothing.
	 */
	it('falls back to partial for a named but unsurveyed provider', () => {
		expect(providerForAaguid('b78a0a55-6ef8-d246-a042-ba0f6d55050c')).toEqual({
			name: 'LastPass',
			prf: 'partial'
		});
	});
});

describe('the provider survey', () => {
	it('lists the best options first', () => {
		const rank: Record<PasskeyProvider['prf'], number> = { full: 0, partial: 1, none: 2 };
		const ranks = PRF_PROVIDERS.map((provider) => rank[provider.prf]);
		expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
	});

	it('explains every provider that is not a straight yes', () => {
		// A bare "partial" or "none" is worse than nothing: it tells someone
		// their manager is a problem without telling them what happens or what
		// to do. NordPass is the one exception — it simply does not implement
		// the extension, and there is nothing further to say.
		for (const provider of PRF_PROVIDERS) {
			if (provider.prf === 'full' || provider.name === 'NordPass') continue;
			expect(provider.note, provider.name).toBeTruthy();
		}
	});

	it('names each provider once', () => {
		const names = PRF_PROVIDERS.map((provider) => provider.name);
		expect(new Set(names).size).toBe(names.length);
	});
});
