import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { waitForHydration } from './helpers';

/**
 * The app-wide look from src/lib/theme.css: the landing page's wash, texture
 * and type on every page, and the landing page itself left to its own effects.
 *
 * At this level because what is under test is the cascade on a real page —
 * the theme's layer against Web Awesome's, the class on <html>, a pseudo-element
 * switched off by a custom property one page sets — none of which a component
 * rendered in a test frame goes through. See docs/theme.md.
 */

/** The computed style of a pseudo-element of <body>, for the properties asked. */
function bodyPseudo(page: Page, pseudo: '::before' | '::after', props: string[]) {
	return page.evaluate(
		([which, names]) => {
			const style = getComputedStyle(document.body, which);
			return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
		},
		[pseudo, props] as const
	);
}

test('a page other than the landing page is textured, dark, and titled in the display face', async ({
	page
}) => {
	await page.goto('/login');
	await waitForHydration(page);

	// Always dark, whatever the system asks for: the light theme would put
	// near-black text on the rust wash.
	await expect(page.locator('html')).toHaveClass(/\bwa-dark\b/);

	for (const pseudo of ['::before', '::after'] as const) {
		expect(await bodyPseudo(page, pseudo, ['display', 'mix-blend-mode'])).toEqual({
			display: 'block',
			'mix-blend-mode': 'soft-light'
		});
	}

	const title = page.getByRole('heading', { level: 1, name: 'Log in' });
	await expect(title).toHaveCSS('font-family', /Muddy Tractor/);
	// The landing page's amber, as its title is.
	await expect(title).toHaveCSS('color', 'rgb(255, 172, 0)');
});

test('the dark scheme holds even when the system asks for light', async ({ browser }) => {
	const context = await browser.newContext({ colorScheme: 'light' });
	try {
		const page = await context.newPage();
		await page.goto('/login');
		await waitForHydration(page);
		await expect(page.locator('html')).toHaveClass(/\bwa-dark\b/);
	} finally {
		await context.close();
	}
});

test('the landing page switches the CSS texture off, since its effects draw their own', async ({
	page
}) => {
	await page.goto('/');
	await waitForHydration(page);

	// Drawn twice, the grain doubled and the halftone moiréd against itself.
	for (const pseudo of ['::before', '::after'] as const) {
		expect(await bodyPseudo(page, pseudo, ['display'])).toEqual({ display: 'none' });
	}
});
