import { describe, expect, it } from 'vitest';
import { unlockMode, type UnlockModeInput } from './passkey-unlock';

function input(overrides: Partial<UnlockModeInput> = {}): UnlockModeInput {
	return {
		hasPasskeyWrap: false,
		passkeyCount: 0,
		passkeysKnownUnusable: 0,
		passkeysAvailable: true,
		...overrides
	};
}

describe('unlockMode', () => {
	it('offers the passkey whenever a wrap exists', () => {
		expect(unlockMode(input({ hasPasskeyWrap: true }))).toBe('passkey-ready');
	});

	/**
	 * A working wrap outranks a failed verdict on some *other* passkey. Someone
	 * with a 1Password passkey that works and a Dashlane one that does not still
	 * gets the button.
	 */
	it('offers the passkey even when another one is known to be useless', () => {
		expect(
			unlockMode(input({ hasPasskeyWrap: true, passkeyCount: 2, passkeysKnownUnusable: 1 }))
		).toBe('passkey-ready');
	});

	it('explains itself when every registered passkey has failed', () => {
		expect(unlockMode(input({ passkeyCount: 2, passkeysKnownUnusable: 2 }))).toBe(
			'passkeys-unusable'
		);
	});

	/**
	 * The distinction the mode exists for. A passkey registered before this
	 * check existed has no verdict, and might work perfectly well — so it gets
	 * the offer to try, not a message saying it cannot.
	 */
	it('offers setup when some passkey has never been tried', () => {
		expect(unlockMode(input({ passkeyCount: 2, passkeysKnownUnusable: 1 }))).toBe('offer-setup');
		expect(unlockMode(input({ passkeyCount: 1, passkeysKnownUnusable: 0 }))).toBe('offer-setup');
	});

	it('offers setup when there is no passkey at all', () => {
		expect(unlockMode(input())).toBe('offer-setup');
	});

	/** Zero passkeys cannot be "all of them have failed", whatever the counts say. */
	it('does not report an empty account as unusable', () => {
		expect(unlockMode(input({ passkeyCount: 0, passkeysKnownUnusable: 3 }))).toBe('offer-setup');
	});

	it('falls back to the password when the browser has no WebAuthn', () => {
		expect(unlockMode(input({ passkeysAvailable: false, hasPasskeyWrap: true }))).toBe(
			'password-only'
		);
		expect(
			unlockMode(input({ passkeysAvailable: false, passkeyCount: 1, passkeysKnownUnusable: 1 }))
		).toBe('password-only');
	});
});
