import { type Browser, expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { createInvite, newSide, signUp } from './helpers';

/**
 * Link previews: the Open Graph tags a chat app builds its card from when a
 * link is pasted, above all a partner invite. See `ShareMeta.svelte`.
 *
 * Read with JavaScript off and no cookies, because that is how a previewer
 * sees the page — so this checks the server-rendered HTML, which is all it
 * ever gets.
 */

async function asPreviewer(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
	const context = await browser.newContext({ javaScriptEnabled: false });
	return { page: await context.newPage(), close: () => context.close() };
}

function og(page: Page, property: string): Promise<string | null> {
	return page.locator(`head meta[property="og:${property}"]`).getAttribute('content');
}

/** The card is absolute (previewers need that) and actually served. */
async function expectCard(page: Page): Promise<void> {
	const image = await og(page, 'image');
	expect(image).toBe(new URL('/og-image.jpg', page.url()).href);
	const response = await page.request.get(image ?? '');
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toBe('image/jpeg');
	await expect(page.locator('head meta[name="twitter:card"]')).toHaveAttribute(
		'content',
		'summary_large_image'
	);
}

test.describe('link previews', () => {
	test("an invite's preview names who sent it", async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const previewer = await asPreviewer(browser);

		try {
			await signUp(ada.page, ada.who);
			await ada.page.waitForURL('**/home');
			const link = await createInvite(ada.page, {
				partnerName: 'Jun',
				yourName: 'Ada',
				control: 'mix'
			});

			await previewer.page.goto(link);
			expect(await og(previewer.page, 'title')).toBe('Ada wants to add you as a partner');
			expect(await og(previewer.page, 'description')).toContain('You can still say no.');
			await expect(previewer.page).toHaveTitle('Ada wants to add you as a partner · Bound Up');
			await expectCard(previewer.page);
		} finally {
			await Promise.all([ada.close(), previewer.close()]);
		}
	});

	test("a dead invite's preview says so, without naming anyone", async ({ browser }) => {
		const previewer = await asPreviewer(browser);
		try {
			await previewer.page.goto('/invite/not-a-real-token');
			expect(await og(previewer.page, 'title')).toBe("This invite link doesn't work");
			await expectCard(previewer.page);
		} finally {
			await previewer.close();
		}
	});

	test('the landing page and roadmap carry the card too', async ({ browser }) => {
		const previewer = await asPreviewer(browser);
		try {
			await previewer.page.goto('/');
			expect(await og(previewer.page, 'title')).toBe('Bound Up');
			await expectCard(previewer.page);

			await previewer.page.goto('/roadmap');
			expect(await og(previewer.page, 'title')).toBe('Bound Up roadmap');
			await expectCard(previewer.page);
		} finally {
			await previewer.close();
		}
	});
});
