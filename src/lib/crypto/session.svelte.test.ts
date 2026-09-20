import { describe, expect, it } from 'vitest';
import { passkeyWrapFor, type Keyring } from './session.svelte';
import type { KeyWrapView } from '../types';

/**
 * Which passkey the unlock screen offers.
 *
 * Worth its own tests because the cost of getting it wrong is paid in
 * biometric prompts: offering the wrong wrap asks the user to authenticate to
 * discover it was the wrong one.
 */

const day = (n: number) => new Date(`2026-09-${String(n).padStart(2, '0')}T00:00:00Z`);

function wrap(over: Partial<KeyWrapView> & { id: string }): KeyWrapView {
	return {
		type: 'webauthn-prf',
		params: { type: 'webauthn-prf', version: 1, rpId: 'bound-up.test' },
		blob: 'x'.repeat(40),
		label: null,
		lastUsedAt: null,
		createdAt: day(1),
		...over
	};
}

function locked(wraps: KeyWrapView[]): Keyring {
	return { status: 'locked', recipient: 'age1mine', wraps, reason: 'cold', tier: 'crypto-key' };
}

describe('passkeyWrapFor', () => {
	it('offers nothing when the keyring is not locked', () => {
		expect(passkeyWrapFor({ status: 'unknown' })).toBeNull();
		expect(passkeyWrapFor({ status: 'absent' })).toBeNull();
	});

	it('offers nothing when the account has only a password', () => {
		const password = wrap({
			id: 'pw',
			type: 'password',
			params: { type: 'password', kdf: 'PBKDF2-SHA256', version: 1, iterations: 650_000 }
		});
		expect(passkeyWrapFor(locked([password]))).toBeNull();
	});

	it('picks the passkey used most recently', () => {
		const stale = wrap({ id: 'stale', createdAt: day(1), lastUsedAt: day(2) });
		const fresh = wrap({ id: 'fresh', createdAt: day(1), lastUsedAt: day(9) });
		expect(passkeyWrapFor(locked([stale, fresh]))?.id).toBe('fresh');
		// Order in the list must not decide it.
		expect(passkeyWrapFor(locked([fresh, stale]))?.id).toBe('fresh');
	});

	it('falls back to when it was added, for one never used', () => {
		const older = wrap({ id: 'older', createdAt: day(1) });
		const newer = wrap({ id: 'newer', createdAt: day(5) });
		expect(passkeyWrapFor(locked([older, newer]))?.id).toBe('newer');
	});

	it('ignores password wraps when choosing', () => {
		const password = wrap({
			id: 'pw',
			type: 'password',
			params: { type: 'password', kdf: 'PBKDF2-SHA256', version: 1, iterations: 650_000 },
			lastUsedAt: day(30)
		});
		const passkey = wrap({ id: 'passkey', lastUsedAt: day(2) });
		expect(passkeyWrapFor(locked([password, passkey]))?.id).toBe('passkey');
	});
});
