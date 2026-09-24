import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockKeyring =
	| { status: 'unknown' }
	| { status: 'locked'; signInFailed: boolean }
	| { status: 'unlocked'; durable: true };

let mockKeyring: MockKeyring = { status: 'unknown' };

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const goto = vi.fn().mockResolvedValue(undefined);
vi.mock('$app/navigation', () => ({ goto }));

vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/home/guides?tab=2') }
}));

const signOut = vi.fn().mockResolvedValue({ data: null, error: null });
vi.mock('$lib/auth-client', () => ({ authClient: { signOut } }));

const initialiseKeyring = vi.fn().mockResolvedValue(undefined);
const lock = vi.fn().mockResolvedValue(undefined);

vi.mock('$lib/crypto/session.svelte', () => ({
	currentKeyring: () => mockKeyring,
	initialiseKeyring,
	lock,
	resetKeyring: vi.fn()
}));

const { default: EncryptionGate } = await import('./EncryptionGate.svelte');

const user = { id: 'usr-1', email: 'ada@example.com' };

beforeEach(() => {
	vi.clearAllMocks();
	sessionStorage.clear();
});

describe('EncryptionGate', () => {
	/**
	 * `unknown` is also what signing out leaves behind, so the gate has to
	 * re-ask whenever it comes back — not only on first mount.
	 */
	it('works out where the device stands when the keyring is unknown', async () => {
		mockKeyring = { status: 'unknown' };
		render(EncryptionGate, { user });

		await vi.waitFor(() => expect(initialiseKeyring).toHaveBeenCalledWith(user));
		expect(goto).not.toHaveBeenCalled();
	});

	/**
	 * There is no unlock screen: a device without its key signs out and sends
	 * the user to sign in again, which is what unlocks.
	 */
	it('sends a device without its key back to sign in', async () => {
		mockKeyring = { status: 'locked', signInFailed: false };
		render(EncryptionGate, { user });

		await vi.waitFor(() => expect(goto).toHaveBeenCalled());
		expect(lock).toHaveBeenCalledWith(user.id);
		expect(signOut).toHaveBeenCalled();

		const [target] = goto.mock.calls[0] as [string];
		const url = new URL(target, 'http://localhost');
		expect(url.pathname).toBe('/(public)/login');
		// Back to where they were, and marked so the storage explanation can
		// follow — but nothing about keys or messages in what is shown.
		expect(url.searchParams.get('redirectTo')).toBe('/home/guides?tab=2');
		expect(url.searchParams.get('reason')).toBe('device');
		// The email is kept on the device for the login page to pre-fill, never
		// put in the URL.
		expect(target).not.toContain('ada@example.com');
		expect(sessionStorage.getItem('bound-up:sign-in-again-email')).toBe('ada@example.com');
	});

	/**
	 * A sign-in that handed over its secret and still did not unlock is a bug,
	 * and sending the user round again would bury it in a loop.
	 */
	it('does not loop when a sign-in just failed to unlock', async () => {
		mockKeyring = { status: 'locked', signInFailed: true };
		render(EncryptionGate, { user });

		await new Promise((settle) => setTimeout(settle, 50));
		expect(goto).not.toHaveBeenCalled();
		expect(signOut).not.toHaveBeenCalled();
	});

	it('leaves an unlocked device alone', async () => {
		mockKeyring = { status: 'unlocked', durable: true };
		render(EncryptionGate, { user });

		await new Promise((settle) => setTimeout(settle, 50));
		expect(goto).not.toHaveBeenCalled();
		expect(lock).not.toHaveBeenCalled();
	});
});
