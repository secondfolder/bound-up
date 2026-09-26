import type { Page, Request } from '@playwright/test';
import { expect } from '@playwright/test';
import { test } from './fixtures';
import {
	account,
	clickWaButton,
	deviceHoldsKey,
	evictKeyStorage,
	expectSentToSignIn,
	fillPassword,
	linkAccounts,
	logOut,
	newSide,
	openBoard,
	signUp,
	waitForHydration,
	writeThread
} from './helpers';

/**
 * Passkeys, through real ceremonies: signing in with one is what unlocks.
 *
 * Everything below the browser is covered by unit tests, and they all run
 * against an authenticator this repo wrote — which is exactly why bugs reached
 * a phone before. What only this level can show is that a real WebAuthn
 * assertion carries its secret into the page, opens the wrap, and never
 * carries it to the server.
 *
 * Chromium's virtual authenticator, through CDP: `hasPrf` decides whether it
 * evaluates the PRF extension, which is the whole difference between the two
 * wraps a passkey can get. Playwright's own cross-browser
 * `browserContext.credentials` API cannot do PRF.
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
			// Discoverable: every passkey this app makes is, because signing in
			// passes no `allowCredentials` and the user handle carries a secret.
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
 * Registers a passkey the way a user does: from Security, with a password.
 * Returns once the naming dialog is up.
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
 * invalidation and stay on the page it left. Waiting for the invalidation's
 * own data request is what closes that window.
 */
async function finishNaming(page: Page) {
	const refreshed = page.waitForResponse((response) => response.url().includes('/__data.json'));
	await clickWaButton(page, 'Done');
	await expect(namingDialog(page)).toBeHidden();
	await refreshed;
}

/** The wraps this account has, as the device fetches them. */
async function wrapTypes(page: Page): Promise<string[]> {
	return await page.evaluate(async () => {
		const response = await fetch('/api/keys/unlock-bundle');
		const bundle = (await response.json()) as { wraps: { type: string }[] };
		return bundle.wraps.map((wrap) => wrap.type).sort((a, b) => a.localeCompare(b));
	});
}

/**
 * Signs in by clicking "Sign in with a passkey" on the page already open.
 *
 * Passkey autofill also runs on the login page, and a virtual authenticator
 * may answer it on its own before the click — so either way in counts, and the
 * click is skipped if the page has already moved on.
 */
async function signInWithPasskeyHere(page: Page) {
	await waitForHydration(page);
	if (new URL(page.url()).pathname === '/login') {
		await clickWaButton(page, 'Sign in with a passkey').catch(() => undefined);
	}
	await page.waitForURL((url) => url.pathname !== '/login');
}

/** Every request body the two passkey ceremonies post to Better Auth. */
function recordCeremonyBodies(page: Page): string[] {
	const bodies: string[] = [];
	page.on('request', (request: Request) => {
		if (/\/passkey\/verify-(?<ceremony>registration|authentication)/.test(request.url())) {
			bodies.push(request.postData() ?? '');
		}
	});
	return bodies;
}

test.describe('adding a passkey', () => {
	test('asks for the password, then seals the key to the new passkey with PRF', async ({
		page
	}) => {
		const who = account('Ines');
		const authenticator = await useAuthenticator(page, { prf: true });
		try {
			await signUp(page, who);
			await addPasskey(page, who.password);
			await expect(page.getByText('You can sign in with this passkey now.')).toBeVisible();
			await finishNaming(page);

			expect(await wrapTypes(page)).toEqual(['passkey-prf', 'password']);
		} finally {
			await authenticator.forget();
		}
	});

	/**
	 * A provider that will not do PRF still gets a passkey that unlocks — the
	 * secret goes in the user handle instead. No warning, because there is
	 * nothing to warn about any more.
	 */
	test('falls back to the user handle when the provider has no PRF', async ({ page }) => {
		const who = account('Jem');
		const authenticator = await useAuthenticator(page, { prf: false });
		try {
			await signUp(page, who);
			await addPasskey(page, who.password);
			await finishNaming(page);

			expect(await wrapTypes(page)).toEqual(['passkey-handle', 'password']);
		} finally {
			await authenticator.forget();
		}
	});

	test('registers nothing when the password is wrong', async ({ page }) => {
		const who = account('Kai');
		const authenticator = await useAuthenticator(page, { prf: true });
		try {
			await signUp(page, who);
			await page.goto('/settings/security');
			await clickWaButton(page, 'Add a passkey');
			await fillPassword(page, 'addPasskeyPassword', 'not-the-password');
			await clickWaButton(page, 'Continue');

			await expect(page.getByText('That password is not right')).toBeVisible();
			await expect(namingDialog(page)).toHaveCount(0);
			expect(await wrapTypes(page)).toEqual(['password']);
		} finally {
			await authenticator.forget();
		}
	});

	test('lets the passkey be named, and keeps the name', async ({ page }) => {
		const who = account('Lux');
		const authenticator = await useAuthenticator(page, { prf: true });
		try {
			await signUp(page, who);
			await addPasskey(page, who.password);
			await page.locator('wa-input[data-field="passkeyName"] input').fill('Work laptop');
			await finishNaming(page);

			await page.reload();
			await expect(page.getByText('Work laptop')).toBeVisible();
		} finally {
			await authenticator.forget();
		}
	});

	/** Removing a passkey takes its wrap with it, so nothing stale is handed out. */
	test('removing a passkey removes its wrap', async ({ page }) => {
		const who = account('Mo');
		const authenticator = await useAuthenticator(page, { prf: true });
		try {
			await signUp(page, who);
			await addPasskey(page, who.password);
			await finishNaming(page);
			expect(await wrapTypes(page)).toEqual(['passkey-prf', 'password']);

			await page.getByRole('button', { name: 'Remove' }).click();
			await expect(page.getByText('You have no passkeys yet.')).toBeVisible();
			expect(await wrapTypes(page)).toEqual(['password']);
		} finally {
			await authenticator.forget();
		}
	});
});

test.describe('signing in with a passkey', () => {
	for (const prf of [true, false]) {
		test(`unlocks straight away ${prf ? 'with PRF' : 'through the user handle'}`, async ({
			page
		}) => {
			const who = account(prf ? 'Nell' : 'Otto');
			const authenticator = await useAuthenticator(page, { prf });
			try {
				await signUp(page, who);
				await addPasskey(page, who.password);
				await finishNaming(page);
				await logOut(page);

				await page.goto('/login');
				await signInWithPasskeyHere(page);
				// With nowhere else to go, the same default as a password sign-in.
				await page.waitForURL('/home');
				expect(await deviceHoldsKey(page)).toBe(true);
			} finally {
				await authenticator.forget();
			}
		});
	}

	/**
	 * The heart of the user-handle wrap's guarantee, and of PRF's: the secret a
	 * ceremony hands the page is never posted to the server.
	 */
	test('never sends the user handle or the PRF output to the server', async ({ page }) => {
		const who = account('Pip');
		const authenticator = await useAuthenticator(page, { prf: true });
		const bodies = recordCeremonyBodies(page);
		try {
			await signUp(page, who);
			await addPasskey(page, who.password);
			await finishNaming(page);
			await logOut(page);
			await page.goto('/login');
			await signInWithPasskeyHere(page);

			expect(bodies.length).toBeGreaterThanOrEqual(2);
			for (const body of bodies) {
				expect(body).not.toContain('userHandle');
				expect(body).not.toContain('clientExtensionResults');
				expect(body).not.toContain('"prf"');
			}
		} finally {
			await authenticator.forget();
		}
	});

	/**
	 * A cleared browser is sent back to sign in, and a passkey is all it takes
	 * to come back where the user was, with the key.
	 */
	test('brings a cleared browser back with one touch', async ({ page }) => {
		const who = account('Quil');
		const authenticator = await useAuthenticator(page, { prf: false });
		try {
			await signUp(page, who);
			await addPasskey(page, who.password);
			await finishNaming(page);

			await evictKeyStorage(page);
			await page.goto('/home/tasks');
			await expectSentToSignIn(page, '/home/tasks');

			await signInWithPasskeyHere(page);
			await page.waitForURL('/home/tasks');
			expect(await deviceHoldsKey(page)).toBe(true);
		} finally {
			await authenticator.forget();
		}
	});

	/** The end-to-end point: a message written before is readable after. */
	test('reads the history after a passkey sign-in', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		const authenticator = await useAuthenticator(ada.page, { prf: true });
		const secret = 'written before the passkey sign-in';
		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await jun.page.goto('/home');
			await openBoard(jun.page, ada.who.name);
			await writeThread(jun.page, secret);
			const threadPath = new URL(jun.page.url()).pathname;

			await addPasskey(ada.page, ada.who.password);
			await finishNaming(ada.page);
			await logOut(ada.page);
			await ada.page.goto('/login');
			await signInWithPasskeyHere(ada.page);

			await ada.page.goto(threadPath);
			await expect(ada.page.getByText(secret)).toBeVisible();
		} finally {
			await authenticator.forget();
			await ada.close();
			await jun.close();
		}
	});
});

test.describe('the messages screens without a key', () => {
	/**
	 * Never ciphertext presented as content: while the key is not here, the
	 * board and the thread show a placeholder, and the app sends the user to
	 * sign in.
	 */
	test('send the user to sign in rather than showing ciphertext', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		const secret = 'the thing that must not be rendered as an ellipsis';
		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await ada.page.goto('/home');
			await openBoard(ada.page, jun.who.name);
			await writeThread(ada.page, secret);
			const threadPath = new URL(ada.page.url()).pathname;

			await evictKeyStorage(ada.page);
			await ada.page.goto(threadPath);
			await expectSentToSignIn(ada.page, threadPath);
			await expect(ada.page.getByText('…', { exact: true })).toHaveCount(0);
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});
