import { beforeAll, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';

/**
 * `UnlockPanel` refuses to offer a passkey button without WebAuthn, so it has
 * to be present for the modes to be told apart. Chromium has it, but it is
 * stubbed so no test can reach a real authenticator. Stubbed once rather than
 * per test, because it is a property of the environment and not of any case.
 */
beforeAll(() => {
	vi.stubGlobal('PublicKeyCredential', class {});
	Object.defineProperty(navigator, 'credentials', { value: {}, configurable: true });
});

let mockKeyringStatus = 'locked';
let mockPasskeyWrap: { id: string } | null = null;
let mockPasskeyCount = 0;
let mockPasskeysKnownUnusable = 0;

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

// `PasskeyOffer` renders inside the gate and posts to a form action.
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy: () => undefined }) }));

const initialiseKeyring = vi.fn().mockResolvedValue(undefined);

vi.mock('$lib/crypto/session.svelte', () => ({
	currentEnrolmentOffer: () => null,
	dismissEnrolmentOffer: vi.fn(),
	enrolmentIdentityFor: () => null,
	currentKeyring: () => ({
		status: mockKeyringStatus,
		reason: null,
		recipient: 'age1mine',
		wraps: [],
		tier: 'crypto-key',
		passkeyCount: mockPasskeyCount,
		passkeysKnownUnusable: mockPasskeysKnownUnusable,
		unusableProviderAaguid: null
	}),
	initialiseKeyring,
	passkeyWrapFor: () => mockPasskeyWrap,
	resetKeyring: vi.fn(),
	unlockWithPasskey: vi.fn(),
	unlockWithPassword: vi.fn()
}));

const { default: EncryptionGate } = await import('./EncryptionGate.svelte');

const user = { id: 'usr-1', email: 'ada@example.com' };

describe('EncryptionGate', () => {
	it('shows locked callout when keyring is locked and the user has message history', () => {
		mockKeyringStatus = 'locked';
		mockPasskeyWrap = null;
		render(EncryptionGate, { user, userHasMessageHistory: true, handledByPage: false });

		expect(screen.getByText('Your messages are locked on this device')).toBeInTheDocument();
	});

	it('does NOT show locked callout when keyring is locked but the user has no message history', () => {
		mockKeyringStatus = 'locked';
		render(EncryptionGate, { user, userHasMessageHistory: false, handledByPage: false });

		expect(screen.queryByText('Your messages are locked on this device')).not.toBeInTheDocument();
	});

	it('does NOT show locked callout when handledByPage is true even if the user has message history', () => {
		mockKeyringStatus = 'locked';
		render(EncryptionGate, { user, userHasMessageHistory: true, handledByPage: true });

		expect(screen.queryByText('Your messages are locked on this device')).not.toBeInTheDocument();
	});
	it('offers the passkey only when the account has a wrap for one', () => {
		mockKeyringStatus = 'locked';
		mockPasskeyWrap = null;
		const { unmount } = render(EncryptionGate, { user, userHasMessageHistory: true });
		expect(screen.queryByText('Unlock with a passkey')).not.toBeInTheDocument();
		unmount();

		// The password is never taken away, because a passkey can be lost and the
		// password cannot be recovered — but it moves behind a button, because
		// someone who set up a passkey did so to stop typing it.
		mockPasskeyWrap = { id: 'wrap-1' };
		render(EncryptionGate, { user, userHasMessageHistory: true });
		expect(screen.getByText('Unlock with a passkey')).toBeInTheDocument();
		expect(screen.getByText('Use your password instead')).toBeInTheDocument();
	});

	/**
	 * The gate and the messaging screens render the same component, which is the
	 * point of `MessageUnlock` — before it, the messaging board passed no passkey
	 * callback at all and silently had no passkey button.
	 */
	/**
	 * `lock()` deliberately returns the keyring to `unknown`, and nothing used to
	 * re-ask what that meant — so the locked panel only appeared after a reload,
	 * and the messaging screens fell through to rendering ciphertext.
	 */
	it('re-resolves the keyring when it goes back to unknown', async () => {
		mockKeyringStatus = 'unknown';
		render(EncryptionGate, { user, userHasMessageHistory: true });

		await vi.waitFor(() => expect(initialiseKeyring).toHaveBeenCalled());
	});

	it('passes the keyring straight through to one unlock panel', () => {
		mockKeyringStatus = 'locked';
		mockPasskeyWrap = null;
		mockPasskeyCount = 1;
		mockPasskeysKnownUnusable = 1;
		const { container } = render(EncryptionGate, { user, userHasMessageHistory: true });

		expect(container.querySelectorAll('form[data-unlock-mode]')).toHaveLength(1);
		expect(container.querySelector('form[data-unlock-mode]')).toHaveAttribute(
			'data-unlock-mode',
			'passkeys-unusable'
		);
		mockPasskeyCount = 0;
		mockPasskeysKnownUnusable = 0;
	});
});
