import { expect } from '@playwright/test';
import { test } from './fixtures';
import {
	clickWaButton,
	contextNames,
	createInvite,
	fillPassword,
	LOG_IN_BUTTON,
	logOut,
	navTabs,
	newAccount,
	newSide,
	signUp,
	waitForHydration
} from './helpers';

/**
 * The whole partner feature over HTTP, in a real browser.
 *
 * Each test uses two browser contexts so the two accounts hold genuinely
 * separate session cookies — signing out and back in inside one context would
 * pass while hiding a cookie bug.
 */

test.describe('linking two accounts', () => {
	test('an invite survives the whole round trip, and both sides end up linked', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.waitForURL('**/today');

			// A brand new account has the five places, and a switcher offering
			// only Me (and "Add partner", a link): with nobody else, Everyone
			// would just be Me.
			expect(await navTabs(ada.page)).toEqual([
				'Today',
				'Tasks',
				'Notebook',
				'Messages',
				'Settings'
			]);
			expect(await contextNames(ada.page)).toEqual(['Me']);

			const link = await createInvite(ada.page, {
				partnerName: 'Jun',
				yourName: 'Ada',
				partnerRole: 'sub',
				yourRole: 'dom',
				control: 'mix'
			});

			// It shows as pending, and still not in the switcher — there is
			// nobody to show until it is accepted.
			await ada.page.goto('/settings/partners');
			await expect(ada.page.getByText('Waiting for them to accept')).toBeVisible();
			await ada.page.goto('/today');
			expect(await contextNames(ada.page)).toEqual(['Me']);

			// Jun opens the link cold, with no account at all.
			await jun.page.goto(link);
			await expect(
				jun.page.getByRole('heading', { name: 'Ada wants to add you as a partner' })
			).toBeVisible();

			await jun.page.getByRole('link', { name: 'Create an account' }).click();
			await jun.page.waitForURL(/\/signup\?redirectTo=/);
			await signUp(jun.page, jun.who, jun.page.url());

			// Signing up must land back on the invite, not on Today.
			await jun.page.waitForURL(/\/invite\//);
			await expect(
				jun.page.getByRole('heading', { name: 'Ada wants to add you as a partner' })
			).toBeVisible();

			// Control is shared, so Jun may rewrite the names before accepting.
			await expect(jun.page.locator('wa-input[name="partnerName"]')).toBeVisible();
			await clickWaButton(jun.page, 'Accept and link');
			// Into Today, in the new partnership's context: its header is Ada.
			await jun.page.waitForURL((url) => url.pathname === '/today');
			await expect(
				jun.page.getByRole('heading', { level: 2, name: 'Ada', exact: true })
			).toBeVisible();
			await expect(jun.page.getByRole('button', { name: /^Showing Ada\./ })).toBeVisible();
			await expect(jun.page.getByText("Jun's dom")).toBeVisible();

			// Each side sees the other under the name that side chose.
			expect(await contextNames(jun.page)).toEqual(['Everyone', 'Me', 'Ada']);
			await ada.page.goto('/today');
			expect(await contextNames(ada.page)).toEqual(['Everyone', 'Me', 'Jun']);

			// The link is spent.
			await jun.page.goto(link);
			await expect(jun.page.getByRole('heading', { name: "This link doesn't work" })).toBeVisible();
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	test('the accepter cannot edit the names when the inviter keeps control', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.waitForURL('**/today');
			const link = await createInvite(ada.page, {
				partnerName: 'Jun',
				yourName: 'Ada',
				control: 'me'
			});

			await newAccount(jun.page, jun.who);
			await jun.page.waitForURL('**/today');
			await jun.page.goto(link);

			// Displayed, not editable — the requirement for "they're in control".
			// The control question is not shown at all; the page instead says what
			// accepting would hand over.
			await expect(jun.page.locator('wa-input[name="partnerName"]')).toHaveCount(0);
			await expect(jun.page.getByText('Ada', { exact: true })).toBeVisible();
			// Matched in pieces: the sentence wraps across lines in the source, and
			// Playwright matches regexes against the un-normalised text.
			await expect(jun.page.getByText(/they'll be able to set/)).toBeVisible();
			await expect(jun.page.getByText(/tasks, rewards and punishments for you/)).toBeVisible();
			await expect(jun.page.locator('input[name="control"][type="radio"]')).toHaveCount(0);

			await clickWaButton(jun.page, 'Accept and link');
			await jun.page.waitForURL((url) => url.pathname === '/today');

			// And the settings screen, linked from Today's header, offers no
			// edit form either.
			await jun.page.getByRole('link', { name: 'Connection settings' }).click();
			await expect(jun.page.getByText("They're in control of this link")).toBeVisible();
			// Exact: the page also has the colour's "Save colour", which is Jun's own.
			await expect(jun.page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
			// ...but leaving is always available.
			await expect(jun.page.getByRole('button', { name: 'Disconnect' })).toBeVisible();
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	test('an anonymous visitor is sent to log in and comes back to the invite', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await newAccount(jun.page, jun.who);
			await logOut(jun.page);

			await newAccount(ada.page, ada.who);
			await ada.page.waitForURL('**/today');
			const link = await createInvite(ada.page, {
				partnerName: 'Jun',
				yourName: 'Ada',
				control: 'mix'
			});

			await jun.page.goto(link);
			await jun.page.getByRole('link', { name: 'Log in to accept' }).click();
			await jun.page.waitForURL(/\/login\?redirectTo=/);

			await jun.page.locator('wa-input[name="email"] input').fill(jun.who.email);
			// Through the helper: the password box carries no `name`, only
			// `data-field` — see PasswordField.svelte.
			await fillPassword(jun.page, 'password', jun.who.password);
			await clickWaButton(jun.page, LOG_IN_BUTTON);

			// Logging in must return them to the invite rather than to Today.
			await jun.page.waitForURL(/\/invite\//);
			await expect(jun.page.getByRole('button', { name: 'Accept and link' })).toBeVisible();
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});

test.describe('managing a link', () => {
	test('disconnecting removes the partner from both switchers', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.waitForURL('**/today');
			const link = await createInvite(ada.page, {
				partnerName: 'Jun',
				yourName: 'Ada',
				control: 'me'
			});

			await newAccount(jun.page, jun.who);
			await jun.page.waitForURL('**/today');
			await jun.page.goto(link);
			await clickWaButton(jun.page, 'Accept and link');
			await jun.page.waitForURL((url) => url.pathname === '/today');
			expect(await contextNames(jun.page)).toEqual(['Everyone', 'Me', 'Ada']);

			// Jun does not hold control, and must still be able to leave.
			await jun.page.goto('/settings/partners');
			await jun.page.getByRole('main').getByRole('link', { name: /Ada/ }).click();
			jun.page.once('dialog', (dialog) => dialog.accept());
			await clickWaButton(jun.page, 'Disconnect');
			await jun.page.waitForURL('**/settings/partners');

			await expect(jun.page.getByText('You have no partners yet.')).toBeVisible();
			// Jun's device was left in that partnership's context, which no
			// longer exists: an ambient context falls back to Everyone, never a 404,
			// which with no partner left is shown as Me.
			await jun.page.goto('/today');
			expect(await contextNames(jun.page)).toEqual(['Me']);
			await expect(jun.page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

			await ada.page.goto('/today');
			expect(await contextNames(ada.page)).toEqual(['Me']);
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	test('the inviter can cancel a pending invite, which kills the link', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.waitForURL('**/today');
			const link = await createInvite(ada.page, {
				partnerName: 'Jun',
				yourName: 'Ada',
				control: 'mix'
			});

			ada.page.once('dialog', (dialog) => dialog.accept());
			await clickWaButton(ada.page, 'Cancel invite');
			await ada.page.waitForURL('**/settings/partners');
			await expect(ada.page.getByText('You have no partners yet.')).toBeVisible();

			await jun.page.goto(link);
			await expect(jun.page.getByRole('heading', { name: "This link doesn't work" })).toBeVisible();
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	test('renewing an invite replaces the old link', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.waitForURL('**/today');
			const first = await createInvite(ada.page, {
				partnerName: 'Jun',
				yourName: 'Ada',
				control: 'mix'
			});

			await clickWaButton(ada.page, 'Create a new link');
			await expect(ada.page.getByLabel('Invite link')).not.toHaveValue(first);
			const second = await ada.page.getByLabel('Invite link').inputValue();

			await jun.page.goto(first);
			await expect(jun.page.getByRole('heading', { name: "This link doesn't work" })).toBeVisible();

			await jun.page.goto(second);
			await expect(
				jun.page.getByRole('heading', { name: 'Ada wants to add you as a partner' })
			).toBeVisible();
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	test('the controlling side can rename the partner, and the switcher follows', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.waitForURL('**/today');
			const link = await createInvite(ada.page, {
				partnerName: 'Jun',
				yourName: 'Ada',
				control: 'me'
			});

			await newAccount(jun.page, jun.who);
			await jun.page.waitForURL('**/today');
			await jun.page.goto(link);
			await clickWaButton(jun.page, 'Accept and link');
			await jun.page.waitForURL((url) => url.pathname === '/today');

			await ada.page.goto('/settings/partners');
			await ada.page.getByRole('main').getByRole('link', { name: /Jun/ }).click();
			// Before filling, not just before saving: hydration overwrites the field.
			await waitForHydration(ada.page);
			await ada.page.locator('wa-input[name="partnerName"] input').fill('Junie');
			// Not "Save colour", the other save on the page.
			await clickWaButton(ada.page, /^Save$/);

			// Saving goes back to the list, and the names are sealed again first.
			await ada.page.waitForURL((url) => url.pathname === '/settings/partners');
			await ada.page.goto('/today');
			expect(await contextNames(ada.page)).toEqual(['Everyone', 'Me', 'Junie']);

			// Jun's own switcher is unaffected: it shows what Jun calls Ada.
			await jun.page.goto('/today');
			expect(await contextNames(jun.page)).toEqual(['Everyone', 'Me', 'Ada']);
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});
