import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import {
	clickWaButton,
	createInvite,
	fillRichText,
	newSide,
	openBoard,
	reply,
	settle,
	signUp,
	waitForHydration,
	writeThread
} from './helpers';

/**
 * Regenerates the screenshots in the landing page's features section
 * (`static/landing/`), with `npm run screenshots:landing`.
 *
 * Not a test: it asserts only enough to know each screen is ready before it
 * is captured, and `playwright.config.ts` does not pick it up. It stages two
 * linked accounts through the real UI rather than seeding the database,
 * because messages are encrypted in the browser and cannot be written from
 * outside it — and a screenshot of the real flow is the point.
 *
 * The copy here is published on the landing page, so it is kept suggestive
 * rather than explicit: the page is public and its screenshots end up in link
 * previews and search results.
 */

const OUT_DIR = process.env.LANDING_SCREENSHOT_DIR ?? path.resolve('static/landing');

/** Phone-sized, as most people use the app; 2× so it stays crisp when scaled. */
const VIEWPORT = { width: 390, height: 780 };

async function capture(page: Page, name: string) {
	await waitForHydration(page);
	await page.evaluate(() => document.fonts.ready);
	await settle(page);
	await page.screenshot({ path: path.join(OUT_DIR, `${name}.jpg`), type: 'jpeg', quality: 82 });
}

test('landing page feature screenshots', async ({ browser }) => {
	test.setTimeout(300_000);
	await mkdir(OUT_DIR, { recursive: true });

	// Riley is whose screens are shown; Morgan runs the dynamic.
	const riley = await newSide(browser, 'Riley', { viewport: VIEWPORT, deviceScaleFactor: 2 });
	const morgan = await newSide(browser, 'Morgan');

	try {
		await signUp(riley.page, riley.who);
		await riley.page.waitForURL('**/home');
		const link = await createInvite(riley.page, {
			partnerName: 'Morgan',
			yourName: 'Riley',
			partnerRole: 'Mistress',
			yourRole: 'pet',
			control: 'them'
		});

		await signUp(morgan.page, morgan.who);
		await morgan.page.waitForURL('**/home');
		await morgan.page.goto(link);
		await clickWaButton(morgan.page, 'Accept and link');
		await morgan.page.waitForURL(/\/partner\/[0-9a-f-]{36}$/);
		const partnerPage = morgan.page.url();

		const tasks: [string, string, string][] = [
			['Morning check-in', 'Message me before 9 to say good morning.', '1'],
			['Wear what I picked', 'The outfit on the bed. All day, no swaps.', '3'],
			['Write me a letter', 'One page on what you want this weekend.', '2'],
			['Kneel at the door', 'When you hear my key. Eyes down until I say.', '2']
		];
		for (const [title, body, credits] of tasks) {
			await morgan.page.goto(`${partnerPage}/tasks/add`);
			await waitForHydration(morgan.page);
			await morgan.page.locator('input[name="title"]').fill(title);
			await fillRichText(morgan.page.locator('.task-form'), body);
			await morgan.page.locator('input[name="creditsAwarded"]').fill(credits);
			await morgan.page.locator('textarea[name="completionMessagesText"]').fill('Good pet.');
			await clickWaButton(morgan.page, 'Add task');
			await morgan.page.waitForURL(/\/tasks$/);
		}

		const rewards: [string, string, string][] = [
			['Pick the movie', 'Your choice tonight, no complaints from me.', '2'],
			['Breakfast in bed', 'Served, not made.', '4'],
			['A night off', 'No tasks, no rules, until morning.', '8']
		];
		for (const [title, body, cost] of rewards) {
			await morgan.page.goto(`${partnerPage}/rewards/add`);
			await waitForHydration(morgan.page);
			await morgan.page.locator('.add-form input[name="title"]').first().fill(title);
			await fillRichText(morgan.page.locator('.add-form'), body);
			await morgan.page.locator('.add-form input[name="cost"]').first().fill(cost);
			await clickWaButton(morgan.page, 'Add reward');
			await morgan.page.waitForURL(/\/rewards$/);
		}

		// Credits to spend, earned the way they are in the app.
		await riley.page.goto('/home/tasks');
		await waitForHydration(riley.page);
		for (const title of ['Wear what I picked', 'Write me a letter']) {
			await riley.page
				.getByRole('article')
				.filter({ hasText: title })
				.getByRole('button', { name: 'Complete' })
				.click();
			await expect(riley.page.getByText('Task completed.')).toBeVisible();
			await riley.page.reload();
			await waitForHydration(riley.page);
		}

		await openBoard(morgan.page, 'Riley');
		await writeThread(morgan.page, 'How did the outfit go today?');
		await openBoard(riley.page, 'Morgan');
		await riley.page.getByRole('link', { name: /^Unread message/ }).click();
		await riley.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
		await reply(riley.page, 'Wore it all day like you said. Got a few looks at lunch 😳');
		await expect(morgan.page.getByText(/Got a few looks/)).toBeVisible();
		await reply(morgan.page, 'Good. Three credits, well earned.');
		await expect(riley.page.getByText(/well earned/)).toBeVisible();
		await capture(riley.page, 'messages');

		// Riley's view of the partnership, from the thread's own URL.
		const rileysPartnerPage = riley.page.url().replace(/\/messages\/.*$/, '');

		await riley.page.goto(rileysPartnerPage);
		await capture(riley.page, 'partner');

		await riley.page.goto(`${rileysPartnerPage}/tasks`);
		await capture(riley.page, 'tasks');

		await riley.page.goto(`${rileysPartnerPage}/rewards`);
		await capture(riley.page, 'rewards');
	} finally {
		await riley.close();
		await morgan.close();
	}
});
