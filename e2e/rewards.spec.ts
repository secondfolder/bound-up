import { expect } from '@playwright/test';
import { test } from './fixtures';
import {
	account,
	clickWaButton,
	closeCredits,
	createInvite,
	creditsRow,
	fillRichText,
	newAccount,
	newSide,
	openCredits,
	settle,
	startAdding,
	typeRichText,
	waitForHydration,
	waitForSheetClosed
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
	 * the click-through from /rewards the other tests use is a client-side
	 * navigation, which mounts instead, and never showed it.
	 */
	test('keeps a title typed before the description, adding and editing', async ({ page }) => {
		await newAccount(page, account('Ada'));

		await page.goto('/rewards/add');
		const title = page.locator('.add-form wa-input[name="title"] input');
		await waitForHydration(page);
		await title.fill('Long bath');
		await typeRichText(page.locator('.add-form'), 'No interruptions');
		await expect(title).toHaveValue('Long bath');

		await page.locator('.add-form wa-input[name="cost"] input').fill('2');
		await clickWaButton(page, 'Add reward');
		await waitForSheetClosed(page, /\/rewards$/);

		// Edit is in the reward's detail, which its row opens.
		await waitForHydration(page);
		await page.getByRole('button', { name: /^Long bath/ }).click();
		const edit = await page
			.locator('wa-dialog')
			.getByRole('link', { name: 'Edit' })
			.getAttribute('href');
		if (!edit) {
			throw new Error('expected an edit link');
		}
		await page.goto(edit);
		await waitForHydration(page);
		// Seeded from the stored reward, which a `defaultValue` still renders.
		await expect(title).toHaveValue('Long bath');
		await title.fill('Longer bath');
		await typeRichText(page.locator('.add-form'), ' and a book');
		await expect(title).toHaveValue('Longer bath');
	});

	/**
	 * A link tapped while a save is still answering has to be followed.
	 *
	 * SvelteKit's `invalidate()` takes over from a navigation already under way
	 * and re-runs the page the navigation was leaving, so a save's refresh
	 * landing mid-navigation dropped the tap: the page stayed where it was,
	 * with no error anywhere. It surfaced as this file's partner test, now and
	 * then under `wrangler dev`, where the action answers slowly enough to land
	 * inside the navigation. Here the two are ordered by hand: the save is held
	 * until the navigation has asked for its data, and that data until the
	 * save has answered and its refresh begun.
	 */
	test('a link followed while a save is answering is not dropped by its refresh', async ({
		page
	}) => {
		await newAccount(page, account('Ada'));
		await page.goto('/rewards');
		await waitForHydration(page);

		let navigationAsked: () => void = () => undefined;
		const navigationStarted = new Promise<void>((resolve) => {
			navigationAsked = resolve;
		});
		let saveAnswered: () => void = () => undefined;
		const saved = new Promise<void>((resolve) => {
			saveAnswered = resolve;
		});
		await page.route(
			(url) => url.search === '?/setCredits',
			async (route) => {
				await navigationStarted;
				const response = await route.fetch();
				await route.fulfill({ response });
				saveAnswered();
			}
		);
		// The refresh SvelteKit's own `update()` sends: of the page being left.
		const refreshed = page
			.waitForRequest((request) => new URL(request.url()).pathname === '/rewards/__data.json')
			.catch(() => undefined);
		let held = false;
		await page.route('**/rewards/add/__data.json*', async (route) => {
			if (!held) {
				held = true;
				navigationAsked();
				await saved;
				// Until the save's refresh has begun, or, now that it waits for
				// the navigation, until the page has done all it will with the answer.
				await Promise.race([refreshed, settle(page)]);
			}
			await route.continue();
		});

		const credits = await openCredits(page);
		await credits.getByRole('button', { name: 'Edit your reward credits' }).click();
		await credits.getByLabel('Set your reward credits').fill('4');
		await credits.getByRole('button', { name: 'Save your reward credits' }).click();
		// Straight off the sheet and onto adding, while the save answers.
		await closeCredits(page);
		await startAdding(page, 'Add a reward');

		await expect(page).toHaveURL(/\/rewards\/add$/);
		await expect(page.locator('.add-form')).toBeVisible();
		// And the refresh still happened: the list under the sheet has the new balance.
		await expect(page.locator('.credits-chip')).toContainText('You 4');
	});

	test('a user can manage and claim self rewards from Today', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.waitForURL('**/today');
			await ada.page.getByRole('link', { name: 'Rewards', exact: true }).click();
			await ada.page.waitForURL(/\/rewards$/);

			const credits = await openCredits(ada.page);
			await credits.getByRole('button', { name: 'Edit your reward credits' }).click();
			await credits.getByLabel('Set your reward credits').fill('4');
			await credits.getByRole('button', { name: 'Save your reward credits' }).click();
			await expect(creditsRow(credits, 'Me')).toContainText(/You\s*4/);
			await closeCredits(ada.page);
			await expect(ada.page.locator('.credits-chip')).toContainText('You 4');

			await startAdding(ada.page, 'Add a reward');
			await ada.page.waitForURL(/\/rewards\/add$/);
			await waitForHydration(ada.page);
			await ada.page.locator('.add-form wa-input[name="title"] input').first().fill('Long bath');
			await fillRichText(ada.page.locator('.add-form'), 'No interruptions');
			await ada.page.locator('.add-form wa-input[name="cost"] input').first().fill('2');
			await clickWaButton(ada.page, 'Add reward');
			await waitForSheetClosed(ada.page, /\/rewards$/);

			// Claimed only from the reward's detail: a second, deliberate tap.
			const within = ada.page.locator('.item-group').filter({ hasText: 'Within reach' });
			await waitForHydration(ada.page);
			await within.getByRole('button', { name: /^Long bath/ }).click();
			await expect(ada.page.locator('wa-dialog')).toContainText('2 credits left');
			await clickWaButton(ada.page, /^Claim · 2 credits$/);
			await expect(ada.page.locator('.credits-chip')).toContainText('You 2');

			await ada.page.getByRole('link', { name: 'Claimed rewards' }).click();
			await ada.page.waitForURL(/\/rewards\/history$/);
			await expect(ada.page.locator('wa-dialog').getByText('Long bath')).toBeVisible();
			await expect(ada.page.getByRole('heading', { name: 'Reward history' })).toBeVisible();
		} finally {
			await ada.close();
		}
	});

	test('a controller can create partner rewards and the other side can claim them from Today', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await newAccount(ada.page, ada.who);
			await ada.page.waitForURL('**/today');
			await ada.page.getByRole('link', { name: 'Rewards', exact: true }).click();
			await ada.page.waitForURL(/\/rewards$/);
			const link = await createInvite(ada.page, {
				partnerName: 'Jun',
				yourName: 'Ada',
				control: 'them'
			});

			await newAccount(jun.page, jun.who);
			await jun.page.waitForURL('**/today');
			await jun.page.goto(link);
			await clickWaButton(jun.page, 'Accept and link');
			// Into Today, in the new partnership's context.
			await jun.page.waitForURL((url) => url.pathname === '/today');

			// After hydration, so the card sets the partnership's context.
			await waitForHydration(jun.page);
			await jun.page.getByRole('link', { name: 'Rewards', exact: true }).click();
			await jun.page.waitForURL(/\/rewards$/);
			const credits = await openCredits(jun.page);
			await credits.getByRole('button', { name: "Edit Ada's reward credits" }).click();
			await credits.getByLabel("Set Ada's reward credits").fill('4');
			await credits.getByRole('button', { name: "Save Ada's reward credits" }).click();
			await expect(creditsRow(credits, 'Ada')).toContainText(/Ada\s*4/);
			await closeCredits(jun.page);

			await startAdding(jun.page, 'Add a reward');
			await jun.page.waitForURL(/\/rewards\/add$/);
			await waitForHydration(jun.page);
			await jun.page.locator('.add-form wa-input[name="title"] input').fill('Tea service');
			await fillRichText(jun.page.locator('.add-form'), 'Fresh pot first');
			await jun.page.locator('.add-form wa-input[name="cost"] input').fill('2');
			await clickWaButton(jun.page, 'Add reward');
			await waitForSheetClosed(jun.page, /\/rewards$/);
			// Jun set it, against Ada's balance: Jun sees whether Ada can afford it.
			const affordable = jun.page.locator('.item-group').filter({ hasText: 'Ada can afford' });
			await expect(affordable.getByRole('button', { name: /^Tea service/ })).toBeVisible();

			// Ada never switched, so /rewards is Everyone: her own wallet, then
			// the one Jun keeps for her, never one merged list.
			await ada.page.goto('/rewards');
			await expect(ada.page.getByRole('heading', { name: 'From Jun' })).toBeVisible();
			// In Everyone her balances are in the credits sheet, a row per space.
			const adas = await openCredits(ada.page);
			await expect(creditsRow(adas, 'Jun')).toContainText(/You\s*4/);
			await closeCredits(ada.page);
			const teaService = ada.page.getByRole('button', { name: /^Tea service/ });
			await waitForHydration(ada.page);
			await teaService.click();
			await clickWaButton(ada.page, /^Claim · 2 credits$/);
			await expect(ada.page.locator('wa-dialog')).toHaveCount(0);
			const after = await openCredits(ada.page);
			await expect(creditsRow(after, 'Jun')).toContainText(/You\s*2\b/);
			await closeCredits(ada.page);

			// The history follows the context too, and says who claimed it.
			await ada.page.getByRole('link', { name: 'Claimed rewards' }).click();
			await ada.page.waitForURL(/\/rewards\/history$/);
			await expect(ada.page.getByText('Claimed by you')).toBeVisible();
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});
