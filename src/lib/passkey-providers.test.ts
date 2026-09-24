import { commonAuthenticatorNames, getAuthenticatorName } from '@better-auth/passkey';
import { describe, expect, it } from 'vitest';
import { lookupProviderName, providerForAaguid } from './passkey-providers';

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
	it('shows both Apple AAGUIDs under one name', () => {
		const passwords = providerForAaguid('fbfc3007-154e-4ecc-8c0b-6e020557d7bd');
		const managed = providerForAaguid('dd4ec289-e01d-41c9-bb89-70fa845d4bf2');
		expect(passwords).toEqual({ name: 'Apple Passwords (iCloud Keychain)' });
		expect(managed).toEqual(passwords);
	});

	it('uses the upstream name for everyone else', () => {
		expect(providerForAaguid('531126d6-e717-415c-9320-3d9aa6981239')).toEqual({ name: 'Dashlane' });
		expect(providerForAaguid('b78a0a55-6ef8-d246-a042-ba0f6d55050c')).toEqual({ name: 'LastPass' });
	});
});
