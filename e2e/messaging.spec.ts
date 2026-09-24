import { Buffer } from 'node:buffer';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { defined } from '../src/lib/testing/defined';
import { test } from './fixtures';
import {
	clickWaButton,
	fillRichText,
	linkAccounts,
	newSide,
	openBoard,
	reply,
	settle,
	signUp,
	typeRichText,
	writeThread
} from './helpers';

/**
 * Encrypted messages between two partners, over HTTP, in two real browsers.
 *
 * This is the only level that can prove the thing the whole feature is for:
 * that what one person types, the other person reads, having travelled through
 * a server that could not read it. Everything below here is unit-tested; the
 * round trip is only real in a browser.
 *
 * Two contexts, so the two accounts hold genuinely separate sessions and
 * genuinely separate key caches.
 */
test.describe('a message between partners', () => {
	test('travels end to end, and comes back readable', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		const secret = 'meet me in the kitchen at eleven';

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			// ── Ada writes ──────────────────────────────────────────────────────
			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			await expect(ada.page.getByText(/Nothing here yet/)).toBeVisible();

			await writeThread(ada.page, secret);
			// She is in the thread she just started, and can read her own message.
			await expect(ada.page.getByText(secret)).toBeVisible();

			// ── Jun is told ─────────────────────────────────────────────────────
			await jun.page.goto('/home');
			const link = jun.page.getByRole('link', { name: /1 new message from Ada/ });
			await expect(link).toBeVisible();

			// ── Jun reads it ────────────────────────────────────────────────────
			await link.click();
			await jun.page.waitForURL(/\/messages$/);
			// The unopened envelope Jun sees.
			const sticker = jun.page.getByRole('link', { name: /^Unread message 1 of 1/ });
			await expect(sticker).toBeVisible();
			await expect(sticker.locator('wa-icon')).toHaveAttribute('name', 'envelope');

			await sticker.click();
			await jun.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
			/**
			 * THE assertion. Ada typed this in her browser, it was encrypted there,
			 * stored as ciphertext, and decrypted in Jun's. Nothing else in the
			 * suite proves that.
			 */
			await expect(jun.page.getByText(secret)).toBeVisible();

			// ── and it is no longer unread ──────────────────────────────────────
			await jun.page.goto('/home');
			await expect(jun.page.getByRole('link', { name: /new message from Ada/ })).toBeHidden();
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	test('the server never sees the plaintext', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		const secret = 'an extremely distinctive phrase';
		const bodies: string[] = [];

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			ada.page.on('request', (request) => {
				if (request.method() === 'POST') {
					const body = request.postData();
					if (body) {
						bodies.push(body);
					}
				}
			});

			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			await writeThread(ada.page, secret);

			const posted = bodies.join('\n');
			expect(posted).not.toContain(secret);
			expect(posted).not.toContain('distinctive');
			// And something opaque did go.
			expect(posted).toContain('ciphertext');
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});

test.describe('a thread', () => {
	test('takes replies and reactions from both sides', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			await writeThread(ada.page, 'are you free tonight');

			// Jun opens the thread and replies.
			await jun.page.goto('/home');
			await openBoard(jun.page, 'Ada');
			await jun.page.getByRole('link', { name: /^Unread message/ }).click();
			await jun.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
			await expect(jun.page.getByText('are you free tonight')).toBeVisible();

			await reply(jun.page, 'very');
			await expect(jun.page.getByText('very')).toBeVisible();

			// Ada sees the reply.
			await ada.page.reload();
			await expect(ada.page.getByText('very')).toBeVisible();

			// Ada reacts to Jun's message, and not to her own.
			const bubbles = ada.page.locator('.messages > li');
			await expect(bubbles).toHaveCount(2);
			// Her own bubble offers no reaction control; the requirement is
			// reacting to what you received.
			await expect(bubbles.nth(0).getByRole('button', { name: /reaction/i })).toHaveCount(0);

			await bubbles.nth(1).getByRole('button', { name: 'Add a reaction' }).click();
			await ada.page.getByRole('button', { name: '🔥' }).click();
			await expect(ada.page.getByRole('list', { name: 'Reactions' })).toContainText('🔥');

			// Jun sees the tapback.
			await jun.page.reload();
			await expect(jun.page.getByRole('list', { name: 'Reactions' })).toContainText('🔥');
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});

test.describe('the board', () => {
	test('puts unread first and moves a thread below the seam once read', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			// Two threads from Ada, in order.
			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			await writeThread(ada.page, 'the first one');
			await ada.page.goBack();
			await writeThread(ada.page, 'the second one');

			await jun.page.goto('/home');
			await openBoard(jun.page, 'Ada');

			// Both unread, newest at the top, and no seam yet.
			const unread = jun.page.getByRole('list', { name: 'Unread' });
			await expect(unread.getByRole('listitem')).toHaveCount(2);
			await expect(unread.getByRole('link').first().locator('wa-icon')).toHaveAttribute(
				'name',
				'envelope'
			);
			await expect(jun.page.getByText('Already read')).toBeHidden();

			// Open the newest; it crosses the seam.
			await unread.getByRole('link').first().click();
			await jun.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
			await expect(jun.page.getByText('the second one')).toBeVisible();
			await jun.page.goBack();

			await expect(jun.page.getByText('Already read')).toBeVisible();
			await expect(
				jun.page.getByRole('list', { name: 'Unread' }).getByRole('listitem')
			).toHaveCount(1);
			const read = jun.page.getByRole('list', { name: 'Already read' });
			await expect(read.getByRole('listitem')).toHaveCount(1);
			await expect(read.getByText('the second one')).toBeVisible();

			await reply(ada.page, 'and another');
			await expect(ada.page.getByText('and another')).toBeVisible();

			await jun.page.reload();
			const unreadAgain = jun.page.getByRole('list', { name: 'Unread' });
			await expect(unreadAgain.getByRole('listitem')).toHaveCount(2);
			const reopened = unreadAgain.getByRole('listitem').first();
			await expect(reopened.getByText('the second one')).toBeVisible();
			await expect(reopened.locator('wa-icon[name="envelope"]')).toHaveCount(0);
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	test('keeps board tiles aligned in a plain grid and opens the composer only on tap', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			const shell = ada.page.locator('wa-dialog.composer-dialog');
			await expect(shell).toHaveCount(0);
			await clickWaButton(ada.page, 'Write something');
			await expect(shell).toHaveCount(1);
			const measured = await shell.evaluate((element) => {
				const root = element.shadowRoot;
				const body = root?.querySelector<HTMLElement>('[part~="body"]');
				const panel = root?.querySelector<HTMLElement>('[part~="dialog"]');
				const title = root?.querySelector<HTMLElement>('[part~="title"]');
				const composer = element.querySelector<HTMLElement>('.composer');
				if (!(body && panel && title && composer)) {
					return null;
				}
				const bodyRect = body.getBoundingClientRect();
				const composerRect = composer.getBoundingClientRect();
				const panelRect = panel.getBoundingClientRect();
				return {
					open: element.hasAttribute('open'),
					title: title.textContent?.trim() ?? '',
					bodyWidth: bodyRect.width,
					bodyHeight: bodyRect.height,
					composerWidth: composerRect.width,
					composerHeight: composerRect.height,
					leftGap: panelRect.left,
					rightGap: window.innerWidth - panelRect.right
				};
			});
			const sizing = defined(measured, 'the dialog body, panel, title and composer');
			expect(sizing.open).toBe(true);
			expect(sizing.title).toBe('Send to Jun');
			expect(Math.abs(sizing.composerWidth - sizing.bodyWidth)).toBeLessThanOrEqual(1);
			expect(Math.abs(sizing.composerHeight - sizing.bodyHeight)).toBeLessThanOrEqual(1);
			expect(Math.abs(sizing.leftGap - sizing.rightGap)).toBeLessThanOrEqual(8);
			await reply(ada.page, 'one');
			await ada.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
			await ada.page.goBack();

			await writeThread(ada.page, 'two');
			await ada.page.goBack();
			await writeThread(ada.page, 'three');
			await ada.page.goBack();

			const tiles = ada.page.locator('ul[aria-label] > li > a');
			await expect(tiles).toHaveCount(3);
			const transforms = await tiles.evaluateAll((els) =>
				els.map((el) => getComputedStyle(el).transform)
			);
			expect(transforms).toEqual(['none', 'none', 'none']);
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});

test.describe('live updates', () => {
	/**
	 * The requirement the whole realtime stage exists for: the other side sees a
	 * message arrive without touching anything.
	 *
	 * Asserted with a retrying `expect` and **never** a `page.reload()` — a
	 * reload would pass whether or not the live feed works at all, which is
	 * exactly the bug this is here to catch. The other messaging tests do reload
	 * on purpose, because they are testing storage and decryption rather than
	 * delivery.
	 *
	 * Runs against `vite dev`, so the notifier behind it is the in-process one in
	 * `server/realtime/local.ts`. That covers the client, the SSE endpoint, the
	 * framing and the `invalidate` wiring; the Durable Object that replaces it in
	 * production is covered directly by `durable-object.test.ts`, since Playwright
	 * does not point at `wrangler dev`.
	 */
	test('a reply appears in an open thread with no reload', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			// Wraps the constructor before any app code runs, and re-installs itself
			// on every document, so the count survives the full page loads earlier in
			// the flow.
			await ada.page.addInitScript(() => {
				const target = globalThis as unknown as { EventSource: unknown; streamCount?: number };
				const Real = target.EventSource as {
					new (url: string, eventSourceInitDict?: EventSourceInit): EventSource;
				};
				target.streamCount = 0;
				target.EventSource = class extends Real {
					constructor(url: string) {
						super(url);
						target.streamCount = (target.streamCount ?? 0) + 1;
					}
				};
			});

			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			await writeThread(ada.page, 'thinking about you');
			// Ada is now sitting on the thread she just wrote, and stays there.
			const adaThreadUrl = ada.page.url();

			await jun.page.goto('/home');
			await openBoard(jun.page, 'Ada');
			await jun.page.getByRole('link', { name: /^Unread message/ }).click();
			await jun.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
			// How many streams Ada's page has opened so far. Counted by wrapping the
			// constructor before any app code runs.
			const streamsBefore = await ada.page.evaluate(
				() => (globalThis as unknown as { streamCount?: number }).streamCount ?? 0
			);

			await reply(jun.page, 'come over');
			await expect(jun.page.getByText('come over')).toBeVisible();

			// No reload, no navigation, no interaction of any kind.
			await expect(ada.page.getByText('come over')).toBeVisible({ timeout: 20_000 });
			expect(ada.page.url()).toBe(adaThreadUrl);

			/**
			 * A delivered event must NOT cost a reconnect.
			 *
			 * The subscription lives in an `$effect` that reads `data`, and
			 * `invalidate()` reassigns `data` — so unless the effect depends on the
			 * partnership *id* rather than the whole prop, every arriving message
			 * tears the stream down and opens a new one. That still works, which is
			 * why no other assertion here would notice; it just quietly replaces one
			 * long-lived connection with one per message, and on Workers each of
			 * those is a fresh billed request to the Durable Object.
			 */
			const streamsAfter = await ada.page.evaluate(
				() => (globalThis as unknown as { streamCount?: number }).streamCount ?? 0
			);
			expect(streamsAfter).toBe(streamsBefore);
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	test('a new thread appears on an open board with no reload', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			// Both get past the one-time warning, then Ada waits on her board.
			await jun.page.goto('/home');
			await openBoard(jun.page, 'Ada');
			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			const adaBoardUrl = ada.page.url();
			await expect(ada.page.getByRole('link', { name: /message/ })).toHaveCount(0);

			await writeThread(jun.page, 'still awake?');

			await expect(ada.page.getByRole('link', { name: /^Unread message/ })).toHaveCount(1, {
				timeout: 20_000
			});
			expect(ada.page.url()).toBe(adaBoardUrl);
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});

test.describe('attachments', () => {
	/**
	 * A file round trip: encrypted in Ada's browser under its own ephemeral key,
	 * stored as opaque bytes, downloaded by Jun and decrypted back into
	 * something an <img> will render.
	 *
	 * A tiny real PNG, built in the test rather than checked in, so there is no
	 * binary fixture to keep in the repo.
	 */
	const Png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
		'base64'
	);

	test('an image travels encrypted and comes back renderable', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			await expect(ada.page.locator('wa-dialog.composer-dialog')).toHaveCount(0);
			await clickWaButton(ada.page, 'Write something');
			await ada.page
				.locator('input[type="file"]')
				.setInputFiles({ name: 'sunset.png', mimeType: 'image/png', buffer: Png });
			// The chip confirms the composer took it before the send.
			await expect(ada.page.getByText('sunset.png')).toBeVisible();

			await expect(ada.page.getByRole('button', { name: 'Send' })).toBeEnabled();
			await clickWaButton(ada.page, 'Send');
			await ada.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
			await ada.page.goBack();
			const boardThumb = ada.page.locator('ul[aria-label] img.thumb').first();
			await expect(boardThumb).toBeVisible();
			await expect(boardThumb).toHaveAttribute('src', /^blob:/);
			const previewMeasured = await boardThumb.evaluate((thumb) => {
				const preview = thumb.closest<HTMLElement>('.preview');
				if (!preview) {
					return null;
				}
				const previewRect = preview.getBoundingClientRect();
				const thumbRect = thumb.getBoundingClientRect();
				const style = getComputedStyle(thumb);
				return {
					widthDelta: Math.abs(previewRect.width - thumbRect.width),
					heightDelta: Math.abs(previewRect.height - thumbRect.height),
					objectFit: style.objectFit
				};
			});
			const previewSizing = defined(previewMeasured, 'the thumbnail preview box');
			expect(previewSizing.widthDelta).toBeLessThanOrEqual(1);
			expect(previewSizing.heightDelta).toBeLessThanOrEqual(1);
			expect(previewSizing.objectFit).toBe('cover');

			// Jun reads it and the decrypted image renders from a blob: URL, which
			// is the proof it was decrypted in the browser rather than served.
			await jun.page.goto('/home');
			await openBoard(jun.page, 'Ada');
			await jun.page.getByRole('link', { name: /^Unread message/ }).click();
			await jun.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);

			const image = jun.page.getByRole('img', { name: 'sunset.png' });
			await expect(image).toBeVisible();
			await expect(image).toHaveAttribute('src', /^blob:/);
			// And it actually decoded — a broken image has zero natural width.
			await expect
				.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
				.toBeGreaterThan(0);
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	test('first-message preview fans out at most four items on the board', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			await clickWaButton(ada.page, 'Write something');
			await fillRichText(ada.page, 'look at these');
			await ada.page.locator('input[type="file"]').setInputFiles([
				{ name: 'one.png', mimeType: 'image/png', buffer: Png },
				{ name: 'two.png', mimeType: 'image/png', buffer: Png },
				{ name: 'three.png', mimeType: 'image/png', buffer: Png },
				{ name: 'four.png', mimeType: 'image/png', buffer: Png },
				{ name: 'five.png', mimeType: 'image/png', buffer: Png }
			]);

			await expect(ada.page.getByText('one.png')).toBeVisible();
			await expect(ada.page.getByText('two.png')).toBeVisible();
			await expect(ada.page.getByRole('button', { name: 'Send' })).toBeEnabled();
			await clickWaButton(ada.page, 'Send');
			await ada.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
			await ada.page.goBack();

			const fan = ada.page.locator('ul[aria-label] .fan').first();
			await expect(fan).toBeVisible();
			await expect(fan.getByText('look at these')).toBeVisible();
			await expect(fan.locator('.fan-card')).toHaveCount(4);
			await expect(fan.locator('img.thumb')).toHaveCount(3);
			const fanSpread = async () =>
				fan.evaluate((element) => {
					const cards = Array.from(element.querySelectorAll<HTMLElement>('.fan-card'));
					if (cards.length === 0) {
						return null;
					}
					const fanRect = element.getBoundingClientRect();
					const rects = cards.map((card) => card.getBoundingClientRect());
					const minLeft = Math.min(...rects.map((rect) => rect.left));
					const maxRight = Math.max(...rects.map((rect) => rect.right));
					return {
						leftGap: minLeft - fanRect.left,
						rightGap: fanRect.right - maxRight,
						spread: maxRight - minLeft
					};
				});

			const before = defined(await fanSpread(), 'the fanned cards');
			expect(before.leftGap).toBeLessThanOrEqual(24);
			expect(before.rightGap).toBeLessThanOrEqual(24);
			const transition = await fan
				.locator('.fan-card')
				.first()
				.evaluate((card) => {
					const style = getComputedStyle(card);
					return { property: style.transitionProperty, duration: style.transitionDuration };
				});
			expect(transition.property).toContain('inset-inline-start');
			expect(transition.duration).not.toBe('0s');

			await fan.hover();
			await expect
				.poll(async () => {
					const after = await fanSpread();
					return after ? after.spread - before.spread : 0;
				})
				.toBeGreaterThan(10);
			await expect
				.poll(async () => {
					const after = await fanSpread();
					return after ? Math.max(after.leftGap, after.rightGap) : 0;
				})
				.toBeLessThan(-10);
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	/**
	 * The attachment endpoint must not hand a file over when it is addressed
	 * through the wrong partnership — including by someone who genuinely belongs
	 * to that other partnership, which is the sharper version of the mistake and
	 * the one only the re-join in `getAttachmentForDownload` prevents.
	 */
	test('will not serve an attachment through the wrong partnership', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		const cas = await newSide(browser, 'Cas');

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await signUp(cas.page, cas.who);
			await linkAccounts(ada, jun);
			await linkAccounts(ada, cas);

			// Capture the real download URL the page requests, so the ids are
			// genuine rather than guessed.
			const requested: string[] = [];
			ada.page.on('request', (request) => {
				if (request.url().includes('/attachments/')) {
					requested.push(request.url());
				}
			});

			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			await expect(ada.page.locator('wa-dialog.composer-dialog')).toHaveCount(0);
			await clickWaButton(ada.page, 'Write something');
			await fillRichText(ada.page, 'private');
			await ada.page
				.locator('input[type="file"]')
				.setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: Png });
			await expect(ada.page.getByRole('button', { name: 'Send' })).toBeEnabled();
			await clickWaButton(ada.page, 'Send');
			await ada.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
			await expect(ada.page.getByRole('img', { name: 'a.png' })).toBeVisible();

			expect(requested.length).toBeGreaterThan(0);
			expect(new Set(requested).size).toBe(1);
			const path = new URL(defined(requested[0], 'an attachment request')).pathname;
			const [, , , junPartnership] = path.split('/');
			const attachmentId = path.split('/').at(-1);

			// Ada's other partnership, which she really is in.
			const casPartnership = await cas.page.evaluate(
				() => new URL(globalThis.location.href).pathname.split('/')[2]
			);
			expect(casPartnership).not.toBe(junPartnership);

			const statuses = await ada.page.evaluate(
				async ([mine, other, id]) => {
					const get = async (partnership: string) =>
						(await fetch(`/api/partnerships/${partnership}/attachments/${id}`)).status;
					return { own: await get(mine), through: await get(other) };
				},
				[junPartnership, casPartnership, attachmentId] as [string, string, string]
			);

			// Through its own partnership: fine. Through the other one: gone.
			expect(statuses.own).toBe(200);
			expect(statuses.through).toBe(404);
		} finally {
			await ada.close();
			await jun.close();
			await cas.close();
		}
	});

	// A malformed request must be a refusal, not a crash. `request.formData()`
	// throws for a body that is not multipart, and an uncaught throw there was a
	// 500 until this test found it.
	test('refuses a send with no multipart body', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			const [, , partnershipId] = new URL(ada.page.url()).pathname.split('/');

			const status = await ada.page.evaluate(async (id) => {
				const response = await fetch(`/api/partnerships/${id}/threads`, { method: 'POST' });
				return response.status;
			}, partnershipId);

			expect(status).toBe(400);
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});

test.describe('thread tags', () => {
	// The composer dialog used to have `light-dismiss`, and the tag dropdown's
	// popup counts as an outside click: selecting a tag flashed the chip and
	// closed the whole dialog. Only a real browser can see that, because it is
	// Web Awesome's popup layering doing the dismissing.
	test('picking a tag in the composer keeps the dialog open', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');

			await clickWaButton(ada.page, 'Write something');
			// The composer's textarea, not the `wa-dialog` host: the host itself
			// carries no bounding box while the visible panel lives in its shadow
			// DOM, so a visibility assertion on the host is always "hidden".
			const composer = ada.page.getByLabel('Message to Jun');
			await expect(composer).toBeVisible();
			// Locator scope for the picker's controls — the dialog subtree, never the
			// textarea's, because the picker is a sibling of the composer.
			const dialog = ada.page.locator('wa-dialog');

			// Create one tag, so the dropdown has something real to select.
			await clickWaButton(ada.page, 'Add tag');
			await ada.page.locator('wa-dropdown-item').filter({ hasText: 'New tag' }).click();
			// Staged: the dialog must survive every popup interaction.
			await expect(composer).toBeVisible();
			await ada.page.getByLabel('New tag', { exact: true }).fill('planning');
			await ada.page.getByRole('button', { name: 'Add', exact: true }).click();
			await expect(composer).toBeVisible();
			await expect(dialog.getByText('planning')).toBeVisible();

			// Deselect it (chip pencil → trash), leaving it addable again.
			await dialog.getByRole('button', { name: 'Edit planning' }).click();
			await dialog.getByRole('button', { name: 'Remove tag' }).click();
			await expect(dialog.getByRole('button', { name: 'Edit planning' })).toHaveCount(0);

			// THE interaction that closed the dialog: selecting from the popup.
			await clickWaButton(ada.page, 'Add tag');
			await ada.page.locator('wa-dropdown-item').filter({ hasText: 'planning' }).click();
			await expect(composer).toBeVisible();

			await expect(dialog.getByText('planning')).toBeVisible();
			// The dialog itself survived: the composer is still there to type into.
			await expect(composer).toBeVisible();

			// No Save/Cancel in the composer's tag picker: sending the message is
			// the save, so the confirm pair belongs to the opened thread only.
			await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
			await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});
test.describe('embeds', () => {
	/**
	 * URLs in message bodies become links and inline embeds. The third-party
	 * requests are stubbed with `context.route` for two reasons: the suite must
	 * not depend on redgifs/reddit being up, and the fixture fails a run on
	 * console errors — a real third-party 404 or CORS complaint would fail the
	 * spec for reasons outside this app's control.
	 */
	test('renders redgifs and reddit embeds from a message', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		// Registered before any navigation so nothing slips through unstubbed.
		for (const page of [ada.page, jun.page]) {
			await page.route('**www.redgifs.com/**', (route) =>
				route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>gif</title>' })
			);
			await page.route('**/api/oembed**', (route) =>
				route.fulfill({
					contentType: 'application/json',
					body: JSON.stringify({
						title: 'A stubbed reddit post',
						provider_name: 'Reddit',
						html: '<iframe src="https://www.redditmedia.com/x/embed"></iframe>'
					})
				})
			);
			await page.route('**redditmedia.com/**', (route) =>
				route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>post</title>' })
			);
			await page.route('**noembed.com/**', (route) =>
				route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
			);
			// Revealing an embed also offers to cache its details on the message.
			// Answering "nothing known" keeps this test about live rendering, and
			// keeps the server off redgifs and reddit: a page route only covers
			// the browser's own requests, so an unstubbed reply here would have
			// our server resolving these URLs for real.
			await page.route('**/api/embed-metadata', (route) =>
				route.fulfill({ contentType: 'application/json', body: JSON.stringify({ embeds: [] }) })
			);
		}

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			// Every supported URL in a body embeds, so both can share one message.
			await writeThread(
				ada.page,
				'look https://www.redgifs.com/watch/abc123stub ' +
					'https://www.reddit.com/r/askreddit/comments/stub123/a_title/ ' +
					'and https://example.com/plain'
			);

			// Everything the sender embedded renders. No gate: an embed in a
			// message is one the sender put there for the reader to see.
			const player = ada.page.locator('iframe[src="https://www.redgifs.com/ifr/abc123stub"]');
			await expect(player).toBeVisible();
			await expect(player).toHaveAttribute('sandbox', /allow-scripts/);
			await expect(player).not.toHaveAttribute('sandbox', /allow-top-navigation/);

			// Reddit included, which is the one that goes through our own server.
			// It resolves as soon as it is near the scrollport, not on a click.
			await expect(ada.page.getByText('A stubbed reddit post')).toBeVisible();
			await expect(
				ada.page.locator('iframe[src="https://www.redditmedia.com/x/embed"]')
			).toBeVisible();

			// The plain link stays an anchor, and gets no Show button: there is
			// nothing any provider could make of it.
			await expect(ada.page.locator('a[href="https://example.com/plain"]')).toBeVisible();
			await expect(ada.page.getByRole('button', { name: 'Show' })).toHaveCount(0);
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	/**
	 * A phone-width window gets a button, not a frame.
	 *
	 * Checked at this level because what matters is whether the overlay covers
	 * the real screen of a real page — which is the whole reason it exists — not
	 * how one component draws in a test frame.
	 */
	test('a narrow window opens an embed over the screen instead of framing it inline', async ({
		browser
	}) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		for (const page of [ada.page, jun.page]) {
			await page.route('**www.redgifs.com/**', (route) =>
				route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>gif</title>' })
			);
			await page.route('**noembed.com/**', (route) =>
				route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
			);
			await page.route('**/api/embed-metadata', (route) =>
				route.fulfill({ contentType: 'application/json', body: JSON.stringify({ embeds: [] }) })
			);
		}

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			// Narrowed only now: the invite round trip is not what is under test.
			await ada.page.setViewportSize({ width: 390, height: 844 });
			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			// The trailing word is load-bearing. An embed node is only inserted
			// once the caret leaves its link, so a message that *ends* with the
			// URL still has none when the composer says it is ready to send —
			// and the click on Send is what inserts it, growing the composer out
			// from under the press. The test then hangs for its full timeout on
			// a send that never happened, with nothing logged anywhere.
			await writeThread(ada.page, 'look https://www.redgifs.com/watch/abc123stub please');

			const player = ada.page.locator('iframe[src="https://www.redgifs.com/ifr/abc123stub"]');
			// The visible label is "Open"; the title after it is the visually
			// hidden half, which is what keeps a thread of these distinguishable.
			// Matched loosely because the two are separate elements and the
			// accessible name joins them.
			const open = ada.page.getByRole('button', { name: /^Open\s+Redgifs video$/ });

			// Nothing framed, and nothing fetched from the provider either.
			await expect(open).toBeVisible();
			await expect(player).toHaveCount(0);

			// Through the custom element, which only submits once it has upgraded.
			await clickWaButton(ada.page, /^Open\s+Redgifs video$/);
			await expect(player).toBeVisible();

			// Nearly the whole screen, which is the point: the player's own
			// chrome is what made the inline frame unusable at this width.
			const coverage = await ada.page.evaluate(() => {
				const host = document.querySelector('wa-dialog.embed-dialog');
				const rect = host?.shadowRoot?.querySelector('dialog')?.getBoundingClientRect();
				if (!rect) {
					throw new Error('expected the dialog to be laid out');
				}
				return { width: rect.width / window.innerWidth, height: rect.height / window.innerHeight };
			});
			expect(coverage.width).toBeGreaterThan(0.9);
			expect(coverage.height).toBeGreaterThan(0.9);

			// The header says where this came from and what it is.
			const header = ada.page.locator('wa-dialog.embed-dialog .dialog-header');
			await expect(header).toContainText('redgifs.com');
			await expect(header).toContainText('Redgifs video');

			// Closing takes the frame with it, which is what stops a player that
			// was left running.
			await clickWaButton(ada.page, 'Close embed');
			await expect(player).toHaveCount(0);
			await expect(open).toBeVisible();
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	test('a removed embed stays removed, and the reader can ask for it back', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		for (const page of [ada.page, jun.page]) {
			await page.route('**noembed.com/**', (route) =>
				route.fulfill({
					contentType: 'application/json',
					body: JSON.stringify({
						title: 'A stubbed vimeo clip',
						provider_name: 'Vimeo',
						html: '<iframe src="https://player.example/1"></iframe>'
					})
				})
			);
			await page.route('**player.example/**', (route) =>
				route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title>' })
			);
			await page.route('**/api/embed-metadata', async (route) => {
				const body = (route.request().postDataJSON() ?? null) as { urls?: string[] } | null;
				const [url] = Array.isArray(body?.urls) ? body.urls : [];
				await route.fulfill({
					contentType: 'application/json',
					body: JSON.stringify({
						embeds: url
							? [
									{
										href: url,
										fetchedAt: Date.now(),
										kind: 'iframe',
										providerName: url.includes('reddit') ? 'Reddit' : 'Vimeo',
										title: 'A stubbed vimeo clip',
										description: null,
										thumbnailUrl: null,
										canonicalUrl: url,
										imageUrl: null,
										iframeSrc: 'https://player.example/1',
										iframeHeight: 360,
										faviconUrl: null,
										themeColor: null
									}
								]
							: []
					})
				});
			});
		}

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			await clickWaButton(ada.page, 'Write something');

			/**
			 * A reddit share link embeds in the composer too. It is the one kind
			 * that cannot resolve itself in the browser — reddit's oEmbed is
			 * CORS-blocked — so before the composer asked for preview details it
			 * sat on a skeleton here while the sent message showed a card.
			 */
			await typeRichText(ada.page, 'https://www.reddit.com/r/freeuse/s/eBGQNK85qk ');
			await expect(
				ada.page.locator('.richtext-editor .composer-embed').getByText('A stubbed vimeo clip')
			).toBeVisible();
			// Cleared again so the rest of the test has one link to reason about.
			const surface = ada.page.locator('.richtext-editor .surface[contenteditable="true"]');
			await surface.click();
			await ada.page.keyboard.press('ControlOrMeta+A');
			await ada.page.keyboard.press('Backspace');
			await expect(surface).toHaveText('');

			const caretAt = () =>
				ada.page.evaluate(() => {
					const selection = document.getSelection();
					const node = selection?.anchorNode ?? null;
					return {
						text: node?.nodeType === Node.TEXT_NODE ? node.textContent : null,
						offset: selection?.anchorOffset ?? -1
					};
				});
			/**
			 * The text of the line the caret is on.
			 *
			 * Which line rather than which point: stepping off a block lands on an
			 * element point at the end of the block before it, which is the same
			 * place on screen as the text point inside it and is what Lexical
			 * leaves behind.
			 */
			const caretLine = () =>
				ada.page.evaluate(() => {
					const node = document.getSelection()?.anchorNode ?? null;
					const element =
						node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
					return element?.closest('p, .decorator-block')?.textContent ?? null;
				});
			const decorator = ada.page.locator('.richtext-editor .embed-block');

			/**
			 * Walks the caret left until it reaches `goal`, or gives up.
			 *
			 * By goal rather than by a fixed number of presses: how many stops
			 * Lexical puts inside a URL is its business, and pinning the count
			 * made this flaky for no benefit. The `settle` is not decoration —
			 * Lexical learns where the caret went from `selectionchange`, which is
			 * asynchronous, and a loop that outruns it walks straight past the
			 * stop it is looking for.
			 */
			const arrowLeftTo = async (goal: { text: string; offset: number }) => {
				for (let i = 0; i < 60; i += 1) {
					const at = await caretAt();
					if (at.text === goal.text && at.offset === goal.offset) {
						return;
					}
					await ada.page.keyboard.press('ArrowLeft');
					await settle(ada.page);
				}
			};
			const arrowLeft = async () => {
				await ada.page.keyboard.press('ArrowLeft');
				await settle(ada.page);
			};
			const arrowRight = async () => {
				await ada.page.keyboard.press('ArrowRight');
				await settle(ada.page);
			};

			/**
			 * An embed at the very top of the message has nothing to its left.
			 *
			 * The left arrow there used to hand the caret to the point in front of
			 * the embed — a real position that nothing draws a caret for — and the
			 * press after that sent it to the end of the message. Lexical's own
			 * answer is a block cursor above it, which is a row the writer cannot
			 * see and did not make. So the press does nothing at all, which is what
			 * these keys do at the start of any message, and the embed stays
			 * selected.
			 */
			await typeRichText(ada.page, 'hello https://vimeo.com/1 world');
			await expect(ada.page.locator('.richtext-editor .composer-embed')).toHaveCount(1);
			await arrowLeftTo({ text: 'hello ', offset: 0 });
			expect(await caretAt()).toEqual({ text: 'hello ', offset: 0 });

			await arrowLeft();
			await expect(decorator).toHaveClass(/is-selected/);
			await expect(surface).toHaveCSS('caret-color', 'rgba(0, 0, 0, 0)');

			// And there it stays, however many times it is pressed — including up,
			// which is the direction this was reported in.
			const blockCursor = ada.page.locator('.richtext-editor [data-lexical-cursor]');
			for (let i = 0; i < 3; i += 1) {
				await arrowLeft();
				await expect(decorator).toHaveClass(/is-selected/);
				await expect(blockCursor).toHaveCount(0);
			}
			await ada.page.keyboard.press('ArrowUp');
			await settle(ada.page);
			await expect(decorator).toHaveClass(/is-selected/);
			await expect(blockCursor).toHaveCount(0);

			await surface.click();
			await ada.page.keyboard.press('ControlOrMeta+A');
			await ada.page.keyboard.press('Backspace');
			await expect(surface).toHaveText('');

			await typeRichText(ada.page, 'first line');
			await ada.page.keyboard.press('Shift+Enter');
			await typeRichText(ada.page, 'watch https://vimeo.com/1');

			// The caret is still inside the link, so there is no embed yet — and
			// no offer to add one, because it is about to get one anyway. An offer
			// here reads as though the automatic insertion had failed.
			const embed = ada.page.locator('.richtext-editor .composer-embed');
			const composerLink = ada.page.locator('.richtext-editor .surface a').first();
			await expect(embed).toHaveCount(0);
			await composerLink.hover({ position: { x: 4, y: 4 } });
			await expect(ada.page.getByRole('button', { name: 'Add embed' })).toHaveCount(0);

			// A space finishes the link, which is what moves the caret off it and
			// puts the embed at the start of that line.
			await ada.page.keyboard.type(' ');

			// The real embed, in the composer, on its own row between the first
			// line and the line holding the link — not at the top of the message.
			// In the editor that reads as a block of its own between the two halves
			// of what was typed as one paragraph; stored, it goes back to an inline
			// node at the head of the link's line. See `embed-blocks.ts`.
			await expect(embed).toHaveCount(1);
			await expect(embed.getByText('A stubbed vimeo clip')).toBeVisible();
			const decoratorBlock = ada.page.locator('.richtext-editor .embed-block');
			await expect(decoratorBlock.locator('xpath=preceding-sibling::*[1]')).toHaveText(
				'first line'
			);
			await expect(decoratorBlock.locator('xpath=following-sibling::*[1]')).toContainText(
				'https://vimeo.com/1'
			);

			/**
			 * Arrowing left off the head of the link's line, one stop at a time.
			 *
			 * Three things have to hold, and each of them was wrong at some point:
			 * the caret stop beside the embed is an ordinary text position and
			 * must not look selected; the stop *on* the embed has no caret at all,
			 * so the browser's fallback caret at the top of the field has to stay
			 * hidden or it reads as the caret having jumped there; and the stop
			 * after that has to be somewhere a caret is actually drawn, which the
			 * point in front of the embed is not.
			 */
			const lineStart = { text: 'watch ', offset: 0 };
			await arrowLeftTo(lineStart);

			// Beside the embed, at the head of its link's line: a real caret.
			expect(await caretAt()).toEqual(lineStart);
			await expect(decorator).not.toHaveClass(/is-selected/);
			await expect(surface).not.toHaveCSS('caret-color', 'rgba(0, 0, 0, 0)');

			// One press on: the embed itself is the selection, and there is no
			// caret to draw.
			await arrowLeft();
			await expect(decorator).toHaveClass(/is-selected/);
			await expect(surface).toHaveCSS('caret-color', 'rgba(0, 0, 0, 0)');

			// One more: the end of the line above, not the start of the message.
			await arrowLeft();
			await expect(decorator).not.toHaveClass(/is-selected/);
			expect(await caretLine()).toBe('first line');
			await expect(surface).not.toHaveCSS('caret-color', 'rgba(0, 0, 0, 0)');

			// And back the way it came, press for press: right onto the embed, then
			// right off it. A stop in front of the embed would show up here as the
			// embed not being selected yet.
			await arrowRight();
			await expect(decorator).toHaveClass(/is-selected/);
			await arrowRight();
			await expect(decorator).not.toHaveClass(/is-selected/);
			expect(await caretLine()).toContain('watch ');

			/**
			 * Up and down, which have the same hole to cross.
			 *
			 * The embed is a block, so it has a row of its own — and that row holds
			 * no text position, so a line move over it lands on the row beyond and
			 * the embed cannot be reached from above or below at all. Reported as
			 * pressing up from the line under the embed jumping to the line over it.
			 */
			const arrowUp = async () => {
				await ada.page.keyboard.press('ArrowUp');
				await settle(ada.page);
			};
			const arrowDown = async () => {
				await ada.page.keyboard.press('ArrowDown');
				await settle(ada.page);
			};

			await arrowUp();
			await expect(decorator).toHaveClass(/is-selected/);
			await expect(surface).toHaveCSS('caret-color', 'rgba(0, 0, 0, 0)');

			await arrowUp();
			await expect(decorator).not.toHaveClass(/is-selected/);
			expect(await caretLine()).toBe('first line');

			// And down again, press for press.
			await arrowDown();
			await expect(decorator).toHaveClass(/is-selected/);
			await arrowDown();
			await expect(decorator).not.toHaveClass(/is-selected/);
			expect(await caretLine()).toContain('watch ');

			/**
			 * Except when the line the caret is in wraps.
			 *
			 * A wrapped line is several rows on screen and one line to Lexical, so
			 * the model cannot tell the row above the caret from the line above it
			 * — and taking the press on the second row would jump the caret clean
			 * out of the line it is in. The browser is asked where the press was
			 * going before it is taken over; this is the case that asks.
			 */
			await ada.page.keyboard.press('ControlOrMeta+A');
			await ada.page.keyboard.press('ArrowRight');
			await ada.page.keyboard.insertText(
				' and then a good deal more text, enough of it that the line this is on has to be broken across more than one row before it reaches the end'
			);
			await settle(ada.page);
			const rowsOfCaretLine = () =>
				ada.page.evaluate(() => {
					const node = document.getSelection()?.anchorNode ?? null;
					if (!node) {
						return 0;
					}
					const range = document.createRange();
					range.selectNodeContents(node);
					return range.getClientRects().length;
				});
			// Asserted rather than assumed: a line that fitted would make the check
			// below pass for the wrong reason.
			expect(await rowsOfCaretLine()).toBeGreaterThan(1);

			await arrowUp();
			await expect(decorator).not.toHaveClass(/is-selected/);
			expect((await caretAt()).text).toContain('more text');

			/**
			 * And a press on the card, which is how a pointer says "that one".
			 *
			 * Not the player: the preview is `pointer-events: none` all through,
			 * so every press inside it lands on the same element and only where it
			 * landed tells them apart.
			 */
			const player = ada.page.locator('.richtext-editor .composer-embed iframe');
			const box = await player.boundingBox();
			if (!box) {
				throw new Error('the player has no box to press');
			}
			await ada.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
			await settle(ada.page);
			await expect(decorator).not.toHaveClass(/is-selected/);

			await ada.page
				.locator('.richtext-editor .composer-embed')
				.click({ position: { x: 4, y: 4 } });
			await expect(decorator).toHaveClass(/is-selected/);
			await expect(surface).toHaveCSS('caret-color', 'rgba(0, 0, 0, 0)');

			/**
			 * An embed caught inside an ordinary text selection is selected too —
			 * typing over the selection takes it with everything else, so it has
			 * to look like it is going.
			 */
			await surface.click();
			await ada.page.keyboard.press('ControlOrMeta+A');
			await expect(decorator).toHaveClass(/is-selected/);
			// The range has a caret of its own, so nothing is hidden for it.
			await expect(surface).not.toHaveCSS('caret-color', 'rgba(0, 0, 0, 0)');

			// Back to the end, so what follows starts where it used to.
			await ada.page.keyboard.press('ControlOrMeta+A');
			await ada.page.keyboard.press('ArrowRight');

			// Removing it is meant to stick. Typing afterwards runs the same sweep
			// that inserted it in the first place, so this is the real check.
			await ada.page.getByRole('button', { name: /^Remove embedded preview/ }).click();
			await expect(embed).toHaveCount(0);
			await typeRichText(ada.page, 'later');
			await expect(embed).toHaveCount(0);

			// Hovering the link offers it back — the one way to undo a removal.
			// The button lives inside the link's own wrapper and is revealed by
			// CSS, so nothing but the hover is needed, and it is hidden (not
			// just unclickable) until then. The wrapper is what gets hovered, not
			// the `<a>`: the button is drawn over the anchor's centre as its
			// sibling, and Playwright refuses a hover that lands on anything but
			// the target or its descendants.
			const addEmbed = ada.page.getByRole('button', { name: 'Add embed' });
			await expect(addEmbed).toBeHidden();
			await ada.page.locator('.richtext-editor .surface .link-with-embed-offer').first().hover();
			await addEmbed.click();
			await expect(embed).toHaveCount(1);
			await ada.page.getByRole('button', { name: /^Remove embedded preview/ }).click();
			await expect(embed).toHaveCount(0);

			await expect(ada.page.getByRole('button', { name: 'Send' })).toBeEnabled();
			await clickWaButton(ada.page, 'Send');
			await ada.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);

			// The message went out without the embed, so the reader gets the link
			// and an offer rather than a card.
			const message = ada.page.locator('.messages li');
			await expect(message.locator('a[href="https://vimeo.com/1"]')).toBeVisible();
			await expect(message.locator('.card')).toHaveCount(0);

			const show = ada.page.getByRole('button', { name: 'Show' });
			await expect(show).toHaveCount(1);
			await show.click();

			// The card lands on the link's own line, and the offer goes.
			await expect(message.getByText('A stubbed vimeo clip')).toBeVisible();
			await expect(message.locator('.embed-slot')).toHaveCount(1);
			await expect(ada.page.getByRole('button', { name: 'Show' })).toHaveCount(0);

			/**
			 * The card's frame is mixed from the text colour it inherits, not from
			 * a fixed black — which is what keeps it visible on a sent message's
			 * brand-blue bubble and on a received one in dark mode. Asserted on
			 * the sent bubble, where the text is white in both themes, so a black
			 * border would be unmistakable.
			 */
			const frame = await message.locator('.card-shell').evaluate((node) => ({
				border: getComputedStyle(node).borderTopColor,
				text: getComputedStyle(node).color
			}));
			expect(frame.text).toContain('255, 255, 255');
			// Chromium serialises a `color-mix` result in `color(srgb …)` form, so
			// both spellings of white are accepted; what matters is that it is the
			// text's colour and not the fixed black it used to be.
			expect(frame.border).toMatch(/srgb 1 1 1|255, 255, 255/);

			// Revealing is this reader's own view state and nothing more — the
			// message itself is unchanged, so a reload starts over.
			await ada.page.reload();
			await expect(ada.page.getByRole('button', { name: 'Show' })).toHaveCount(1);
			await expect(ada.page.locator('.messages .embed-slot')).toHaveCount(0);
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	/**
	 * The composer's embed lifecycle for a URL typed mid-sentence, one
	 * requirement per step:
	 *
	 * 1. finishing the URL embeds it on its own, with no "Add embed" offer;
	 * 2. removing the embed makes the offer appear on hover;
	 * 3. moving the caret onto the URL and off again does not re-embed it;
	 * 4. editing the URL does, because it is a different URL now.
	 */
	test('a typed URL embeds itself, and a removed one waits to be asked', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');
		// The embed's iframe, stubbed so the suite never loads YouTube.
		await ada.page.route('**youtube-nocookie.com/**', (route) =>
			route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title>' })
		);

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			await clickWaButton(ada.page, 'Write something');

			const url = 'https://www.youtube.com/watch?v=GTx1UYV9Y-o';
			const embed = ada.page.locator('.richtext-editor .composer-embed');
			const link = ada.page.locator('.richtext-editor .surface .link-with-embed-offer').first();
			const addEmbed = ada.page.getByRole('button', { name: 'Add embed' });

			// 1. Typed mid-sentence, the URL embeds as soon as the caret leaves
			// it, and there is nothing to offer while the embed is there.
			await typeRichText(ada.page, `hello ${url} world`);
			await expect(embed).toHaveCount(1);
			await expect(link).not.toHaveClass(/embed-available/);
			await link.hover();
			await expect(addEmbed).toBeHidden();

			// 2. Removed, it stays removed, and hovering the link offers it back.
			await ada.page.getByRole('button', { name: /^Remove embedded preview/ }).click();
			await expect(embed).toHaveCount(0);
			await ada.page.mouse.move(0, 0);
			await expect(addEmbed).toBeHidden();
			await link.hover();
			await expect(addEmbed).toBeVisible();
			await ada.page.mouse.move(0, 0);

			// 3. Walking the caret into the URL and back out is exactly the
			// gesture that inserts an embed the first time — for a removed one it
			// must do nothing.
			// Clicked at its very start rather than its centre, which is where the
			// link — and so the button — may be.
			const surface = ada.page.locator('.richtext-editor .surface[contenteditable="true"]');
			await surface.click({ position: { x: 2, y: 2 } });
			await ada.page.keyboard.press('End');
			for (let i = 0; i < ' world'.length + 3; i += 1) {
				await ada.page.keyboard.press('ArrowLeft');
				await settle(ada.page);
			}
			// Otherwise the check below passes for the wrong reason.
			const caretInLink = () =>
				ada.page.evaluate(() =>
					Boolean(document.getSelection()?.anchorNode?.parentElement?.closest('.surface a'))
				);
			expect(await caretInLink()).toBe(true);
			for (let i = 0; i < ' world'.length + 3; i += 1) {
				await ada.page.keyboard.press('ArrowRight');
				await settle(ada.page);
			}
			expect(await caretInLink()).toBe(false);
			await ada.page.keyboard.type('!');
			await expect(embed).toHaveCount(0);

			// 4. Editing the URL makes it a different URL, which has never been
			// dismissed, so it gets an embed again. The caret is put at the end of
			// the URL by walking left from the end of the line.
			await ada.page.keyboard.press('End');
			for (const _ of ' world!') {
				await ada.page.keyboard.press('ArrowLeft');
				await settle(ada.page);
			}
			await ada.page.keyboard.type('0');
			await ada.page.keyboard.press('End');
			await expect(embed).toHaveCount(1);
			await expect(ada.page.locator('.richtext-editor .embed-block')).toHaveAttribute(
				'aria-label',
				`Embedded preview of ${url}0`
			);
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});

test.describe('drafts', () => {
	/**
	 * Unsent words must never be lost: every composer keeps its draft on the
	 * device, sealed to the writer's own key, until it is sent or emptied. See
	 * `src/lib/messaging/drafts.ts` and docs/user-commitments-and-product-goals.md.
	 */
	const surface = (scope: Page | Locator) => scope.locator('.richtext-editor .surface').first();

	/**
	 * The stored ciphertext for one composer, or null when there is none.
	 * `scope` is the key's scope part: `:thread:<id>`, or `:new-thread:`, which
	 * the partnership id follows.
	 */
	function storedDraft(page: Page, scope: string): Promise<string | null> {
		return page.evaluate((part) => {
			const key = Object.keys(localStorage).find(
				(candidate) => candidate.startsWith('bound-up:draft:') && candidate.includes(part)
			);
			return key ? localStorage.getItem(key) : null;
		}, scope);
	}

	/**
	 * Waits for a composer's draft to be written, and returns it.
	 *
	 * A draft is encrypted before it is stored, so the write lands a moment
	 * after the keystroke. A person does not reload in that moment; a test
	 * would, so it waits for the stored value to move off `previous`.
	 */
	async function draftWritten(
		page: Page,
		scope: string,
		previous: string | null = null
	): Promise<string> {
		await expect
			.poll(async () => {
				const stored = await storedDraft(page, scope);
				return stored !== null && stored !== previous;
			})
			.toBe(true);
		return defined(await storedDraft(page, scope), `the stored ${scope} draft`);
	}

	const threadIdOf = (url: string) => {
		const [, threadId] = defined(
			/\/messages\/(?<threadId>[0-9a-f-]{36})$/.exec(url),
			`a thread URL, not ${url}`
		);
		return defined(threadId, `the thread id in ${url}`);
	};

	test('a reply draft survives a reload and stays with its own thread', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');
			const board = ada.page.url();
			await writeThread(ada.page, 'the first thread');
			const first = ada.page.url();
			await ada.page.goto(board);
			await writeThread(ada.page, 'the second thread');
			const second = ada.page.url();
			const firstScope = `:thread:${threadIdOf(first)}`;
			const secondScope = `:thread:${threadIdOf(second)}`;

			// 1. A draft in the first thread comes back after a reload.
			await ada.page.goto(first);
			await fillRichText(ada.page, 'unsent reply to the first');
			let firstStored = await draftWritten(ada.page, firstScope);
			await ada.page.reload();
			await expect(surface(ada.page)).toHaveText('unsent reply to the first');

			// 2. The second thread has its own, which starts empty and is kept too.
			await ada.page.goto(second);
			await expect(surface(ada.page)).toHaveText('');
			await fillRichText(ada.page, 'unsent reply to the second');
			const secondStored = await draftWritten(ada.page, secondScope);
			await ada.page.reload();
			await expect(surface(ada.page)).toHaveText('unsent reply to the second');

			// 3. Editing the first leaves the second exactly as it was, stored
			// bytes included.
			await ada.page.goto(first);
			await expect(surface(ada.page)).toHaveText('unsent reply to the first');
			await fillRichText(ada.page, 'unsent reply to the first, edited');
			firstStored = await draftWritten(ada.page, firstScope, firstStored);
			expect(await storedDraft(ada.page, secondScope)).toBe(secondStored);

			// Reached by a client-side navigation this time, not a load.
			await ada.page.getByRole('link', { name: 'Back to messages' }).click();
			await ada.page.waitForURL(/\/messages$/);
			await ada.page.getByRole('link').filter({ hasText: 'the second thread' }).click();
			await ada.page.waitForURL(second);
			await expect(surface(ada.page)).toHaveText('unsent reply to the second');

			// 4. Neither reply draft leaks into the new-message dialog, and writing
			// there touches neither of them.
			await ada.page.goto(board);
			await clickWaButton(ada.page, 'Write something');
			const dialog = ada.page.locator('wa-dialog');
			await expect(ada.page.getByLabel('Message to Jun')).toBeVisible();
			await expect(surface(dialog)).toHaveText('');
			await fillRichText(dialog, 'the start of a new thread');
			await draftWritten(ada.page, ':new-thread:', null);
			expect(await storedDraft(ada.page, firstScope)).toBe(firstStored);
			expect(await storedDraft(ada.page, secondScope)).toBe(secondStored);

			await ada.page.goto(first);
			await expect(surface(ada.page)).toHaveText('unsent reply to the first, edited');

			// 5. Sending is what ends a draft — and only that thread's.
			await expect(ada.page.getByRole('button', { name: 'Send' })).toBeEnabled();
			await clickWaButton(ada.page, 'Send');
			await expect(ada.page.locator('.messages')).toContainText(
				'unsent reply to the first, edited'
			);
			await expect(surface(ada.page)).toHaveText('');
			await expect.poll(() => storedDraft(ada.page, firstScope)).toBeNull();
			await ada.page.reload();
			await expect(ada.page.locator('.messages')).toContainText(
				'unsent reply to the first, edited'
			);
			await expect(surface(ada.page)).toHaveText('');

			await ada.page.goto(second);
			await expect(surface(ada.page)).toHaveText('unsent reply to the second');
		} finally {
			await ada.close();
			await jun.close();
		}
	});

	test('the new-message draft keeps its tags, but only while it has text', async ({ browser }) => {
		const ada = await newSide(browser, 'Ada');
		const jun = await newSide(browser, 'Jun');

		try {
			await signUp(ada.page, ada.who);
			await signUp(jun.page, jun.who);
			await linkAccounts(ada, jun);

			await ada.page.goto('/home');
			await openBoard(ada.page, 'Jun');

			const dialog = ada.page.locator('wa-dialog');
			const composer = ada.page.getByLabel('Message to Jun');
			const chip = dialog.getByRole('button', { name: 'Edit planning' });

			async function openDialog() {
				await clickWaButton(ada.page, 'Write something');
				await expect(composer).toBeVisible();
			}
			async function closeDialog() {
				await clickWaButton(ada.page, 'Close');
				await expect(composer).toBeHidden();
			}

			// 1. Text and a freshly created tag.
			await openDialog();
			await clickWaButton(ada.page, 'Add tag');
			await ada.page.locator('wa-dropdown-item').filter({ hasText: 'New tag' }).click();
			await ada.page.getByLabel('New tag', { exact: true }).fill('planning');
			await ada.page.getByRole('button', { name: 'Add', exact: true }).click();
			await expect(chip).toBeVisible();
			await fillRichText(dialog, 'a thought about the weekend');
			await draftWritten(ada.page, ':new-thread:');

			// 2. Closed and reopened, both are there.
			await closeDialog();
			await openDialog();
			await expect(surface(dialog)).toHaveText('a thought about the weekend');
			await expect(chip).toBeVisible();

			// 3. And across a reload.
			await ada.page.reload();
			await openDialog();
			await expect(surface(dialog)).toHaveText('a thought about the weekend');
			await expect(chip).toBeVisible();

			// 4. Emptied, the draft goes — tags with it.
			await surface(dialog).click();
			await ada.page.keyboard.press('ControlOrMeta+a');
			await ada.page.keyboard.press('Backspace');
			await expect(surface(dialog)).toHaveText('');
			await expect.poll(() => storedDraft(ada.page, ':new-thread:')).toBeNull();
			await closeDialog();
			await openDialog();
			await expect(surface(dialog)).toHaveText('');
			await expect(chip).toHaveCount(0);

			// 5. A tag on its own is not a draft, either.
			await clickWaButton(ada.page, 'Add tag');
			await ada.page.locator('wa-dropdown-item').filter({ hasText: 'planning' }).click();
			await expect(chip).toBeVisible();
			await closeDialog();
			await openDialog();
			await expect(chip).toHaveCount(0);
			expect(await storedDraft(ada.page, ':new-thread:')).toBeNull();

			// 6. Sending ends it: the thread is tagged, and the dialog starts fresh.
			await clickWaButton(ada.page, 'Add tag');
			await ada.page.locator('wa-dropdown-item').filter({ hasText: 'planning' }).click();
			await fillRichText(dialog, 'sent with its tag');
			await draftWritten(ada.page, ':new-thread:');
			await expect(ada.page.getByRole('button', { name: 'Send' })).toBeEnabled();
			await clickWaButton(ada.page, 'Send');
			await ada.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
			await expect(ada.page.locator('.thread-tags')).toContainText('planning');
			expect(await storedDraft(ada.page, ':new-thread:')).toBeNull();

			await ada.page.getByRole('link', { name: 'Back to messages' }).click();
			await ada.page.waitForURL(/\/messages$/);
			await openDialog();
			await expect(surface(dialog)).toHaveText('');
			await expect(chip).toHaveCount(0);
		} finally {
			await ada.close();
			await jun.close();
		}
	});
});
