import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

/**
 * The one unlock form, in each of the four shapes it takes.
 *
 * Everything that touches WebCrypto, IndexedDB or WebAuthn is injected, which
 * is what makes this testable in jsdom at all — and which is also how the real
 * callers stay honest, because the component can express no opinion about how
 * an unlock happens.
 *
 * `wa-*` elements are never upgraded here (they come from a CDN), so these
 * assert on what the component emits rather than on rendered behaviour.
 * Anything needing Web Awesome to actually work is in `e2e/passkey.spec.ts`.
 */

vi.mock('$app/paths', () => ({ resolve: (id: string) => id }));

/**
 * A stand-in for Web Awesome's `<wa-input>`, because `PasswordField` reads the
 * native control inside the shadow root and refuses to read anything else.
 *
 * That refusal is deliberate and load-bearing — see the autofill note in
 * `PasswordField.svelte` — so a test that wants to type a password has to
 * provide the thing it insists on rather than work around it. Web Awesome comes
 * from a CDN and never upgrades in jsdom, so nothing real is being shadowed.
 */
class FakeWaInput extends HTMLElement {
	readonly input = document.createElement('input');
	readonly updateComplete = Promise.resolve(true);
}

/** jsdom has no WebAuthn, and the panel correctly hides passkey controls then. */
beforeAll(() => {
	vi.stubGlobal('PublicKeyCredential', class {});
	Object.defineProperty(navigator, 'credentials', { value: {}, configurable: true });
	customElements.define('wa-input', FakeWaInput);
});

/** Types into a password box the way a person does. */
async function typePassword(container: HTMLElement, field: string, value: string) {
	const host = container.querySelector(`wa-input[data-field="${field}"]`) as FakeWaInput;
	await host.updateComplete;
	host.input.value = value;
	await fireEvent.input(host.input);
}

const { default: UnlockPanel } = await import('./UnlockPanel.svelte');

type Unlock = (password: string) => Promise<void>;

let unlock: ReturnType<typeof vi.fn<Unlock>>;
let passkeyUnlock: ReturnType<typeof vi.fn<() => Promise<void>>>;
let setUpPasskey: ReturnType<typeof vi.fn<Unlock>>;

beforeEach(() => {
	unlock = vi.fn<Unlock>().mockResolvedValue(undefined);
	passkeyUnlock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
	setUpPasskey = vi.fn<Unlock>().mockResolvedValue(undefined);
});

function mount(props: Record<string, unknown> = {}) {
	return render(UnlockPanel, { unlock, setUpPasskey, ...props });
}

function mode(container: HTMLElement): string | null {
	return container.querySelector('form')?.getAttribute('data-unlock-mode') ?? null;
}

/** The password box carries `data-field` rather than a name — see PasswordField. */
function passwordBox(container: HTMLElement): Element | null {
	return container.querySelector('wa-input[data-field="unlockPassword"]');
}

describe('with a passkey that can unlock', () => {
	test('leads with the passkey and keeps the password one click away', async () => {
		const { container } = mount({ passkeyUnlock, passkeyCount: 1 });

		expect(mode(container)).toBe('passkey-ready');
		expect(screen.getByText('Unlock with a passkey')).toBeInTheDocument();
		// A button, not a field. Someone who set up a passkey did so to stop
		// typing their password.
		expect(screen.getByText('Use your password instead')).toBeInTheDocument();
		expect(passwordBox(container)).toBeNull();
	});

	test('reveals the field once the password button is pressed', async () => {
		const { container } = mount({ passkeyUnlock, passkeyCount: 1 });

		// `fireEvent` and not a bare `MouseEvent`: Svelte 5 delegates `click` to
		// the root, so a non-bubbling event reaches no handler at all.
		await fireEvent.click(screen.getByText('Use your password instead'));

		expect(passwordBox(container)).not.toBeNull();
		expect(screen.queryByText('Use your password instead')).not.toBeInTheDocument();
	});

	/**
	 * A working wrap outranks a failed verdict on some other passkey: one that
	 * works and one that does not still means the button should be there.
	 */
	test('still leads with the passkey when another one is known to fail', () => {
		const { container } = mount({
			passkeyUnlock,
			passkeyCount: 2,
			passkeysKnownUnusable: 1
		});
		expect(mode(container)).toBe('passkey-ready');
	});
});

describe('with passkeys that cannot unlock', () => {
	test('says so, names the provider, and shows the field straight away', () => {
		const { container } = mount({
			passkeyCount: 1,
			passkeysKnownUnusable: 1,
			unusableProviderAaguid: '531126d6-e717-415c-9320-3d9aa6981239'
		});

		expect(mode(container)).toBe('passkeys-unusable');
		expect(screen.getByText('Your passkey cannot unlock your messages')).toBeInTheDocument();
		expect(screen.getByText(/^Dashlane can sign you in/)).toBeInTheDocument();
		// Not hidden behind a button here: the password is the only way in.
		expect(passwordBox(container)).not.toBeNull();
		expect(screen.queryByText('Use your password instead')).not.toBeInTheDocument();
	});

	/** Apple reports the anonymous AAGUID, so the copy has to work with no name. */
	test('still explains itself when the provider cannot be named', () => {
		mount({ passkeyCount: 1, passkeysKnownUnusable: 1, unusableProviderAaguid: null });
		expect(
			screen.getByText(/It signs you in, but the password manager holding it/)
		).toBeInTheDocument();
	});

	test('does not offer to set one up, which would go round the same loop', () => {
		mount({ passkeyCount: 1, passkeysKnownUnusable: 1 });
		expect(screen.queryByText(/set up a passkey/i)).not.toBeInTheDocument();
	});
});

describe('with no usable wrap yet', () => {
	test('offers to create one when the account has no passkey', () => {
		const { container } = mount({ passkeyCount: 0 });

		expect(mode(container)).toBe('offer-setup');
		expect(screen.getByText('Unlock and set up a passkey')).toBeInTheDocument();
		expect(passwordBox(container)).not.toBeNull();
		// Never offered: with nothing registered the platform opens a chooser
		// with nothing in it and reports it exactly like a dismissal.
		expect(screen.queryByText('Unlock with a passkey')).not.toBeInTheDocument();
	});

	/**
	 * A passkey with no verdict might work perfectly well — it was registered
	 * before the check existed — so it gets the offer, worded for a passkey that
	 * already exists.
	 */
	test('offers to use an existing passkey that has never been tried', () => {
		const { container } = mount({ passkeyCount: 1, passkeysKnownUnusable: 0 });

		expect(mode(container)).toBe('offer-setup');
		expect(screen.getByText('Unlock and use my passkey next time')).toBeInTheDocument();
	});

	test('unlocks before it registers anything', async () => {
		const order: string[] = [];
		unlock.mockImplementation(async () => void order.push('unlock'));
		setUpPasskey.mockImplementation(async () => void order.push('setup'));
		const { container } = mount({ passkeyCount: 0 });

		await typePassword(container, 'unlockPassword', 'correct horse battery staple');

		await fireEvent.click(screen.getByText('Unlock and set up a passkey'));
		await vi.waitFor(() => expect(order).toEqual(['unlock', 'setup']));
		// A passkey sealed off a password that turned out to be wrong would open
		// nothing and would look like it had.
		expect(setUpPasskey).toHaveBeenCalledWith('correct horse battery staple');
	});

	test('does nothing at all with an empty password', async () => {
		mount({ passkeyCount: 0 });
		await fireEvent.click(screen.getByText('Unlock and set up a passkey'));
		expect(unlock).not.toHaveBeenCalled();
		expect(setUpPasskey).not.toHaveBeenCalled();
	});

	test('omits the offer entirely when the caller cannot honour it', () => {
		const { container } = mount({ passkeyCount: 0, setUpPasskey: null });
		expect(mode(container)).toBe('offer-setup');
		expect(screen.queryByText('Unlock and set up a passkey')).not.toBeInTheDocument();
		expect(passwordBox(container)).not.toBeNull();
	});
});

describe('the password half', () => {
	test('reports a wrong password', () => {
		mount({ passkeyCount: 0, wrongPassword: true });
		expect(screen.getByText('That password did not unlock your messages')).toBeInTheDocument();
	});

	/**
	 * Said before the unlock and not after it: this is the one moment the user is
	 * deciding whether to bother, and being surprised by the same prompt tomorrow
	 * is what made this feel broken rather than limited.
	 */
	test('warns up front when this browser will not remember the key', () => {
		mount({ passkeyCount: 0, willRepeat: true });
		expect(screen.getByText(/asked again each time you open the app/)).toBeInTheDocument();
	});
});

describe('without WebAuthn', () => {
	test('shows the password alone, whatever the account has', () => {
		const credentials = Object.getOwnPropertyDescriptor(navigator, 'credentials');
		Object.defineProperty(navigator, 'credentials', { value: undefined, configurable: true });
		try {
			const { container } = mount({ passkeyUnlock, passkeyCount: 1 });
			expect(mode(container)).toBe('password-only');
			expect(screen.queryByText('Unlock with a passkey')).not.toBeInTheDocument();
			expect(passwordBox(container)).not.toBeNull();
		} finally {
			Object.defineProperty(navigator, 'credentials', credentials!);
		}
	});
});
