import type { Browser } from '@playwright/test';
import { expect } from '@playwright/test';
import { sql } from './db';
import { test } from './fixtures';
import { account, clickWaButton, logOut, signUp, waitForHydration } from './helpers';

/**
 * Turning push notifications on and off, through the real settings screen,
 * service worker registration and endpoints.
 *
 * The browser's `PushManager` is faked, because subscribing for real would
 * have headless Chromium register with Google's push service. The fake hands
 * out a genuine P-256 key and an FCM-shaped endpoint, so the server's
 * validation is exercised exactly as for a real browser. No spec here sends a
 * message to a subscribed account, so the server never tries to deliver to
 * that endpoint; what delivery sends, and that it decrypts, is pinned by
 * `src/lib/server/push.test.ts`.
 */
async function pushCapableDevice(browser: Browser, options: { userAgent?: string } = {}) {
	const context = await browser.newContext({
		...options,
		permissions: ['clipboard-read', 'clipboard-write']
	});
	await context.addInitScript(() => {
		// Headless Chromium reports notifications as denied whatever the context
		// was granted, so the permission is faked along with the subscription.
		Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
		Notification.requestPermission = () => Promise.resolve('granted');

		// Kept in localStorage so the subscription survives a reload, as a real
		// one does.
		const Key = 'e2e:fake-push-subscription';
		const toSubscription = (json: { endpoint: string }) => ({
			endpoint: json.endpoint,
			toJSON: () => json,
			unsubscribe: () => {
				localStorage.removeItem(Key);
				return Promise.resolve(true);
			}
		});
		const base64url = (bytes: Uint8Array) =>
			btoa(String.fromCharCode(...bytes))
				.replaceAll('+', '-')
				.replaceAll('/', '_')
				.replace(/[=]+$/, '');

		PushManager.prototype.getSubscription = function getSubscription() {
			const stored = localStorage.getItem(Key);
			return Promise.resolve(
				(stored ? toSubscription(JSON.parse(stored)) : null) as PushSubscription | null
			);
		};
		PushManager.prototype.subscribe = async function subscribe() {
			const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
				'deriveBits'
			])) as CryptoKeyPair;
			const json = {
				endpoint: `https://fcm.googleapis.com/fcm/send/e2e-${crypto.randomUUID()}`,
				expirationTime: null,
				keys: {
					p256dh: base64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
					auth: base64url(crypto.getRandomValues(new Uint8Array(16)))
				}
			};
			localStorage.setItem(Key, JSON.stringify(json));
			return toSubscription(json) as unknown as PushSubscription;
		};
	});
	const page = await context.newPage();
	return { page, close: () => context.close() };
}

async function deviceRows(email: string) {
	const result = await sql(
		`select notify_messages, notify_reactions from push_subscriptions
		 where user_id = (select id from user where email = ?)`,
		[email]
	);
	return result.rows;
}

async function openNotificationSettings(page: import('@playwright/test').Page) {
	await page.goto('/settings');
	await page.getByRole('link', { name: 'Notifications' }).click();
	await page.waitForURL('/settings/notifications');
	await waitForHydration(page);
}

test.describe('push notification settings', () => {
	test('turns notifications on for this device, saves a category, and turns them off', async ({
		browser
	}) => {
		const device = await pushCapableDevice(browser);
		const who = account('Noor');
		try {
			const { page } = device;
			await signUp(page, who);
			await openNotificationSettings(page);

			await clickWaButton(page, 'Turn on notifications');
			const row = page.getByTestId('push-device');
			await expect(row).toContainText('This device');
			await expect.poll(() => deviceRows(who.email)).toHaveLength(1);

			// Reactions off. The host, not its `role="switch"` input: that input is
			// visually hidden, so Playwright waits for it to become visible for ever.
			await row.locator('wa-switch', { hasText: 'Reactions to your messages' }).click();
			await expect.poll(async () => (await deviceRows(who.email))[0]?.notify_reactions).toBe(0);

			// Still subscribed after a reload: the browser and server agree.
			await page.reload();
			await waitForHydration(page);
			await expect(page.getByTestId('push-device')).toContainText('This device');

			await page.getByTestId('push-device').getByRole('button', { name: 'Turn off' }).click();
			await expect(page.getByRole('button', { name: 'Turn on notifications' })).toBeVisible();
			await expect.poll(() => deviceRows(who.email)).toHaveLength(0);
		} finally {
			await device.close();
		}
	});

	/** A notification names a partner on the lock screen; that stops with the session. */
	test('forgets this device on sign-out', async ({ browser }) => {
		const device = await pushCapableDevice(browser);
		const who = account('Omar');
		try {
			const { page } = device;
			await signUp(page, who);
			await openNotificationSettings(page);
			await clickWaButton(page, 'Turn on notifications');
			await expect.poll(() => deviceRows(who.email)).toHaveLength(1);

			await logOut(page);
			await expect.poll(() => deviceRows(who.email)).toHaveLength(0);
		} finally {
			await device.close();
		}
	});

	test('tells an iPhone in a browser tab to add the app to the Home Screen first', async ({
		browser
	}) => {
		const device = await pushCapableDevice(browser, {
			userAgent:
				'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
		});
		try {
			const { page } = device;
			await signUp(page, account('Pia'));
			await openNotificationSettings(page);
			await expect(page.getByTestId('push-needs-install')).toBeVisible();
			await expect(page.getByRole('button', { name: 'Turn on notifications' })).toHaveCount(0);
		} finally {
			await device.close();
		}
	});
});
