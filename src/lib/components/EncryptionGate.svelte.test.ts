import { describe, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';

let mockKeyringStatus = 'locked';
let mockPasskeyWrap: { id: string } | null = null;

vi.mock('$app/paths', () => ({
	resolve: (id: string, params?: Record<string, string>) =>
		params ? id.replace(/\[(\w+)\]/g, (_, key) => params[key]) : id
}));

// `PasskeyOffer` renders inside the gate and posts to a form action.
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));

vi.mock('$lib/crypto/session.svelte', () => ({
	currentEnrolmentOffer: () => null,
	dismissEnrolmentOffer: vi.fn(),
	enrolmentIdentityFor: () => null,
	currentKeyring: () => ({ status: mockKeyringStatus, reason: null, wraps: [] }),
	initialiseKeyring: vi.fn().mockResolvedValue(undefined),
	passkeyWrapFor: () => mockPasskeyWrap,
	resetKeyring: vi.fn(),
	unlockWithPasskey: vi.fn(),
	unlockWithPassword: vi.fn()
}));

const { default: EncryptionGate } = await import('./EncryptionGate.svelte');

const user = { id: 'usr-1', email: 'ada@example.com' };

describe('EncryptionGate', () => {
	test('shows locked callout when keyring is locked and the user has message history', () => {
		mockKeyringStatus = 'locked';
		mockPasskeyWrap = null;
		render(EncryptionGate, { user, userHasMessageHistory: true, handledByPage: false });

		expect(screen.getByText('Your messages are locked on this device')).toBeInTheDocument();
	});

	test('does NOT show locked callout when keyring is locked but the user has no message history', () => {
		mockKeyringStatus = 'locked';
		render(EncryptionGate, { user, userHasMessageHistory: false, handledByPage: false });

		expect(screen.queryByText('Your messages are locked on this device')).not.toBeInTheDocument();
	});

	test('does NOT show locked callout when handledByPage is true even if the user has message history', () => {
		mockKeyringStatus = 'locked';
		render(EncryptionGate, { user, userHasMessageHistory: true, handledByPage: true });

		expect(screen.queryByText('Your messages are locked on this device')).not.toBeInTheDocument();
	});
	test('offers the passkey only when the account has one', async () => {
		mockKeyringStatus = 'locked';
		mockPasskeyWrap = null;
		const { unmount } = render(EncryptionGate, { user, userHasMessageHistory: true });
		expect(screen.queryByText('Unlock with a passkey')).not.toBeInTheDocument();
		unmount();

		// Nothing else changes: the password field is still there underneath,
		// because a passkey can be lost and the password cannot be recovered.
		mockPasskeyWrap = { id: 'wrap-1' };
		render(EncryptionGate, { user, userHasMessageHistory: true });
		expect(screen.getByText('Unlock with a passkey')).toBeInTheDocument();
		expect(screen.getByText('or use your password')).toBeInTheDocument();
	});
});
