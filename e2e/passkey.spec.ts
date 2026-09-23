import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { test } from './fixtures';
import {
	account,
	clickWaButton,
	fillPassword,
	linkAccounts,
	newSide,
	openBoard,
	signUp,
	writeThread
} from './helpers';

/**
 * Registering a passkey and unlocking messages with it, through real ceremonies.
 *
 * Everything below the browser is covered by unit tests, and they all run
 * against an authenticator this repo wrote — which is exactly why bugs reached
 * a phone: an offer that appeared to people with no passkey and then did
 * nothing visible, a password manager returning no PRF and the message blaming
 * the user's OS version, and a passkey that signed in fine and could not read a
 * single message with nothing anywhere saying so. None of those is reachable
 * without driving `navigator.credentials` for real.
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
			// Discoverable, because an unlock ceremony on a wrap written before the
			// credential binding existed passes no `allowCredentials` — it lets the
			// platform offer what it has.
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

/**
 * Registers a passkey the way a user now does: from Security, with a password.
 *
 * Returns once the naming dialog is up, so a caller can assert on what it says
 * about message unlock before dismissing it.
 */
async function addPasskey(page: Page, password: string) {
	await page.goto('/settings/security');
	await clickWaButton(page, 'Add a passkey');
	await expect(page.getByTestId('add-passkey-password')).toBeVisible();
	await fillPassword(page, 'addPasskeyPassword', password);
	await clickWaButton(page, 'Continue');
	// The heading, not `getByLabel`: `<wa-dialog label=…>` renders the label as
	// a heading inside the dialog rather than as an accessible name on anything
	// a label query can reach.
	await expect(namingDialog(page)).toBeVisible({ timeout: 15_000 });
}

function namingDialog(page: Page) {
	return page.getByRole('heading', { name: 'Name this passkey' });
}

/**
 * Accepts whatever the naming dialog suggests, and waits for it to land.
 *
 * The dialog closes before the name is saved: `saveName()` hides it, then
 * renames the passkey, then calls `invalidateAll()`. A step that navigates
 * straight after the dialog closes can have that navigation superseded by the
 * invalidation — SvelteKit lets the newest of the two win — and stay on the
 * page it left, with the link it clicked focused and nothing else happening.
 * Waiting for the invalidation's own data request is what closes that window.
 */
async function finishNaming(page: Page) {
	const refreshed = page.waitForResponse((response) => response.url().includes('/__data.json'));
	await clickWaButton(page, 'Done');
	await expect(namingDialog(page)).toBeHidden();
	await refreshed;
}

/**
 * Throws away the key cache without touching the session.
 *
 * What iOS does after about a week, and the state most of these tests need:
 * signed in, and with no way to read a message until something unlocks.
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

test.describe('adding a passkey', () => {
	/**
	 * The whole loop: register behind the password, get message unlock in the
	 * same act, lose the storage, and get back in with no password at all.
	 */
	test('asks for the password, then seals the identity to the new passkey', async ({ page }) => {
		const who = account('Isla');
		const authenticator = await useAuthenticator(page, { prf: true });
		try {
			await signUp(page, who);
			await addPasskey(page, who.password);

			// The seal already happened, so the dialog can say what the passkey can
			// actually do rather than guess from a flag.
			await expect(page.getByText('This passkey can also unlock your messages.')).toBeVisible();
			await finishNaming(page);

			await expect(page.getByText('You have no passkeys yet.')).toBeHidden();
			await expect(page.getByTestId('passkey-unlocks')).toBeVisible();
			await expect(page.getByTestId('passkey-no-unlock')).toHaveCount(0);

			// One wrap for the password, one for the passkey — no second trip to
			// /settings/encryption needed.
			await page.goto('/settings/encryption');
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

	/**
	 * The password is a real gate, not decoration. Registering first and checking
	 * afterwards would leave a stray credential behind every typo.
	 */
	test('registers nothing when the password is wrong', async ({ page }) => {
		const who = account('Mira');
		const authenticator = await useAuthenticator(page, { prf: true });
		try {
			await signUp(page, who);
			await page.goto('/settings/security');
			await clickWaButton(page, 'Add a passkey');
			await fillPassword(page, 'addPasskeyPassword', 'not-the-right-password');
			await clickWaButton(page, 'Continue');

			await expect(page.getByText('That password is not right')).toBeVisible();
			// Still on the prompt, and nothing was created.
			await expect(page.getByTestId('add-passkey-password')).toBeVisible();
			await clickWaButton(page, 'Cancel');
			await expect(page.getByText('You have no passkeys yet.')).toBeVisible();
		} finally {
			await authenticator.forget();
		}
	});

	/**
	 * The passkey still works for signing in — that is the whole point of saying
	 * something rather than refusing — but it cannot open a message, and both
	 * the dialog and the list have to say so.
	 */
	test('warns, and keeps warning, when the passkey cannot do PRF', async ({ page }) => {
		const who = account('Kit');
		const authenticator = await useAuthenticator(page, { prf: false });
		try {
			await signUp(page, who);
			await addPasskey(page, who.password);

			await expect(page.getByText('This passkey cannot unlock your messages')).toBeVisible();
			// age's own text names macOS 15 and Chrome 132, which reads as nonsense
			// to someone already on macOS 15 whose password manager is at fault.
			await expect(page.getByText(/macOS 15/)).toHaveCount(0);
			// And it says where a passkey would work instead. Scoped to the dialog:
			// the same list is already on the page behind it, beside the passkey.
			const dialog = page.locator('wa-dialog');
			await dialog.getByText('Which password managers can unlock messages').click();
			await expect(dialog.getByText('Dashlane', { exact: false }).first()).toBeVisible();
			await finishNaming(page);

			// The warning persists beside the passkey, so it is still answerable
			// tomorrow rather than only in the moment it was created.
			await expect(page.getByTestId('passkey-no-unlock')).toBeVisible();
			await expect(page.getByTestId('passkey-unlocks')).toHaveCount(0);

			// Nothing was stored, so the password is still the only way in.
			await page.goto('/settings/encryption');
			await expect(page.locator('.wraps li')).toHaveCount(1);
		} finally {
			await authenticator.forget();
		}
	});

	/**
	 * The AAGUID only exists in a registration response, which is why the name is
	 * chosen after the credential is made rather than before it.
	 */
	test('lets the passkey be named, and keeps the name', async ({ page }) => {
		const who = account('Noor');
		const authenticator = await useAuthenticator(page, { prf: true });
		try {
			await signUp(page, who);
			await addPasskey(page, who.password);

			await page.locator('wa-input[data-field="passkeyName"] input').fill('Work laptop');
			await finishNaming(page);

			await expect(page.getByText('Work laptop')).toBeVisible();
			// The wraps list follows the passkey's current name rather than the
			// label frozen in when it was sealed.
			await page.goto('/settings/encryption');
			await expect(page.locator('.wraps li').getByText('Work laptop')).toBeVisible();
		} finally {
			await authenticator.forget();
		}
	});
});

test.describe('the unlock panel', () => {
	/**
	 * One component, four shapes. The messaging board used to build its own and
	 * pass no passkey callback at all, so the screen a locked device is most
	 * likely to be found on was the one screen with no passkey button.
	 */
	test('offers the passkey first, with the password one click away', async ({ page }) => {
		const who = account('Rae');
		const authenticator = await useAuthenticator(page, { prf: true });
		try {
			await signUp(page, who);
			await addPasskey(page, who.password);
			await finishNaming(page);

			await evictKeyStorage(page);
			await page.goto('/settings/encryption');

			const panel = page.locator('form[data-unlock-mode]');
			await expect(panel).toHaveAttribute('data-unlock-mode', 'passkey-ready');
			await expect(page.getByText('Unlock with a passkey')).toBeVisible();
			// A button, not a field: someone who set up a passkey did so to stop
			// typing their password.
			await expect(page.locator('wa-input[data-field="unlockPassword"]')).toHaveCount(0);

			await clickWaButton(page, 'Use your password instead');
			await expect(page.locator('wa-input[data-field="unlockPassword"]')).toBeVisible();
			await fillPassword(page, 'unlockPassword', who.password);
			await clickWaButton(page, 'Unlock messages');
			await expect(page.getByText(/Your messages are unlocked here/)).toBeVisible();
		} finally {
			await authenticator.forget();
		}
	});

	/**
	 * The case the whole PRF check exists for. Asking for a password with no
	 * explanation, from someone who deliberately set up a passkey, reads as the
	 * app being broken.
	 */
	test('explains itself when every passkey has failed', async ({ page }) => {
		const who = account('Tomas');
		const authenticator = await useAuthenticator(page, { prf: false });
		try {
			await signUp(page, who);
			await addPasskey(page, who.password);
			await finishNaming(page);

			await evictKeyStorage(page);
			await page.goto('/settings/encryption');

			const panel = page.locator('form[data-unlock-mode]');
			await expect(panel).toHaveAttribute('data-unlock-mode', 'passkeys-unusable');
			await expect(page.getByText('Your passkey cannot unlock your messages')).toBeVisible();
			// The password is shown straight away here, because it is the only way
			// in — no extra click between the user and the thing that works.
			await expect(page.locator('wa-input[data-field="unlockPassword"]')).toBeVisible();
			// And no passkey button, which would open a chooser that cannot help.
			await expect(page.getByText('Unlock with a passkey')).toHaveCount(0);
		} finally {
			await authenticator.forget();
		}
	});

	/**
	 * With nothing registered, offering "unlock with a passkey" opens a chooser
	 * with nothing in it, and WebAuthn reports that exactly like a dismissal. So
	 * the offer is to *create* one — which needs the password first, because a
	 * locked device has no identity to seal.
	 */
	test('offers to create a passkey when the account has none', async ({ page }) => {
		const who = account('Vesna');
		const authenticator = await useAuthenticator(page, { prf: true });
		try {
			await signUp(page, who);
			await evictKeyStorage(page);
			await page.goto('/settings/encryption');

			const panel = page.locator('form[data-unlock-mode]');
			await expect(panel).toHaveAttribute('data-unlock-mode', 'offer-setup');
			await expect(page.getByText('Unlock with a passkey')).toHaveCount(0);

			await fillPassword(page, 'unlockPassword', who.password);
			await clickWaButton(page, 'Unlock and set up a passkey');

			// It unlocks first, then registers — a passkey sealed off a password
			// that turned out to be wrong would open nothing and look like it had.
			await expect(namingDialog(page)).toBeVisible({ timeout: 15_000 });
			await expect(page.getByText('This passkey can also unlock your messages.')).toBeVisible();
			await finishNaming(page);

			await expect(page.getByText(/Your messages are unlocked here/)).toBeVisible();
			await expect(page.locator('.wraps li')).toHaveCount(2);
		} finally {
			await authenticator.forget();
		}
	});

	/**
	 * The same component on the messaging screens, which is the point of
	 * `MessageUnlock`. Asserted here rather than only in the component tests
	 * because the drift
	 * it replaced was invisible to every test that existed.
	 */
	test('is the same panel on the messages board', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		const authenticator = await useAuthenticator(ada.page, { prf: true });
		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await addPasskey(ada.page, ada.who.password);
			await finishNaming(ada.page);

			// Before evicting, so the one-time history warning is out of the way and
			// the locked screen is the only thing this asserts on.
			await openBoard(ada.page, jun.who.name);
			await evictKeyStorage(ada.page);

			const panel = ada.page.locator('form[data-unlock-mode]');
			await expect(panel).toHaveAttribute('data-unlock-mode', 'passkey-ready');
			await clickWaButton(ada.page, 'Unlock with a passkey');
			await expect(panel).toHaveCount(0);
		} finally {
			await authenticator.forget();
			await ada.close();
			await jun.close();
		}
	});
});

test.describe('adding a passkey from encrypted messages', () => {
	/**
	 * The same component as Security, reached from the other screen.
	 *
	 * That page used to carry its own inline password field posting to its own
	 * action — a second implementation of one job, which is how the two drifted
	 * far enough apart that only one of them ever checked PRF.
	 */
	test('uses the same dialog, and seals message unlock', async ({ page }) => {
		const who = account('Odile');
		const authenticator = await useAuthenticator(page, { prf: true });
		try {
			await signUp(page, who);
			await page.goto('/settings/encryption');
			await expect(page.locator('.wraps li')).toHaveCount(1);

			await clickWaButton(page, 'Add a passkey');
			// A dialog, not a field on the page behind it.
			await expect(page.getByTestId('add-passkey-password')).toBeVisible();
			await fillPassword(page, 'addPasskeyPassword', who.password);
			await clickWaButton(page, 'Continue');

			await expect(namingDialog(page)).toBeVisible({ timeout: 15_000 });
			await expect(page.getByText('This passkey can also unlock your messages.')).toBeVisible();
			await finishNaming(page);

			await expect(page.locator('.wraps li')).toHaveCount(2);
			// Registered with Better Auth too, so it is a real sign-in credential
			// and not just a wrap — the old encryption-page form could only seal
			// to a passkey that already existed.
			await page.goto('/settings/security');
			await expect(page.getByTestId('passkey-unlocks')).toBeVisible();
		} finally {
			await authenticator.forget();
		}
	});
});

test.describe('locking on this device', () => {
	/**
	 * `lock()` returns the keyring to `unknown`, and nothing used to re-ask what
	 * that meant — so the locked panel appeared only after a reload, and every
	 * screen that switches on the status was stuck showing the wrong thing.
	 */
	test('shows the locked panel immediately, with no reload', async ({ page }) => {
		const who = account('Wren');
		await signUp(page, who);
		await page.goto('/settings/encryption');
		await expect(page.getByText(/Your messages are unlocked here/)).toBeVisible();

		await clickWaButton(page, 'Lock on this device');

		// Without navigating anywhere.
		await expect(page.getByText(/Locked on this device/)).toBeVisible();
		await expect(page.locator('form[data-unlock-mode]')).toBeVisible();
	});

	/**
	 * The board rendered every thread with "…" for the preview and "…" for each
	 * message inside — ciphertext with nothing to open it, shown as if it were
	 * the content. A locked device has to say it is locked.
	 */
	test('sends the messages screens to the unlock form rather than showing ciphertext', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		const secret = 'the thing that must not be rendered as an ellipsis';
		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			// `linkAccounts` leaves the inviter on the invite screen, which still
			// says "waiting for them to accept" — its nav has no Messages link yet.
			// A real navigation is what picks the acceptance up.
			await ada.page.goto('/home');
			await openBoard(ada.page, jun.who.name);
			await writeThread(ada.page, secret);
			await expect(ada.page.getByText(secret)).toBeVisible();

			const threadUrl = ada.page.url();
			const boardUrl = threadUrl.replace(/\/[0-9a-f-]{36}$/, '');

			// Lock from settings, then come back the way a user would.
			await ada.page.goto('/settings/encryption');
			await clickWaButton(ada.page, 'Lock on this device');
			await expect(ada.page.getByText(/Locked on this device/)).toBeVisible();

			// The board: the unlock form, not a grid of threads whose previews are
			// all "…" because there is no key to open them with.
			await ada.page.goto(boardUrl);
			await expect(ada.page.getByRole('heading', { name: 'Unlock your messages' })).toBeVisible();
			await expect(ada.page.locator('form[data-unlock-mode]')).toBeVisible();
			await expect(ada.page.getByText('…', { exact: true })).toHaveCount(0);

			// And the thread itself, which showed "…" for every message.
			await ada.page.goto(threadUrl);
			await expect(ada.page.locator('form[data-unlock-mode]')).toBeVisible();
			await expect(ada.page.getByText(secret)).toHaveCount(0);
			await expect(ada.page.getByText('…', { exact: true })).toHaveCount(0);

			// It opens again from right there, with the message readable.
			await fillPassword(ada.page, 'unlockPassword', ada.who.password);
			await clickWaButton(ada.page, 'Unlock messages');
			await expect(ada.page.getByText(secret)).toBeVisible();
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});

test.describe('the free offer after an unlock', () => {
	/**
	 * `PasskeyOffer` is a different moment from `AddPasskeyFlow`: the identity is
	 * still in memory as a string, so it needs no password at all. It still
	 * requires a passkey to already exist, for the chooser reason above.
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
	});
});
