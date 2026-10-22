import { expect, type Locator, type Page } from '@playwright/test';
import { defined } from '../src/lib/testing/defined';
import { sql } from './db';
import { test } from './fixtures';
import {
	account,
	grantFeature,
	newAccount,
	switchOnDebugCookie,
	waitForHydration
} from './helpers';

/**
 * The Playroom and its IQ test.
 *
 * End to end because the test is a standalone public page — no session, no
 * app shell — whose history is either the account's (through the real auth
 * hook) or the device's (through real localStorage across a reload). The
 * question engine itself is unit-tested; here the score does not matter, so
 * every question is skipped.
 */

const SUB = "I'm a dumb sub but even I understand";
const MIN_FOR_SCORE = 12;

test.beforeEach(async ({ page }) => {
	// Never ask reddit from a test. The page is meant to work without pictures,
	// which is exactly what an empty feed exercises.
	await page.route('**/api/playroom/iq-test/media**', (route) =>
		route.fulfill({ json: { images: [], clips: [] } })
	);
	// Nor PMVHaven, whose videos every vibe's hypno now plays with porn.
	await stubPmvs(page);
});

/**
 * Press one of a porn item's buttons, as a pointer does: over the item
 * first, which is what shows them. Until then they take no pointer, and
 * Playwright checks what is under the point before it moves there.
 */
async function pressOverlay(control: Locator) {
	await control.locator('xpath=ancestor::div[contains(@class, "item")][1]').hover();
	await control.click();
}

function dialog(page: Page) {
	return page.locator('wa-dialog.setup');
}

/** Start as a sub from the setup dialog, skip enough for a score, and finish. */
async function takeTest(page: Page) {
	await waitForHydration(page);
	await expect(dialog(page)).toContainText('agreed to play');
	await dialog(page).getByRole('button', { name: SUB }).click();

	for (let i = 1; i <= MIN_FOR_SCORE; i += 1) {
		await expect(page.getByText(`Question ${i} of 36`)).toBeVisible();
		await page.getByRole('button', { name: 'Skip', exact: true }).click();
	}
	await page.getByRole('button', { name: 'Finish and see my score' }).click();
	await expect(page.getByTestId('iq-score')).toBeVisible();
}

/**
 * Answer every question there is — typed, chosen or memorised — until the end.
 * Right or wrong does not matter; getting through each kind of question does.
 */
async function answerEverything(page: Page) {
	const end = page.getByText("That's every question.");
	for (let step = 0; step < 100 && !(await end.isVisible()); step += 1) {
		const phase = await page.locator('section.question').getAttribute('data-phase');
		if (phase === 'memorise') {
			await page.getByRole('button', { name: "I've got them" }).click();
		} else if (await page.locator('section.question wa-input').count()) {
			await page.locator('section.question wa-input input').fill('1');
			await page
				.getByRole('button', { name: phase === 'interference' ? 'Next' : 'Answer' })
				.click();
		} else {
			// A choice's card or a board's square; for a tick-all, one, then Done.
			const done = page.getByRole('button', { name: 'Done', exact: true });
			const multi = (await done.count()) > 0;
			await page
				.locator('section.question')
				.locator('button.answer-card, [data-testid="board"] button')
				.first()
				.click();
			if (multi) {
				await done.click();
			}
		}
		// Each step replaces the question; wait for it rather than racing it.
		await expect(page.locator('section.question[data-phase]').or(end)).toBeVisible();
	}
	await expect(end).toBeVisible();
}

/** Silence as a WAV, half a second unless asked, standing in for a hypno's file. */
function silentWav(seconds = 0.5): Buffer {
	const rate = 8000;
	const samples = Math.round(rate * seconds);
	const buffer = Buffer.alloc(44 + samples * 2);
	buffer.write('RIFF', 0);
	buffer.writeUInt32LE(36 + samples * 2, 4);
	buffer.write('WAVE', 8);
	buffer.write('fmt ', 12);
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(1, 22);
	buffer.writeUInt32LE(rate, 24);
	buffer.writeUInt32LE(rate * 2, 28);
	buffer.writeUInt16LE(2, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write('data', 36);
	buffer.writeUInt32LE(samples * 2, 40);
	return buffer;
}

const hypnoFile = (n: number, fileType = 'loop') => ({
	uuid: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
	name: `Stub Hypno ${n}`,
	author: 'stubber',
	durationMs: 500,
	fileType,
	triggers: ['Good girl'],
	description: '',
	warnings: [],
	source: 'bambicloud',
	pageUrl: `https://bambicloud.com/file/${n}`,
	mediaUrl: `https://cdn.bambicloud.com/stub-${n}.wav`,
	plays: 0
});

/**
 * Stub the hypno endpoint and bambicloud's CDN, and record which categories
 * each request asked for. Random picks hand out file 1, 2, 3… in turn; a
 * search answers three files.
 */
async function stubHypnos(page: Page): Promise<string[]> {
	const asked: string[] = [];
	let next = 1;
	await page.route('**/api/playroom/iq-test/hypnos**', (route) => {
		const params = new URL(route.request().url()).searchParams;
		asked.push(params.get('categories') ?? '');
		let files: ReturnType<typeof hypnoFile>[];
		if (params.get('random') === '1') {
			files = [hypnoFile(next)];
			next += 1;
		} else {
			files = [hypnoFile(101), hypnoFile(102), hypnoFile(103)];
		}
		return route.fulfill({
			json: {
				files,
				total: files.length,
				triggers: [{ name: 'Good girl', count: 3 }],
				categories: []
			}
		});
	});
	await page.route('https://cdn.bambicloud.com/**', (route) =>
		route.fulfill({
			body: silentWav(),
			contentType: 'audio/wav',
			headers: { 'access-control-allow-origin': '*' }
		})
	);
	return asked;
}

/**
 * Stub the PMVHaven endpoint and its bucket, and record which vibe each
 * request asked for. Random picks hand out video 1, 2, 3… in turn, each a
 * silent WAV standing in for an MP4.
 */
async function stubPmvs(page: Page): Promise<string[]> {
	const asked: string[] = [];
	let next = 1;
	await page.route('**/api/playroom/iq-test/pmvs**', (route) => {
		const params = new URL(route.request().url()).searchParams;
		asked.push(params.get('vibe') ?? '');
		const n = next;
		next += 1;
		return route.fulfill({
			json: {
				files: [
					{
						...hypnoFile(n, 'voice-over'),
						source: 'pmvhaven',
						name: `Stub PMV ${n}`,
						pageUrl: `https://pmvhaven.com/video/${n}`,
						mediaUrl: `https://pmvhavencloud.s3.eu-west-par.io.cloud.ovh.net/videos/stub-${n}.mp4`
					}
				],
				total: 1,
				triggers: [],
				categories: []
			}
		});
	});
	await page.route('https://pmvhavencloud.s3.eu-west-par.io.cloud.ovh.net/**', (route) =>
		route.fulfill({ body: silentWav(), contentType: 'audio/wav' })
	);
	return asked;
}

/**
 * Settings remembered on the device. Porn as pictures and clips both, not the
 * default videos only: the specs' feeds are mostly pictures, served locally.
 */
async function rememberSettings(page: Page, intensity: number, vibe: string) {
	await page.addInitScript(
		([p, v]) =>
			localStorage.setItem(
				'playroom.iq-test.settings',
				JSON.stringify({
					role: 'sub',
					intensity: p,
					vibe: v,
					soberIq: null,
					targetIq: null,
					pornMedia: 'both'
				})
			),
		[intensity, vibe]
	);
}

function hypnoAudio(page: Page) {
	return page.locator('audio.hypno-audio').evaluate((audio: HTMLAudioElement) => ({
		paused: audio.paused,
		src: audio.src
	}));
}

test.describe('IQ test hypno', () => {
	test('plays a loop or subliminal for the bambi vibe in the porn modes, heard from the start', async ({
		page
	}) => {
		const asked = await stubHypnos(page);
		await rememberSettings(page, 3, 'bambi');
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();

		await expect(page.getByTestId('hypno-tab')).toContainText('Stub Hypno 1');
		expect(asked[0]).toBe('loop,subliminal');
		await expect.poll(async () => (await hypnoAudio(page)).paused).toBe(false);
		await expect(page.getByRole('button', { name: 'Mute hypno' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
	});

	test('offers sound on the intro, ticked, and starts muted when it is unticked', async ({
		page,
		baseURL
	}) => {
		await stubHypnos(page);
		await rememberSettings(page, 3, 'bambi');
		// Straight to the intro: the dialog dealt with this session, a role chosen before.
		await page
			.context()
			.addCookies([
				{ name: 'iq-test-dialog-seen', value: '1', url: `${baseURL}/playroom/iq-test` }
			]);
		await page.addInitScript(() => localStorage.setItem('playroom.iq-test.role-chosen', 'true'));
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);

		const box = page.getByTestId('sound-on');
		await expect(box).toContainText('Sound on');
		expect(await box.evaluate((element) => (element as HTMLInputElement).checked)).toBe(true);
		await box.click();
		await page.getByRole('button', { name: 'Try my best' }).click();

		// Started, but muted — and so held paused, as after a reload — until its
		// toggle or slider is used.
		await expect(page.getByTestId('hypno-tab')).toContainText('Stub Hypno 1');
		await expect(page.getByRole('button', { name: 'Mute hypno' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect((await hypnoAudio(page)).paused).toBe(true);
	});

	test('offers no sound box when the settings have nothing to hear', async ({ page, baseURL }) => {
		await rememberSettings(page, 1, 'bambi');
		await page
			.context()
			.addCookies([
				{ name: 'iq-test-dialog-seen', value: '1', url: `${baseURL}/playroom/iq-test` }
			]);
		await page.addInitScript(() => localStorage.setItem('playroom.iq-test.role-chosen', 'true'));
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
		await expect(page.getByTestId('sound-on')).toHaveCount(0);
	});

	test('plays music in mood lighting, with no porn controls', async ({ page }) => {
		const asked = await stubHypnos(page);
		await rememberSettings(page, 2, 'bambi');
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();

		await expect(page.getByTestId('hypno-tab')).toBeVisible();
		expect(asked[0]).toBe('music,ai music');
		await expect(page.getByTestId('porn-tab')).toHaveCount(0);
	});

	test('pauses at zero volume, and goes on to another with Next', async ({ page }) => {
		await stubHypnos(page);
		await rememberSettings(page, 3, 'bambi');
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();
		await expect.poll(async () => (await hypnoAudio(page)).paused).toBe(false);

		await page.getByRole('button', { name: 'Mute hypno' }).click();
		await expect.poll(async () => (await hypnoAudio(page)).paused).toBe(true);
		await page.getByRole('button', { name: 'Mute hypno' }).click();
		await expect.poll(async () => (await hypnoAudio(page)).paused).toBe(false);

		const before = await page.getByTestId('hypno-tab-title').textContent();
		await page.getByRole('button', { name: 'More hypno controls' }).click();
		await page
			.getByRole('region', { name: 'Hypno controls' })
			.getByRole('button', { name: 'Next', exact: true })
			.click();
		await expect(page.getByTestId('hypno-tab-title')).not.toHaveText(before ?? '');
	});

	test('plays the one chosen in the drawer', async ({ page }) => {
		await stubHypnos(page);
		await rememberSettings(page, 3, 'bambi');
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();
		await expect(page.getByTestId('hypno-tab')).toContainText('Stub Hypno 1');

		await page.getByRole('button', { name: 'More hypno controls' }).click();
		// The list of hypnos stays out of the way until asked for.
		await expect(page.getByTestId('hypno-results')).toHaveCount(0);
		await page.getByRole('button', { name: 'Select', exact: true }).click();
		const results = page.getByTestId('hypno-results');
		await expect(results).toContainText('Stub Hypno 102');
		await results.locator('li').filter({ hasText: 'Stub Hypno 102' }).getByRole('button').click();
		await expect(page.getByTestId('hypno-tab-title')).toHaveText('Stub Hypno 102');
		await expect.poll(async () => (await hypnoAudio(page)).src).toContain('stub-102.wav');
		// The panel's heading links the track to its page and names its author.
		const heading = page.getByRole('region', { name: 'Hypno controls' }).locator('.panel-head');
		await expect(heading.getByRole('link', { name: 'Stub Hypno 102' })).toHaveAttribute(
			'href',
			/bambicloud\.com\/file\//
		);
		await expect(heading).toContainText('by stubber');
		await expect(page.getByRole('region', { name: 'Hypno controls' })).not.toContainText(
			'on bambicloud.com'
		);
		// Still open, with the one playing marked rather than offered.
		await expect(
			results.locator('li').filter({ hasText: 'Stub Hypno 102' }).getByTestId('hypno-playing')
		).toBeVisible();

		// Pause is the mute toggle under another name.
		await page.getByRole('button', { name: 'Pause' }).click();
		await expect.poll(async () => (await hypnoAudio(page)).paused).toBe(true);
		await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

		// A click anywhere outside the panel puts it away.
		await page.locator('header.brand h1').click();
		await expect(page.getByRole('region', { name: 'Hypno controls' })).toHaveCount(0);
	});

	test('keeps both tabs docked at the foot, shrinking to icon, toggle and more when narrow', async ({
		page
	}) => {
		const images = Array.from({ length: 20 }, (_, i) => `/og-image.jpg?n=${i}`);
		await page.route('**/api/playroom/iq-test/media**', (route) =>
			route.fulfill({ json: { images, clips: [] } })
		);
		await stubHypnos(page);
		await rememberSettings(page, 3, 'bambi');
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();

		const hypnoTab = page.getByTestId('hypno-tab');
		const pornTab = page.getByTestId('porn-tab');
		await expect(hypnoTab).toBeVisible();
		await expect(pornTab).toBeVisible();
		// At the foot of the window.
		const box = await hypnoTab.boundingBox();
		expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(800, -1);
		// Wide: the title, the time left, and the slider.
		await expect(page.getByTestId('hypno-tab-title')).toBeVisible();
		await expect(hypnoTab.locator('wa-slider')).toBeVisible();

		// In between: the title becomes a word, and then the slider goes.
		await page.setViewportSize({ width: 760, height: 800 });
		await expect(page.getByTestId('hypno-tab-title')).toHaveText('Hypno');
		await expect(hypnoTab.locator('wa-slider')).toBeHidden();

		// Narrow: icon, mute toggle and more, nothing else — and only as wide as those.
		await page.setViewportSize({ width: 390, height: 800 });
		await expect(page.getByTestId('hypno-tab-title')).toBeHidden();
		await expect(hypnoTab.locator('wa-slider')).toBeHidden();
		await expect(hypnoTab.getByRole('button', { name: 'Mute hypno' })).toBeVisible();
		await expect(hypnoTab.getByRole('button', { name: 'More hypno controls' })).toBeVisible();
		// Polled: the tab animates to its new size rather than jumping.
		await expect.poll(async () => (await hypnoTab.boundingBox())?.width ?? 0).toBeLessThan(160);

		// The panel slides up with the rest, one tab's at a time.
		const more = page.getByRole('button', { name: 'More hypno controls' });
		await more.click();
		await expect(more).toHaveAttribute('aria-expanded', 'true');
		// The tab grows into the panel, centred over the dock and on top of the
		// porn tab, which stays where it was underneath.
		const pornBefore = await pornTab.boundingBox();
		const panel = hypnoTab.getByRole('region', { name: 'Hypno controls' });
		await expect(panel).toBeVisible();
		await expect
			.poll(async () => {
				const grown = await panel.boundingBox();
				return grown ? Math.abs(grown.x + grown.width / 2 - 195) : Number.POSITIVE_INFINITY;
			})
			.toBeLessThan(2);
		expect((await panel.boundingBox())?.width ?? 0).toBeGreaterThan(300);
		expect(await pornTab.boundingBox()).toEqual(pornBefore);
		await more.click();
		await expect(page.getByRole('region', { name: 'Hypno controls' })).toHaveCount(0);
		await page.getByRole('button', { name: 'More porn controls' }).click();
		await expect(page.getByRole('region', { name: 'Porn controls' })).toBeVisible();
		await expect(hypnoTab).toBeVisible();
	});

	test('plays nothing for any other vibe in mood lighting, or below it', async ({ page }) => {
		const asked = await stubHypnos(page);
		const pmvs = await stubPmvs(page);
		await rememberSettings(page, 2, 'denial');
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();
		await expect(page.getByText('Question 1 of 36')).toBeVisible();
		await expect(page.getByTestId('hypno-tab')).toHaveCount(0);
		await expect(page.locator('audio.hypno-audio, video.hypno-video')).toHaveCount(0);
		expect(asked).toEqual([]);
		expect(pmvs).toEqual([]);
	});

	test('plays a PMVHaven video as one of the porn videos for any other vibe with porn', async ({
		page
	}) => {
		const pmvs = await stubPmvs(page);
		// Long enough not to end mid-test: the point is that it never restarts.
		await page.route('https://pmvhavencloud.s3.eu-west-par.io.cloud.ovh.net/**', (route) =>
			route.fulfill({ body: silentWav(60), contentType: 'audio/wav' })
		);
		await rememberSettings(page, 3, 'denial');
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();

		expect(pmvs[0]).toBe('denial');
		const video = page.locator('video.hypno-video');
		const position = () => video.evaluate((element: HTMLVideoElement) => element.currentTime);
		await expect(page.getByTestId('hypno-tab')).toContainText('Stub PMV 1');
		await expect
			.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
			.toBe(false);
		// At the top of the first column, not floating over the page.
		await expect(
			page.locator('.media-panel').first().getByTestId('hypno-item').locator('video.hypno-video')
		).toBeVisible();

		// Enlarged, it is the same element, carrying on from where it was.
		await expect.poll(position).toBeGreaterThan(0.2);
		const before = await position();
		await pressOverlay(page.getByRole('button', { name: 'Enlarge hypno' }));
		const enlarged = page.getByRole('dialog', { name: 'Enlarged hypno' });
		await expect(enlarged.locator('video.hypno-video')).toBeVisible();
		expect(await position()).toBeGreaterThanOrEqual(before);
		await page.keyboard.press('Escape');
		await expect(enlarged).toHaveCount(0);

		// Muted, it pauses, and says so with a play symbol over it; its buttons
		// gain a Play, which unmutes it and plays it on.
		const paused = () => video.evaluate((element: HTMLVideoElement) => element.paused);
		const marker = page.getByTestId('hypno-item').getByTestId('hypno-paused');
		const play = page.getByTestId('hypno-item').getByRole('button', { name: 'Play the hypno' });
		await expect(play).toHaveCount(0);
		await page.getByRole('button', { name: 'Mute hypno' }).click();
		await expect.poll(paused).toBe(true);
		await expect(marker).toBeVisible();
		// Pointed at, the buttons show and the symbol gives way to them.
		await pressOverlay(play);
		await expect.poll(paused).toBe(false);
		await expect(play).toHaveCount(0);
		await expect(marker).toHaveCount(0);

		// With no columns (back out to the intro) it plays on unseen, from where
		// it was, rather than starting again.
		const beforeExit = await position();
		await page.getByRole('button', { name: 'Back' }).click();
		await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
		await expect(page.locator('.media-panel')).toHaveCount(0);
		expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
		expect(await position()).toBeGreaterThanOrEqual(beforeExit);
		await expect(page.getByTestId('hypno-tab')).toContainText('Stub PMV 1');
	});

	test('switches bambi between bambicloud and PMVHaven from the hypno panel', async ({ page }) => {
		await stubHypnos(page);
		await stubPmvs(page);
		await rememberSettings(page, 3, 'bambi');
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();
		await expect(page.getByTestId('hypno-tab')).toContainText('Stub Hypno 1');
		await expect(page.locator('video.hypno-video')).toHaveCount(0);

		await page.getByRole('button', { name: 'More hypno controls' }).click();
		await page.getByText('PMVHaven (video)').click();
		await expect(page.locator('video.hypno-video')).toBeVisible();
		await expect(page.getByTestId('hypno-tab')).toContainText('Stub PMV 1');
		await expect(page.locator('audio.hypno-audio')).toHaveCount(0);
		// And it is remembered for next time.
		expect(await page.evaluate(() => localStorage.getItem('playroom.iq-test.hypno-source'))).toBe(
			'"pmvhaven"'
		);
	});
});

test.describe('IQ test', () => {
	test('is public, and keeps a signed-out history on the device', async ({ page }) => {
		await page.goto('/playroom/iq-test');
		await expect(page).toHaveURL(/\/playroom\/iq-test$/);
		await takeTest(page);
		// Finishing moves to the result's own page.
		await page.waitForURL(/\/playroom\/iq-test\/.+/);

		// Every question skipped: a score of the floor, presented as simply as it gets.
		await expect(page.locator('[data-simplicity]')).toHaveAttribute(
			'data-simplicity',
			'very-simple'
		);
		await expect(page.getByTestId('iq-history').locator('li')).toHaveCount(1);
		await expect(page.getByRole('link', { name: 'Keep them with an account' })).toBeVisible();

		await page.reload();
		await waitForHydration(page);
		await expect(page.getByTestId('iq-history').locator('li')).toHaveCount(1);
	});

	test('asks once per visit: not again on a reload, but again in a new session', async ({
		page,
		browser
	}) => {
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await expect(dialog(page)).toContainText('agreed to play');
		// No role chosen yet on this device, so there is no closing it without one.
		await expect(dialog(page).locator('[part~="close-button"]')).toBeHidden();
		await page.keyboard.press('Escape');
		await expect(dialog(page)).toHaveAttribute('open');
		await dialog(page).getByRole('button', { name: SUB }).click();
		await expect(page.getByText('Question 1 of 36')).toBeVisible();

		// A reload in the same session goes straight to the page, from the
		// server's first render on — not a dialog that flashes up and closes.
		const html = await (await page.request.get('/playroom/iq-test')).text();
		expect(html).not.toContain('agreed to play');
		await page.reload();
		await waitForHydration(page);
		await expect(dialog(page)).toHaveCount(0);
		await expect(page.getByText('Question 1 of 36')).toBeVisible();

		// With a role chosen once, the dialog can be closed without one.
		await page.getByRole('button', { name: 'Start over', exact: true }).click();
		await expect(dialog(page)).toContainText('agreed to play');
		await page.keyboard.press('Escape');
		await expect(dialog(page)).toHaveCount(0);
		await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
		// The intro has its own Settings button, so no settings tab beside it.
		await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
		await expect(page.getByTestId('settings-tab')).toHaveCount(0);

		// A new session — a context with no session cookie — sees it again.
		const fresh = await browser.newContext();
		try {
			const again = await fresh.newPage();
			await again.goto('/playroom/iq-test');
			await expect(dialog(again)).toContainText('agreed to play');
		} finally {
			await fresh.close();
		}
	});

	test('a reload mid-test comes back to the same question', async ({ page }) => {
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();
		await page.getByRole('button', { name: 'Skip', exact: true }).click();
		await page.getByRole('button', { name: 'Skip', exact: true }).click();
		await expect(page.getByText('Question 3 of 36')).toBeVisible();
		// The prompt, not the whole question: a wa-input's light DOM whitespace
		// differs with how far it has upgraded, which made the comparison flaky.
		const prompt = page.locator('section.question .prompt').first();
		const before = await prompt.textContent();

		await page.reload();
		await waitForHydration(page);
		await expect(page.getByText('Question 3 of 36')).toBeVisible();
		await expect(dialog(page)).toHaveCount(0);
		// The same question, not a newly dealt one in the same place.
		await expect(prompt).toHaveText(before ?? '');
		// And the earlier answers are still there: two more skips is not a score.
		await expect(page.getByText(`${MIN_FOR_SCORE - 2} more for a score`)).toBeVisible();
	});

	test('a reload mid-question carries its clock on from where it was', async ({ page }) => {
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();
		const countdown = page.locator(
			'section.question[data-phase="answer"] [data-testid="countdown"] .number'
		);
		const left = async () => Number.parseInt((await countdown.textContent()) ?? '', 10);
		// On to a question answered against a clock long enough to watch run down.
		let at = 0;
		let start = 0;
		for (let i = 1; i <= 36 && start < 8; i += 1) {
			await expect(page.getByText(`Question ${i} of 36`)).toBeVisible();
			at = i;
			start = (await countdown.count()) > 0 ? await left() : 0;
			if (start < 8) {
				await page.getByRole('button', { name: 'Skip', exact: true }).click();
			}
		}
		expect(start).toBeGreaterThanOrEqual(8);
		await expect.poll(left).toBeLessThanOrEqual(start - 3);
		const before = await left();

		await page.reload();
		await waitForHydration(page);
		await expect(page.getByText(`Question ${at} of 36`)).toBeVisible();
		// Not back to the full time: on from what was left, give or take the
		// second the reload was part way through.
		expect(await left()).toBeLessThanOrEqual(before);
	});

	test('a reload mid-memorise carries on memorising, and one after it does not memorise again', async ({
		page
	}) => {
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();
		const question = page.locator('section.question');
		const countdown = page.locator(
			'section.question[data-kind="working-memory"][data-phase="memorise"] [data-testid="countdown"] .number'
		);
		const left = async () => Number.parseInt((await countdown.textContent()) ?? '', 10);
		// On to the words to remember: every kind comes up in the first round.
		let at = 0;
		for (let i = 1; i <= 18; i += 1) {
			await expect(page.getByText(`Question ${i} of 36`)).toBeVisible();
			at = i;
			if ((await question.getAttribute('data-kind')) === 'working-memory') {
				break;
			}
			await page.getByRole('button', { name: 'Skip', exact: true }).click();
		}
		const start = await left();
		expect(start).toBeGreaterThanOrEqual(5);
		await expect.poll(left).toBeLessThanOrEqual(start - 2);
		const before = await left();
		const words = await page.getByTestId('memorise-items').textContent();

		await page.reload();
		await waitForHydration(page);
		await expect(page.getByText(`Question ${at} of 36`)).toBeVisible();
		await expect(page.getByTestId('memorise-items')).toHaveText(words ?? '');
		expect(await left()).toBeLessThanOrEqual(before);

		// Past the words, a reload stays past them.
		await page.getByRole('button', { name: "I've got them" }).click();
		await expect(question).toHaveAttribute('data-phase', 'interference');
		await page.reload();
		await waitForHydration(page);
		await expect(page.getByText(`Question ${at} of 36`)).toBeVisible();
		await expect(question).toHaveAttribute('data-phase', 'interference');
		await expect(page.getByTestId('memorise-items')).toHaveCount(0);
	});

	test('"New porn" swaps the pictures on show for others', async ({ page }) => {
		// Plenty of distinct pictures, all served locally so nothing leaves the
		// machine; the page treats any image URL the feed gives it alike.
		const images = Array.from({ length: 40 }, (_, i) => `/og-image.jpg?n=${i}`);
		await page.route('**/api/playroom/iq-test/media**', (route) =>
			route.fulfill({ json: { images, clips: [] } })
		);
		await page.addInitScript(() =>
			localStorage.setItem(
				'playroom.iq-test.settings',
				JSON.stringify({
					role: 'sub',
					intensity: 3,
					vibe: 'denial',
					soberIq: null,
					targetIq: null,
					pornMedia: 'both'
				})
			)
		);
		// Wide enough for every tab's action labelled, the fullscreen button's
		// too — which comes only with the settings tab's slider beside it.
		await page.setViewportSize({ width: 2000, height: 900 });
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();

		const shown = () =>
			page
				.locator('.media-panel img')
				.evaluateAll((all) => all.map((img) => img.getAttribute('src')));
		await expect(page.locator('.media-panel img').first()).toBeVisible();
		const before = await shown();

		// On a wide window the tab has room for everything its panel would
		// hold, so there is no panel to open: New porn is right there.
		await expect(page.getByRole('button', { name: 'More porn controls' })).toHaveCount(0);
		await page.getByRole('button', { name: 'New porn' }).click();
		await expect.poll(shown).not.toEqual(before);
	});

	test('changes the run from the settings tab, which the results leave out', async ({ page }) => {
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();
		await expect(page.getByText('Question 1 of 36')).toBeVisible();
		const wrapper = page.locator('.iq-test');
		await expect(wrapper).toHaveAttribute('data-intensity', '0');

		await page.getByRole('button', { name: 'More settings controls' }).click();
		const panel = page.getByRole('region', { name: 'Settings controls' });
		await panel.locator('wa-slider').evaluate((slider: HTMLElement & { value: number }) => {
			slider.value = 2;
			slider.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		});
		// Mood lighting, applied at once, and remembered for next time.
		await expect(wrapper).toHaveAttribute('data-intensity', '2');
		await expect
			.poll(() =>
				panel
					.locator('wa-select')
					.evaluate((select: HTMLElement & { value: string }) => select.value)
			)
			.toBe('gooner');
		await expect(page.locator('header.brand h1')).toHaveText('Gooner Brain Scan');
		expect(
			await page.evaluate(() =>
				JSON.parse(localStorage.getItem('playroom.iq-test.settings') ?? '{}')
			)
		).toMatchObject({ intensity: 2, vibe: 'gooner', role: 'sub' });
		await expect(page.getByText('Question 1 of 36')).toBeVisible();

		// Its look turned off: back to the institute's, while the vibe stays.
		await panel.getByTestId('toggle-themedLook').click();
		await expect(page.locator('header.brand h1')).toHaveText('Cognitive Assessment');
		expect(
			await page.evaluate(() =>
				JSON.parse(localStorage.getItem('playroom.iq-test.settings') ?? '{}')
			)
		).toMatchObject({ vibe: 'gooner', themedLook: false });

		await page.locator('header.brand h1').click();
		for (let i = 0; i < MIN_FOR_SCORE; i += 1) {
			await page.getByRole('button', { name: 'Skip', exact: true }).click();
		}
		await page.getByRole('button', { name: 'Finish and see my score' }).click();
		await expect(page.getByTestId('iq-score')).toBeVisible();
		// Not in fullscreen, so nothing for the tab to do here.
		await expect(page.getByTestId('settings-tab')).toHaveCount(0);
	});

	test('drags the intensity freely, and springs it onto the nearest notch when let go', async ({
		page
	}) => {
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		const slider = dialog(page).locator('wa-slider');
		const track = slider.locator('#track');
		const box = defined(await track.boundingBox(), 'the track');
		const value = () =>
			slider.evaluate((element: HTMLElement & { value: number }) => element.value);
		const y = box.y + box.height / 2;

		await page.mouse.move(box.x + 1, y);
		await page.mouse.down();
		// 60% of the way: 2.4 of 4, between notches.
		await page.mouse.move(box.x + box.width * 0.6, y, { steps: 8 });
		const dragged = await value();
		expect(dragged).toBeGreaterThan(2.2);
		expect(dragged).toBeLessThan(2.6);
		// The level follows the nearest notch as it goes.
		await expect(dialog(page).getByTestId('vibe-select')).toBeVisible();

		await page.mouse.up();
		await expect.poll(value).toBe(2);
	});

	test('keeps the settings panel’s slider in place as the options it brings in appear', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 560 });
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();
		await page.getByRole('button', { name: 'More settings controls' }).click();
		const panel = page.getByRole('region', { name: 'Settings controls' });
		const slider = panel.locator('wa-slider');
		const sliderTop = async () => (await slider.boundingBox())?.y ?? 0;
		// Once the panel has finished growing open.
		const settled = () =>
			page
				.getByTestId('settings-tab')
				.evaluate((tab) => tab.getAnimations({ subtree: true }).length === 0);
		await expect.poll(settled).toBe(true);
		const before = await sliderTop();

		await slider.evaluate((element: HTMLElement & { value: number }) => {
			element.value = 4;
			element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		});
		await expect(panel.getByTestId('toggle-subliminals')).toBeAttached();
		// More than fits now: the panel scrolls, from its end, so the slider has
		// not moved, and the new options are above it.
		const content = panel.locator('.panel-content');
		await expect
			.poll(() => content.evaluate((element) => element.scrollHeight > element.clientHeight))
			.toBe(true);
		await expect.poll(sliderTop).toBeCloseTo(before, -1);
		await expect(slider).toBeInViewport();
	});

	test('enlarges a picture where it is, and puts it back', async ({ page }) => {
		const images = Array.from({ length: 10 }, (_, i) => `/og-image.jpg?n=${i}`);
		await page.route('**/api/playroom/iq-test/media**', (route) =>
			route.fulfill({ json: { images, clips: [] } })
		);
		await rememberSettings(page, 3, 'denial');
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();

		await pressOverlay(page.getByRole('button', { name: 'Enlarge picture' }).first());
		const enlarged = page.getByRole('dialog', { name: 'Enlarged picture' });
		await expect(enlarged.locator('img')).toBeVisible();
		const { width } = (await enlarged.boundingBox()) ?? { width: 0 };
		expect(width).toBeGreaterThan(320);
		await enlarged.getByRole('button', { name: 'Close' }).click();
		await expect(enlarged).toHaveCount(0);

		// A click on the backdrop closes it, and does nothing else: no click,
		// press or focus change reaches the page under it.
		await pressOverlay(page.getByRole('button', { name: 'Enlarge picture' }).first());
		await expect(enlarged).toBeVisible();
		await page.evaluate(() => {
			const reached: string[] = [];
			(globalThis as unknown as { reached: string[] }).reached = reached;
			for (const type of ['pointerdown', 'mousedown', 'click']) {
				document.body.addEventListener(type, () => reached.push(type));
			}
		});
		const box = defined(await enlarged.boundingBox(), 'the enlarged picture');
		// Beside it, on the backdrop: above it if it fills the width.
		await page.mouse.click(
			box.x > 4 ? box.x / 2 : 640,
			box.x > 4 ? box.y + box.height / 2 : box.y / 2
		);
		await expect(enlarged).toHaveCount(0);
		expect(
			await page.evaluate(() => (globalThis as unknown as { reached: string[] }).reached)
		).toEqual([]);
		await expect(page.getByText('Question 1 of 36')).toBeVisible();

		// Escape closes it too.
		await pressOverlay(page.getByRole('button', { name: 'Enlarge picture' }).first());
		await expect(enlarged).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(enlarged).toHaveCount(0);
	});

	/** A sub's run at an intensity, with a feed of plenty of pictures, at a window size. */
	async function startWithPorn(
		page: Page,
		intensity: number,
		size: { width: number; height: number }
	) {
		const images = Array.from({ length: 60 }, (_, i) => `/og-image.jpg?n=${i}`);
		await page.route('**/api/playroom/iq-test/media**', (route) =>
			route.fulfill({ json: { images, clips: [] } })
		);
		await page.setViewportSize(size);
		await rememberSettings(page, intensity, 'denial');
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();
		await expect(page.getByText('Question 1 of 36')).toBeVisible();
	}

	/** The space between the first two pictures in the band beside the question. */
	const bandGap = (page: Page) =>
		page.getByTestId('porn-before').evaluate((band) => {
			const [a, b] = [...band.querySelectorAll('.slot')].map((slot) =>
				slot.getBoundingClientRect()
			);
			return a && b ? Math.round(b.top - a.bottom) : null;
		});

	test('packs the porn tight at 4, and fills the room under the question with it', async ({
		page
	}) => {
		// Seed 1 deals a letter series first, which leaves room under it. A
		// random seed sometimes dealt a grid of shapes tall enough to leave none,
		// so no strip fitted and the fill check below failed now and then.
		// `newSeed()` is the page's only one-number draw.
		await page.addInitScript(() => {
			const draw = crypto.getRandomValues.bind(crypto);
			crypto.getRandomValues = (array) => {
				if (array instanceof Uint32Array && array.length === 1) {
					array[0] = 1;
					return array;
				}
				return draw(array);
			};
		});
		await startWithPorn(page, 4, { width: 1600, height: 1100 });
		await expect(page.getByText('Which letter comes next?')).toBeVisible();
		await expect.poll(() => bandGap(page)).toBe(8);
		// Every column whole, a gap from the window's edge: none run off it,
		// which the scrollbar (counted in the window's width, not the page's)
		// once made them do.
		const edges = await page.evaluate(() => {
			const width = document.documentElement.clientWidth;
			return [...document.querySelectorAll('[data-testid^="porn-"] .media-panel.column')].map(
				(panel) => {
					const box = panel.getBoundingClientRect();
					return { left: box.left, right: width - box.right };
				}
			);
		});
		expect(edges.length).toBeGreaterThan(1);
		for (const edge of edges) {
			expect(edge.left).toBeGreaterThanOrEqual(7);
			expect(edge.right).toBeGreaterThanOrEqual(7);
		}
		await expect
			.poll(() => page.getByTestId('porn-fill').locator('.media-panel').count())
			.toBeGreaterThan(0);

		// The footer at the foot of the middle column, inside the window, and
		// nothing to scroll: the bands are a window high, and the porn under
		// the question gives way to the question.
		const footer = defined(await page.locator('footer').boundingBox(), 'the footer');
		const sheet = defined(await page.locator('.sheet').boundingBox(), 'the question');
		expect(footer.x).toBeGreaterThanOrEqual(sheet.x);
		expect(footer.x + footer.width).toBeLessThanOrEqual(sheet.x + sheet.width);
		expect(footer.y + footer.height).toBeLessThanOrEqual(1100);
		expect(
			await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
		).toBeLessThanOrEqual(0);
	});

	test('puts the intensity slider in the collapsed settings tab, shedding the fullscreen label before it', async ({
		page
	}) => {
		await startWithPorn(page, 3, { width: 2000, height: 900 });
		const tab = page.getByTestId('settings-tab');
		const slider = tab.locator('.bar wa-slider');
		await expect(slider).toBeVisible();
		// A level set from it reaches the page.
		const track = defined(await slider.boundingBox(), 'the slider');
		await page.mouse.click(track.x + track.width - 4, track.y + track.height / 2);
		await expect(page.locator('.iq-test')).toHaveAttribute('data-intensity', '4');
		const fullscreen = tab.locator('.bar > wa-button');
		await expect(fullscreen).toHaveText(/fullscreen/i);

		// Narrower: the fullscreen button loses its label first, keeping the slider…
		await page.setViewportSize({ width: 1700, height: 900 });
		await expect(fullscreen).toHaveClass(/action-icon/);
		await expect(slider).toBeVisible();

		// …and then the slider goes.
		await page.setViewportSize({ width: 1400, height: 900 });
		await expect(slider).toHaveCount(0);
		await expect(fullscreen).toHaveClass(/action-icon/);
	});

	test('holds the settings tab still while its slider is dragged, then lets it settle', async ({
		page
	}) => {
		await startWithPorn(page, 3, { width: 2000, height: 900 });
		const tab = page.getByTestId('settings-tab');
		const slider = tab.locator('.bar wa-slider');
		await expect(slider).toBeVisible();
		const left = async () => defined(await tab.boundingBox(), 'the settings tab').x;
		// Settled first: the porn tab's count changes as the feed arrives.
		await expect(tab.locator('.bar')).toBeVisible();
		await expect(page.getByTestId('porn-tab')).toContainText('60 pictures');
		let before = await left();
		await expect
			.poll(async () => {
				const now = await left();
				const still = Math.abs(now - before) < 0.5;
				before = now;
				return still;
			})
			.toBe(true);
		const track = defined(await slider.boundingBox(), 'the slider');
		const y = track.y + track.height / 2;

		// Down to level 2, which has no porn: the porn tab goes, mid-drag.
		await page.mouse.move(track.x + (track.width * 3) / 4, y);
		await page.mouse.down();
		// Where it is held from: the press, not before it, since the other
		// tabs (the hypno's title arriving, say) can still move it until then;
		// read once the hold has had a frame to take effect.
		await page.evaluate(
			() =>
				new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null))))
		);
		before = await left();
		await page.mouse.move(track.x + track.width / 2, y, { steps: 5 });
		await expect(page.getByTestId('porn-tab')).toHaveCount(0);
		// Held a frame after the tabs change, every frame.
		await expect.poll(async () => Math.abs((await left()) - before)).toBeLessThan(1);

		// Let go: the hold lets go, and the tab settles into its own place among
		// the tabs left — which can, by chance, be where it was held.
		await page.mouse.up();
		await expect
			.poll(() =>
				tab.evaluate(
					(element) => element.style.translate === '' && element.getAnimations().length === 0
				)
			)
			.toBe(true);
	});

	test('spaces the porn out at 3, and grows the strip below the question on a narrow window', async ({
		page
	}) => {
		await startWithPorn(page, 3, { width: 1600, height: 1100 });
		await expect.poll(() => bandGap(page)).toBe(40);

		// Tall enough to leave room under any first question.
		await page.setViewportSize({ width: 600, height: 2400 });
		await expect
			.poll(() => page.getByTestId('porn-after').locator('.media-panel').count())
			.toBeGreaterThan(1);
		// Down to the footer, not past it.
		const after = defined(await page.getByTestId('porn-after').boundingBox(), 'the strips below');
		const footer = defined(await page.locator('footer').boundingBox(), 'the footer');
		expect(after.y + after.height).toBeLessThanOrEqual(footer.y);
	});

	test('goes back to skipped questions, then on to the next unanswered one', async ({ page }) => {
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();
		const skipButton = page.getByRole('button', { name: 'Skip', exact: true });
		await skipButton.click();
		await expect(page.getByText('Question 2 of 36')).toBeVisible();
		await skipButton.click();
		await expect(page.getByText('Question 3 of 36')).toBeVisible();

		await page.getByRole('button', { name: 'Return to skipped' }).click();
		await expect(page.getByText('Question 1 of 36')).toBeVisible();
		await skipButton.click();
		// The next one still unanswered, not the frontier.
		await expect(page.getByText('Question 2 of 36')).toBeVisible();
		await skipButton.click();
		await expect(page.getByText('Question 3 of 36')).toBeVisible();
	});

	test('back from the first question goes out to the intro', async ({ page }) => {
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();
		await expect(page.getByText('Question 1 of 36')).toBeVisible();
		await page.getByRole('button', { name: 'Back' }).click();
		await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Begin assessment' })).toBeVisible();
	});

	test('the intro’s fullscreen box is ticked exactly while the page is fullscreen', async ({
		page
	}) => {
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		// Not in the dialog: on the intro, and in the settings tab.
		await expect(dialog(page)).not.toContainText(/full ?screen/i);
		await dialog(page).getByRole('button', { name: SUB }).click();
		await page.getByRole('button', { name: 'Back' }).click();
		const box = page.getByTestId('opens-fullscreen');
		await expect(box).toContainText('Open in full screen for maximum focus');
		// At the left of the intro's row, the buttons on the right.
		const settingsButton = defined(
			await page.getByRole('button', { name: 'Settings', exact: true }).boundingBox(),
			'the Settings button'
		);
		const boxAt = defined(await box.boundingBox(), 'the box');
		expect(boxAt.x).toBeLessThan(settingsButton.x);

		const fullscreen = () => page.evaluate(() => document.fullscreenElement !== null);
		const ticked = () => box.evaluate((element) => (element as HTMLInputElement).checked);
		// Off to begin with.
		expect(await ticked()).toBe(false);

		// Ticking it goes fullscreen at once; unticking it leaves.
		await box.click();
		await expect.poll(fullscreen).toBe(true);
		expect(await ticked()).toBe(true);
		await box.click();
		await expect.poll(fullscreen).toBe(false);
		expect(await ticked()).toBe(false);

		// Leaving some other way unticks it.
		await box.click();
		await expect.poll(fullscreen).toBe(true);
		await page.evaluate(() => document.exitFullscreen());
		await expect.poll(ticked).toBe(false);

		// The settings panel's button does the same, from the test.
		await box.click();
		await expect.poll(fullscreen).toBe(true);
		await page.getByRole('button', { name: 'Begin assessment' }).click();
		await page.getByRole('button', { name: 'More settings controls' }).click();
		const header = page.getByRole('region', { name: 'Settings controls' }).locator('.panel-head');
		const exit = header.getByRole('button', { name: 'Exit fullscreen' });
		await expect(exit).toBeVisible();
		await exit.click();
		await expect.poll(fullscreen).toBe(false);
	});

	test('a finished result has its own link, which opens anywhere and cannot be edited', async ({
		page,
		browser
	}) => {
		await page.goto('/playroom/iq-test');
		await takeTest(page);
		await page.waitForURL(/\/playroom\/iq-test\/[A-Za-z0-9_-]{20,}$/);
		const score = await page.getByTestId('iq-score').textContent();
		const link = page.url();

		await page.reload();
		await waitForHydration(page);
		await expect(page.getByTestId('iq-score')).toHaveText(score ?? '');
		await expect(page.getByTestId('iq-history').locator('li')).toHaveCount(1);

		// Someone else, who never took it: the score, and a way to take it themselves.
		const other = await browser.newContext();
		try {
			const theirs = await other.newPage();
			await theirs.goto(link);
			await waitForHydration(theirs);
			await expect(theirs.getByTestId('iq-score')).toHaveText(score ?? '');
			await expect(dialog(theirs)).toHaveCount(0);
			await expect(theirs.getByTestId('iq-history')).toHaveCount(0);
			await expect(theirs.getByRole('button', { name: 'Take the test yourself' })).toBeVisible();

			const token = link.split('/').at(-1) ?? '';
			const edited = `${token.slice(0, 4)}${token[4] === 'A' ? 'B' : 'A'}${token.slice(5)}`;
			const response = await theirs.goto(link.replace(token, edited));
			expect(response?.status()).toBe(404);
		} finally {
			await other.close();
		}
	});

	test('clears a signed-out history from the device', async ({ page }) => {
		await page.goto('/playroom/iq-test');
		await takeTest(page);
		const rows = page.getByTestId('iq-history').locator('li');
		await expect(rows).toHaveCount(1);
		await expect(rows.first()).toContainText(/IQ \d+/);

		await page.getByRole('button', { name: 'Clear history on this device' }).click();
		await page.getByRole('button', { name: 'Clear history', exact: true }).click();
		await expect(rows).toHaveCount(0);

		await page.reload();
		await waitForHydration(page);
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('iq-history')).toHaveCount(0);
	});

	test('starts over from the footer mid-test, back to the setup dialog', async ({ page }) => {
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();
		await page.getByRole('button', { name: 'Skip', exact: true }).click();
		await expect(page.getByText('Question 2 of 36')).toBeVisible();

		await page.getByRole('button', { name: 'Start over', exact: true }).click();
		await expect(dialog(page)).toContainText('agreed to play');
		// A fresh run, not the one that was left.
		await dialog(page).getByRole('button', { name: SUB }).click();
		await expect(page.getByText('Question 1 of 36')).toBeVisible();
	});

	test('covers the page with the setup dialog before any script has run', async ({ browser }) => {
		// No JavaScript, so Web Awesome never upgrades the dialog: what is seen
		// is exactly the first paint, before the page has had a chance to load.
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		try {
			await page.goto('/playroom/iq-test');
			const box = await dialog(page).boundingBox();
			const viewport = page.viewportSize();
			expect(box && viewport).toBeTruthy();
			// A panel in the middle, not the whole window: the backdrop round it
			// is what covers the page.
			expect(box?.width).toBeGreaterThan(300);
			expect(box?.width).toBeLessThan(viewport?.width ?? 0);
			const shadow = await dialog(page).evaluate((element) => getComputedStyle(element).boxShadow);
			expect(shadow).not.toBe('none');
		} finally {
			await context.close();
		}
	});

	test('scores a run with every question answered, from the end of the test', async ({ page }) => {
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();
		await answerEverything(page);
		// The end-of-test button, not the banner's "Finish and see my score".
		await page.getByRole('button', { name: 'See my score', exact: true }).click();
		await expect(page.getByTestId('iq-score')).toBeVisible();
	});

	test('finishes on a page served over plain HTTP, which has no crypto.randomUUID', async ({
		page
	}) => {
		// A phone on the LAN, or a self-hosted box without TLS: not a secure
		// context, so the browser leaves randomUUID out. Finishing once called it
		// first and the button did nothing.
		await page.addInitScript(() => {
			Reflect.deleteProperty(Crypto.prototype, 'randomUUID');
		});
		await page.goto('/playroom/iq-test');
		await takeTest(page);
		await expect(page.getByTestId('iq-history').locator('li')).toHaveCount(1);
	});

	test('"Correct answer", in debug mode, taps through a run to a full score', async ({ page }) => {
		const who = account('Tester');
		await newAccount(page, who);
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();
		// Not offered without debug mode.
		await expect(page.getByText('Question 1 of 36')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Correct answer', exact: true })).toHaveCount(0);

		// Nor with it granted but not switched on on this device.
		await grantFeature(who.email, 'debugMode');
		await page.reload();
		await waitForHydration(page);
		await expect(page.getByText('Question 1 of 36')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Correct answer', exact: true })).toHaveCount(0);

		await switchOnDebugCookie(page);
		await page.reload();
		await waitForHydration(page);
		const button = page.getByRole('button', { name: 'Correct answer', exact: true });
		await expect(button).toBeVisible();
		const where = await button.boundingBox();

		for (let i = 1; i <= MIN_FOR_SCORE; i += 1) {
			await expect(page.getByText(`Question ${i} of 36`)).toBeVisible();
			// Same place every question, banner or not, so a finger can stay put.
			expect((await button.boundingBox())?.y).toBe(where?.y);
			await button.click();
		}
		await page.getByRole('button', { name: 'Finish and see my score' }).click();
		await expect(page.getByTestId('iq-score')).toBeVisible();
		await expect(page.locator('[data-simplicity]')).toHaveAttribute('data-simplicity', 'full');
		await expect(
			page.getByText(`${MIN_FOR_SCORE} of ${MIN_FOR_SCORE}`, { exact: true })
		).toBeVisible();
	});

	test('"Incorrect answer" taps through a run to a floor score, answered rather than skipped', async ({
		page
	}) => {
		const who = account('Tester');
		await newAccount(page, who);
		await grantFeature(who.email, 'debugMode');
		await switchOnDebugCookie(page);
		await page.goto('/playroom/iq-test');
		await waitForHydration(page);
		await dialog(page).getByRole('button', { name: SUB }).click();

		const button = page.getByRole('button', { name: 'Incorrect answer' });
		await expect(button).toBeVisible();
		const where = await button.boundingBox();
		for (let i = 1; i <= MIN_FOR_SCORE; i += 1) {
			await expect(page.getByText(`Question ${i} of 36`)).toBeVisible();
			expect((await button.boundingBox())?.y).toBe(where?.y);
			await button.click();
		}
		await page.getByRole('button', { name: 'Finish and see my score' }).click();
		// A sub's floor: nothing right sinks all the way to 4.
		await expect(page.getByTestId('iq-score')).toHaveText('IQ 4 Below measurable range');
		// Answered, every one of them: twelve attempts, none correct. Polled,
		// because the result is saved after the score is already on screen.
		await expect
			.poll(
				async () =>
					(
						await sql(
							`select correct, attempted from iq_test_results r
							 join user u on u.id = r.owner_id where u.email = ?`,
							[who.email]
						)
					).rows
			)
			.toEqual([{ correct: 0, attempted: MIN_FOR_SCORE }]);
	});

	test('saves a signed-in result to the account', async ({ page }) => {
		await newAccount(page, account('IqTaker'));
		await page.goto('/playroom/iq-test');
		await takeTest(page);
		await expect(page.getByTestId('iq-history').locator('li')).toHaveCount(1);
		await expect(page.getByRole('link', { name: 'Keep them with an account' })).toHaveCount(0);

		// From the server this time, not the device.
		await page.evaluate(() => localStorage.clear());
		await page.reload();
		await waitForHydration(page);
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('iq-history').locator('li')).toHaveCount(1);

		// And the /home card shows it.
		await page.goto('/home');
		await expect(page.getByText(/Last IQ test: \d+/)).toBeVisible();
	});

	test('is reached from the Playroom card on /home', async ({ page }) => {
		await newAccount(page, account('Player'));
		await page.goto('/home');
		await waitForHydration(page);
		await page.getByRole('link', { name: 'Playroom' }).click();
		await page.waitForURL('**/playroom');
		await expect(page.getByRole('heading', { level: 1, name: 'Playroom' })).toBeVisible();

		await page.getByRole('link', { name: /IQ test/ }).click();
		await page.waitForURL('**/playroom/iq-test');
		await expect(dialog(page)).toContainText('agreed to play');
	});
});
