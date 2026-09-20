import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { account, clickWaButton, fillPassword, signUp } from './helpers';

/**
 * Unlocking messages with a passkey, through a real ceremony.
 *
 * Everything below the browser is covered by unit tests, and they all run
 * against an authenticator this repo wrote — which is exactly why two bugs
 * reached a phone: one where the offer appeared to people with no passkey and
 * then did nothing visible, and one where a password manager returned no PRF
 * and the message blamed the user's OS version. Neither is reachable without
 * driving `navigator.credentials` for real.
 *
 * Chromium's virtual authenticator can, through CDP: `hasPrf` makes it
 * evaluate the PRF extension, which Playwright's own cross-browser
 * `browserContext.credentials` API cannot do.
 */

type Authenticator = { forget: () => Promise<void> };

async function useAuthenticator(page: Page, options: { prf: boolean }): Promise<Authenticator> {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			ctap2Version: 'ctap2_1',
			transport: 'internal',
			// Discoverable, because the unlock ceremony passes no
			// `allowCredentials` — it lets the platform offer what it has.
			hasResidentKey: true,
			hasUserVerification: true,
			// PRF needs user verification, so the assertion has to carry it.
			isUserVerified: true,
			hasPrf: options.prf,
			automaticPresenceSimulation: true
		}
	});
	return {
		forget: async () => {
			await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
		}
	};
}

/** Registers a passkey the way a user does, from Security. */
async function registerPasskey(page: Page) {
	await page.goto('/settings/security');
	await clickWaButton(page, 'Add a passkey');
	await expect(page.getByText('You have no passkeys yet.')).toBeHidden();
}

/**
 * Throws away the key cache without touching the session.
 *
 * What iOS does after about a week, and the state every one of these tests
 * needs: signed in, and with no way to read a message until something unlocks.
 */
async function evictKeyStorage(page: Page) {
	await page.evaluate(
		() =>
			new Promise<void>((resolve, reject) => {
				const request = indexedDB.deleteDatabase('bound-up-keys');
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
				request.onblocked = () => resolve();
			})
	);
	await page.reload();
}

test.describe('setting up a passkey', () => {
	/**
	 * The whole loop: register, unlock with the password, accept the offer, lose
	 * the storage, and get back in with the passkey and no password at all.
	 */
	test('seals the identity to a passkey, which then unlocks it', async ({ page }) => {
		const who = account('Isla');
		const authenticator = await useAuthenticator(page, { prf: true });
		try {
			await signUp(page, who);
			await registerPasskey(page);

			await evictKeyStorage(page);
			await page.goto('/settings/encryption');
			await fillPassword(page, 'unlockPassword', who.password);
			await clickWaButton(page, 'Unlock messages');

			// Offered only now: at signup there was no passkey to offer.
			await expect(page.getByText('Unlock with a passkey next time?')).toBeVisible();
			await clickWaButton(page, 'Set it up');

			// The offer goes when the wrap is stored, and the wrap shows up as
			// another way in.
			await expect(page.getByText('Unlock with a passkey next time?')).toBeHidden();
			await expect(page.locator('.wraps li')).toHaveCount(2);

			// The part that matters: a cold device, and no password typed.
			await evictKeyStorage(page);
			await expect(page.getByText(/Locked on this device/)).toBeVisible();
			await clickWaButton(page, 'Unlock with a passkey');
			await expect(page.getByText(/Your messages are unlocked here/)).toBeVisible();
		} finally {
			await authenticator.forget();
		}
	});

	/** Declining has to be as easy as accepting, and has to stick for the page. */
	test('takes no for an answer', async ({ page }) => {
		const who = account('Lior');
		const authenticator = await useAuthenticator(page, { prf: true });
		try {
			await signUp(page, who);
			await registerPasskey(page);

			await evictKeyStorage(page);
			await page.goto('/settings/encryption');
			await fillPassword(page, 'unlockPassword', who.password);
			await clickWaButton(page, 'Unlock messages');

			await expect(page.getByText('Unlock with a passkey next time?')).toBeVisible();
			// While the free offer is up, the form that asks for a password to do
			// the same thing stays out of the way.
			await expect(page.getByRole('heading', { name: 'Add a passkey' })).toBeHidden();

			await clickWaButton(page, 'Not now');
			await expect(page.getByText('Unlock with a passkey next time?')).toBeHidden();
			await expect(page.getByRole('heading', { name: 'Add a passkey' })).toBeVisible();
			await expect(page.locator('.wraps li')).toHaveCount(1);
		} finally {
			await authenticator.forget();
		}
	});

	/**
	 * The first bug. The offer used to appear whenever the *browser* had
	 * WebAuthn, so an account with no passkey got a button that opened a chooser
	 * with nothing in it — and WebAuthn reports that exactly like a dismissal,
	 * so the screen did not change and could not say why.
	 */
	test('is not offered to an account with no passkey', async ({ page }) => {
		const who = account('Jonas');
		await signUp(page, who);

		await evictKeyStorage(page);
		await page.goto('/settings/encryption');
		await fillPassword(page, 'unlockPassword', who.password);
		await clickWaButton(page, 'Unlock messages');

		await expect(page.getByText(/Your messages are unlocked here/)).toBeVisible();
		await expect(page.getByText('Unlock with a passkey next time?')).toBeHidden();
		// And it says where to get one rather than offering a form that cannot work.
		await expect(page.getByText('You have no passkeys yet.')).toBeVisible();
	});

	/**
	 * The second bug. A passkey whose provider returns no PRF output cannot seal
	 * anything, and age's own message for it names macOS 15 and Chrome 132 —
	 * which reads as nonsense to someone already on macOS 15 whose password
	 * manager is the thing at fault.
	 */
	test('says which passkey is at fault when it cannot do PRF', async ({ page }) => {
		const who = account('Kit');
		const authenticator = await useAuthenticator(page, { prf: false });
		try {
			await signUp(page, who);
			await registerPasskey(page);

			await evictKeyStorage(page);
			await page.goto('/settings/encryption');
			await fillPassword(page, 'unlockPassword', who.password);
			await clickWaButton(page, 'Unlock messages');

			await expect(page.getByText('Unlock with a passkey next time?')).toBeVisible();
			await clickWaButton(page, 'Set it up');

			await expect(page.getByText(/That passkey cannot unlock your messages/)).toBeVisible();
			await expect(page.getByText(/macOS 15/)).toBeHidden();
			// Nothing was stored, so the password is still the only way in.
			await expect(page.locator('.wraps li')).toHaveCount(1);
		} finally {
			await authenticator.forget();
		}
	});
});
