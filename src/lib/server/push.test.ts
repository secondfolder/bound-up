import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PUSH_DEVICES } from '$lib/notifications';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { createTestPartnership, createTestUser, type TestUser } from '$lib/testing/fixtures';
import {
	createTestBrowserSubscription,
	createTestPushService,
	createTestVapid,
	decryptPush,
	type TestBrowserSubscription
} from '$lib/testing/push';
import { testSettings } from '$lib/testing/settings';
import type { Db } from './db';
import { pushSubscriptions } from './db/schema';
import { requireMembership } from './messaging';
import {
	checkPushOwnership,
	deletePushDevice,
	listPushDevices,
	notifyPartner,
	readVapidConfig,
	savePushSubscription,
	sendPush,
	updatePushDevice,
	type VapidConfig,
	watchingDevices
} from './push';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

let testDb: TestDb;
let db: Db;
let vapid: VapidConfig;
let ada: TestUser;
let bo: TestUser;

beforeEach(async () => {
	testDb = await createTestDb();
	({ db } = testDb);
	vapid = await createTestVapid();
	ada = await createTestUser(db, { name: 'Ada' });
	bo = await createTestUser(db, { name: 'Bo' });
});

afterEach(() => {
	testDb.close();
	vi.unstubAllGlobals();
});

async function subscribe(owner: TestUser, browser?: TestBrowserSubscription) {
	const sub = browser ?? (await createTestBrowserSubscription());
	const id = await savePushSubscription(db, owner.id, {
		endpoint: sub.endpoint,
		p256dh: sub.p256dh,
		auth: sub.auth,
		label: 'Safari on iPhone'
	});
	return { id, browser: sub };
}

const message = {
	kind: 'message' as const,
	threadId: '0b5f6c1e-6a7d-4c43-9a3b-2f1f0e8d9c7b',
	url: 'https://app.test/messages/t'
};

describe('readVapidConfig', () => {
	const keys = { vapidPublicKey: 'pub', vapidPrivateKey: 'priv' };

	it('is null without both keys, so a half-configured server sends nothing', () => {
		expect(readVapidConfig(testSettings({ vapidSubject: 'mailto:a@b' }))).toBeNull();
		expect(
			readVapidConfig(testSettings({ vapidPublicKey: 'pub', vapidSubject: 'mailto:a@b' }))
		).toBeNull();
	});

	it('takes the contact address set for it', () => {
		expect(readVapidConfig(testSettings({ ...keys, vapidSubject: 'mailto:a@b' }))).toEqual({
			publicKey: 'pub',
			privateKey: 'priv',
			subject: 'mailto:a@b'
		});
	});

	it('falls back to the address email is sent from, and is off with neither', () => {
		expect(
			readVapidConfig(testSettings({ ...keys, mailFrom: 'Bound Up <hello@example.test>' }))
		).toMatchObject({ subject: 'mailto:hello@example.test' });
		expect(readVapidConfig(testSettings({ ...keys, mailFrom: 'hi@example.test' }))).toMatchObject({
			subject: 'mailto:hi@example.test'
		});
		expect(readVapidConfig(testSettings(keys))).toBeNull();
	});
});

describe('devices', () => {
	it('lists a user’s devices without their endpoints', async () => {
		await subscribe(ada);
		const [device] = await listPushDevices(db, ada.id);
		expect(device).toMatchObject({
			label: 'Safari on iPhone',
			notifyMessages: true,
			notifyReactions: true
		});
		expect(device).not.toHaveProperty('endpoint');
		expect(await listPushDevices(db, bo.id)).toEqual([]);
	});

	/**
	 * Without the upsert, re-subscribing would add a second row for one browser
	 * and every notification would show twice.
	 */
	it('treats the same endpoint as the same device, and moves it to whoever subscribed last', async () => {
		const first = await subscribe(ada);
		const again = await subscribe(ada, first.browser);
		expect(again.id).toBe(first.id);

		const taken = await subscribe(bo, first.browser);
		expect(taken.id).toBe(first.id);
		expect(await listPushDevices(db, ada.id)).toEqual([]);
		expect(await listPushDevices(db, bo.id)).toHaveLength(1);
	});

	it('keeps at most MAX_PUSH_DEVICES, dropping the oldest', async () => {
		const ids: string[] = [];
		for (let index = 0; index <= MAX_PUSH_DEVICES; index += 1) {
			const { id } = await subscribe(ada);
			ids.push(id);
			// createdAt has millisecond resolution; keep the order unambiguous.
			await db
				.update(pushSubscriptions)
				.set({ createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)) })
				.where(eq(pushSubscriptions.id, id));
		}
		const kept = (await listPushDevices(db, ada.id)).map((device) => device.id);
		expect(kept).toHaveLength(MAX_PUSH_DEVICES);
		expect(kept).not.toContain(ids[0]);
		expect(kept).toContain(ids.at(-1));
	});

	it('only changes or deletes the user’s own devices', async () => {
		const { id } = await subscribe(ada);
		expect(await updatePushDevice(db, bo.id, id, { notifyMessages: false })).toBe(false);
		expect(await deletePushDevice(db, bo.id, id)).toBe(false);

		expect(await updatePushDevice(db, ada.id, id, { notifyReactions: false })).toBe(true);
		expect((await listPushDevices(db, ada.id))[0]?.notifyReactions).toBe(false);
		expect(await deletePushDevice(db, ada.id, id)).toBe(true);
		expect(await listPushDevices(db, ada.id)).toEqual([]);
	});
});

/**
 * A browser that changes hands without the settings screen's sign-out keeps
 * the previous account's subscription. Found on a Mac whose Firefox, signed in
 * as one account, was still being sent the other account's notifications.
 */
describe('checkPushOwnership', () => {
	it('confirms a subscription that is the signed-in account’s', async () => {
		const { id, browser } = await subscribe(ada);
		expect(await checkPushOwnership(db, ada.id, browser.endpoint)).toEqual({
			status: 'yours',
			id
		});
		expect(await listPushDevices(db, ada.id)).toHaveLength(1);
	});

	it('deletes one that is another account’s, and gives it to nobody', async () => {
		const { browser } = await subscribe(ada);
		const kept = await subscribe(ada);

		expect(await checkPushOwnership(db, bo.id, browser.endpoint)).toEqual({ status: 'released' });

		// Only that browser's row: Ada's other devices still hear from her partner.
		expect((await listPushDevices(db, ada.id)).map((device) => device.id)).toEqual([kept.id]);
		// Never handed over: Bo did not ask for notifications.
		expect(await listPushDevices(db, bo.id)).toEqual([]);
	});

	it('reports one no account has', async () => {
		const browser = await createTestBrowserSubscription();
		expect(await checkPushOwnership(db, ada.id, browser.endpoint)).toEqual({ status: 'unknown' });
	});
});

describe('sendPush', () => {
	it('sends each device a payload only it can open, saying nothing about who or what', async () => {
		const { browser } = await subscribe(bo);
		const service = createTestPushService();

		const outcome = await sendPush(db, vapid, { userId: bo.id, ...message }, service.fetch);

		expect(outcome).toEqual({ sent: 1, removed: 0, failed: 0 });
		const request = defined(service.received[0], 'the push request');
		expect(request.endpoint).toBe(browser.endpoint);
		expect(request.headers).toMatchObject({
			'content-encoding': 'aes128gcm',
			urgency: 'high',
			topic: message.threadId.replaceAll('-', '')
		});
		expect(request.headers.authorization).toMatch(/^vapid t=.+, k=/);
		expect(await decryptPush(browser, request.body)).toEqual({
			web_push: 8030,
			notification: {
				title: 'New message',
				navigate: message.url,
				tag: `thread-${message.threadId}`,
				lang: 'en'
			}
		});
		expect((await listPushDevices(db, bo.id))[0]?.lastSuccessAt).toBeInstanceOf(Date);
	});

	it('leaves out devices that turned the category off, and devices already watching', async () => {
		const reactionsOff = await subscribe(bo);
		await updatePushDevice(db, bo.id, reactionsOff.id, { notifyReactions: false });
		const watching = await subscribe(bo);
		const target = await subscribe(bo);
		const service = createTestPushService();

		const outcome = await sendPush(
			db,
			vapid,
			{ userId: bo.id, ...message, kind: 'reaction', skipDeviceIds: [watching.id] },
			service.fetch
		);

		expect(outcome.sent).toBe(1);
		expect(service.received.map((request) => request.endpoint)).toEqual([target.browser.endpoint]);
		const payload = await decryptPush(target.browser, defined(service.received[0], 'push').body);
		expect(payload).toMatchObject({ notification: { title: 'New reaction' } });
	});

	it('deletes a device the push service says is gone, and keeps one that merely failed', async () => {
		const gone = await subscribe(bo);
		const flaky = await subscribe(bo);
		const service = createTestPushService((endpoint) =>
			endpoint === gone.browser.endpoint ? 410 : 500
		);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const outcome = await sendPush(db, vapid, { userId: bo.id, ...message }, service.fetch);

		expect(outcome).toEqual({ sent: 0, removed: 1, failed: 1 });
		expect((await listPushDevices(db, bo.id)).map((device) => device.id)).toEqual([flaky.id]);
	});

	/** The write it follows has committed; a throw here would turn a sent message into a 500. */
	it('never throws, even when the network does', async () => {
		await subscribe(bo);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const outcome = await sendPush(db, vapid, { userId: bo.id, ...message }, () =>
			Promise.reject(new Error('offline'))
		);
		expect(outcome).toEqual({ sent: 0, removed: 0, failed: 1 });
	});
});

describe('watchingDevices', () => {
	it('takes only the recipient’s own devices, so the sender cannot silence anyone', () => {
		expect(
			watchingDevices(
				[
					{ userId: 'bo', deviceId: 'bo-phone', streamId: 's-1' },
					{ userId: 'bo', deviceId: null, streamId: 's-2' },
					{ userId: 'ada', deviceId: 'bo-laptop', streamId: 's-3' }
				],
				'bo'
			)
		).toEqual(['bo-phone']);
	});
});

describe('notifyPartner', () => {
	it('names nobody, and runs in the background', async () => {
		// The server cannot read the names, and even if it could, a notification
		// must not carry them: it is shown on a lock screen and passes through
		// the push service.
		const { id } = await createTestPartnership(db, ada, bo);
		const membership = defined(await requireMembership(db, id, ada.id), 'membership');
		const { browser } = await subscribe(bo);
		const service = createTestPushService();
		vi.stubGlobal('fetch', service.fetch);

		const tasks: Promise<unknown>[] = [];
		notifyPartner(
			{
				locals: {
					db,
					settings: testSettings({
						vapidPublicKey: vapid.publicKey,
						vapidPrivateKey: vapid.privateKey,
						vapidSubject: vapid.subject
					})
				} as App.Locals,
				url: new URL('https://app.test/api/spaces/x/threads'),
				platform: {
					ctx: { waitUntil: (task: Promise<unknown>) => tasks.push(task) }
				} as unknown as App.Platform
			},
			{ partnership: membership.partnership, kind: 'thread', threadId: 't-1', watching: [] }
		);
		await Promise.all(tasks);

		expect(tasks).toHaveLength(1);
		const payload = await decryptPush(browser, defined(service.received[0], 'push').body);
		expect(payload).toMatchObject({
			notification: {
				title: 'New message',
				// The thread's own page, whatever context the device is in.
				navigate: 'https://app.test/messages/t-1'
			}
		});
		expect(JSON.stringify(payload)).not.toMatch(/Ace|Bobby/);
	});

	it('does nothing when push is not set up on this server', async () => {
		const { id } = await createTestPartnership(db, ada, bo);
		const membership = defined(await requireMembership(db, id, ada.id), 'membership');
		await subscribe(bo);
		const tasks: Promise<unknown>[] = [];

		notifyPartner(
			{
				locals: { db, settings: testSettings() } as App.Locals,
				url: new URL('https://app.test/'),
				platform: {
					ctx: { waitUntil: (task: Promise<unknown>) => tasks.push(task) }
				} as unknown as App.Platform
			},
			{ partnership: membership.partnership, kind: 'message', threadId: 't-1', watching: [] }
		);

		expect(tasks).toEqual([]);
	});
});
