import { expect, test } from './fixtures';
import {
	account,
	clickWaButton,
	createInvite,
	fillRichText,
	newSide,
	signUp,
	typeRichText,
	waitForHydration
} from './helpers';

test.describe('rewards', () => {
	/**
	 * A title typed before the description has to survive it.
	 *
	 * `RewardForm` used to hold its native fields with `value={…}`. Svelte does
	 * not write an input's value while hydrating, so the first re-run of the
	 * form's template — which typing in the description causes — wrote the
	 * server's value back over the field. The add page lost the title; the edit
	 * page silently reverted it to the stored one.
	 *
	 * Only a page loaded in full is hydrated, so both are reached with `goto`:
	 * the click-through from /home/rewards the other tests use is a client-side
	 * navigation, which mounts instead, and never showed it.
	 */
	test('keeps a title typed before the description, adding and editing', async ({ page }) => {
		await signUp(page, account('Ada'));

		await page.goto('/home/rewards/add');
		const title = page.locator('.add-form input[name="title"]');
		await waitForHydration(page);
		await title.fill('Long bath');
		await typeRichText(page.locator('.add-form'), 'No interruptions');
		await expect(title).toHaveValue('Long bath');

		await page.locator('.add-form input[name="cost"]').fill('2');
		await clickWaButton(page, 'Add reward');
		await page.waitForURL(/\/home\/rewards$/);

		const edit = await page.getByRole('link', { name: 'Edit Long bath' }).getAttribute('href');
		if (!edit) throw new Error('expected an edit link');
		await page.goto(edit);
		await waitForHydration(page);
		// Seeded from the stored reward, which a `defaultValue` still renders.
		await expect(title).toHaveValue('Long bath');
		await title.fill('Longer bath');
		await typeRichText(page.locator('.add-form'), ' and a book');
		await expect(title).toHaveValue('Longer bath');
	});

	test('a user can manage and claim self rewards from home', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');

		try {
			await signUp(ada.page, ada.who);
			await ada.page.waitForURL('**/home');
			await ada.page.getByRole('link', { name: 'Rewards' }).click();
			await ada.page.waitForURL(/\/home\/rewards$/);

			await ada.page.getByRole('button', { name: 'Edit your reward credits' }).click();
			await ada.page.getByLabel('Set your reward credits').fill('4');
			await ada.page.getByRole('button', { name: 'Save your reward credits' }).click();
			await expect(ada.page.locator('.self .title-row')).toContainText('Your Rewards');
			await expect(ada.page.locator('.self .title-row')).toContainText('Credits: 4');

			await ada.page.getByRole('link', { name: 'Add a reward' }).click();
			await ada.page.waitForURL(/\/home\/rewards\/add$/);
			await waitForHydration(ada.page);
			await ada.page.locator('.add-form input[name="title"]').first().fill('Long bath');
			await fillRichText(ada.page.locator('.add-form'), 'No interruptions');
			await ada.page.locator('.add-form input[name="cost"]').first().fill('2');
			await clickWaButton(ada.page, 'Add reward');
			await ada.page.waitForURL(/\/home\/rewards$/);

			await expect(ada.page.getByRole('heading', { name: 'Long bath' })).toBeVisible();
			await clickWaButton(ada.page, 'Claim');
			await expect(ada.page.locator('.self .title-row')).toContainText('Credits: 2');

			await ada.page.getByRole('link', { name: 'Claim history' }).click();
			await ada.page.waitForURL(/\/home\/rewards\/history$/);
			await expect(ada.page.getByText('Long bath')).toBeVisible();
			await expect(ada.page.getByRole('heading', { name: 'Self reward history' })).toBeVisible();
		} finally {
			await ada.close();
		}
	});

	test('a controller can create partner rewards and the other side can claim them from home', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await signUp(ada.page, ada.who);
			await ada.page.waitForURL('**/home');
			await ada.page.getByRole('link', { name: 'Rewards' }).click();
			await ada.page.waitForURL(/\/home\/rewards$/);
			const link = await createInvite(ada.page, {
				partnerName: 'Jun',
				yourName: 'Ada',
				control: 'them'
			});

			await signUp(jun.page, jun.who);
			await jun.page.waitForURL('**/home');
			await jun.page.goto(link);
			await clickWaButton(jun.page, 'Accept and link');
			await jun.page.waitForURL(/\/partner\/[0-9a-f-]{36}$/);

			await jun.page.getByRole('link', { name: 'Rewards' }).click();
			await jun.page.waitForURL(/\/rewards$/);
			await jun.page.getByRole('button', { name: "Edit Ada's reward credits" }).click();
			await jun.page.getByLabel("Set Ada's reward credits").fill('4');
			await jun.page.getByRole('button', { name: "Save Ada's reward credits" }).click();

			await jun.page.getByRole('link', { name: 'Add a reward' }).click();
			await jun.page.waitForURL(/\/rewards\/add$/);
			await waitForHydration(jun.page);
			await jun.page.locator('.add-form input[name="title"]').fill('Tea service');
			await fillRichText(jun.page.locator('.add-form'), 'Fresh pot first');
			await jun.page.locator('.add-form input[name="cost"]').fill('2');
			await clickWaButton(jun.page, 'Add reward');
			await jun.page.waitForURL(/\/rewards$/);
			await expect(jun.page.getByRole('heading', { name: 'Tea service' })).toBeVisible();

			await ada.page.goto('/home/rewards');
			await expect(ada.page.getByRole('heading', { name: 'Jun' })).toBeVisible();
			await expect(ada.page.locator('.partner .title-row').first()).toContainText('Jun');
			await expect(ada.page.locator('.partner .title-row').first()).toContainText('Credits: 4');
			await clickWaButton(ada.page, 'Claim');
			await expect(ada.page.locator('.partner .title-row').first()).toContainText('Credits: 2');

			await ada.page.getByRole('link', { name: 'Open full rewards' }).click();
			await ada.page.waitForURL(/\/rewards$/);
			await ada.page.getByRole('link', { name: 'Claim history' }).click();
			await ada.page.waitForURL(/\/rewards\/history$/);
			await expect(ada.page.getByText('Claimed by you')).toBeVisible();
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});
