import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listPushDevices } from '$lib/server/push';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import { createTestBrowserSubscription, createTestVapid } from '$lib/testing/push';
import { POST } from './+server';
import { DELETE, PATCH } from './[id]/+server';
import { POST as CHECK } from './check/+server';

/**
 * The device endpoints. `$env/dynamic/private` stands in for the server's
 * configuration; these routes never see a platform, as under `vite dev`.
 */
const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock('$env/dynamic/private', () => ({ env }));

let harness: TestDb;
let ada: TestUser;
let bo: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	bo = await createTestUser(harness.db, { name: 'Bo' });
	const vapid = await createTestVapid();
	env.VAPID_PUBLIC_KEY = vapid.publicKey;
	env.VAPID_PRIVATE_KEY = vapid.privateKey;
	env.VAPID_SUBJECT = vapid.subject;
});

afterEach(() => harness.close());

async function body(endpoint?: string) {
	const sub = await createTestBrowserSubscription(endpoint);
	return {
		endpoint: sub.endpoint,
		expirationTime: null,
		keys: { p256dh: sub.p256dh, auth: sub.auth },
		label: 'Safari on iPhone'
	};
}

describe('POST /api/push/subscriptions', () => {
	it('refuses an unsigned visitor', async () => {
		const result = await runAndCatch(() =>
			POST(fakeEvent({ db: harness.db, json: {} as unknown }))
		);
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});

	it('is unavailable when this server has no VAPID keys', async () => {
		env.VAPID_PRIVATE_KEY = undefined;
		const result = await runAndCatch(async () =>
			POST(fakeEvent({ db: harness.db, user: ada, json: await body() }))
		);
		expect(result).toMatchObject({ type: 'error', status: 503 });
	});

	/**
	 * The server POSTs to whatever is stored here, so an arbitrary URL would let
	 * any account aim it at anything — including, self-hosted, the private
	 * network.
	 */
	it.each([
		'https://evil.example/push',
		'http://fcm.googleapis.com/fcm/send/x',
		'https://fcm.googleapis.com:8443/fcm/send/x',
		'https://169.254.169.254/latest'
	])('refuses an endpoint that is not a known push service: %s', async (endpoint) => {
		const json = await body(endpoint);
		const result = await runAndCatch(() => POST(fakeEvent({ db: harness.db, user: ada, json })));
		expect(result).toMatchObject({ type: 'error', status: 400 });
		expect(await listPushDevices(harness.db, ada.id)).toEqual([]);
	});

	it('saves the device and returns its id', async () => {
		const response = await POST(fakeEvent({ db: harness.db, user: ada, json: await body() }));
		expect(response.status).toBe(201);
		const { id } = (await response.json()) as { id: string };
		expect(await listPushDevices(harness.db, ada.id)).toMatchObject([
			{ id, label: 'Safari on iPhone' }
		]);
	});
});

describe('/api/push/subscriptions/[id]', () => {
	async function adaDevice() {
		const response = await POST(fakeEvent({ db: harness.db, user: ada, json: await body() }));
		return ((await response.json()) as { id: string }).id;
	}

	it('changes a category on the user’s own device', async () => {
		const id = await adaDevice();
		const response = await PATCH(
			fakeEvent({ db: harness.db, user: ada, params: { id }, json: { notifyReactions: false } })
		);
		expect(response.status).toBe(200);
		expect((await listPushDevices(harness.db, ada.id))[0]?.notifyReactions).toBe(false);
	});

	it.each([{}, { notifyMessages: 'yes' }, null])(
		'refuses an empty or malformed change: %j',
		async (json) => {
			const id = await adaDevice();
			const result = await runAndCatch(() =>
				PATCH(fakeEvent({ db: harness.db, user: ada, params: { id }, json }))
			);
			expect(result).toMatchObject({ type: 'error', status: 400 });
		}
	);

	/** 404 rather than 403, so the reply never confirms the id exists. */
	it('treats somebody else’s device as not found', async () => {
		const id = await adaDevice();
		const patched = await runAndCatch(() =>
			PATCH(
				fakeEvent({ db: harness.db, user: bo, params: { id }, json: { notifyMessages: false } })
			)
		);
		expect(patched).toMatchObject({ type: 'error', status: 404 });
		const deleted = await runAndCatch(() =>
			DELETE(fakeEvent({ db: harness.db, user: bo, params: { id } }))
		);
		expect(deleted).toMatchObject({ type: 'error', status: 404 });
		expect(await listPushDevices(harness.db, ada.id)).toHaveLength(1);
	});

	it('deletes the user’s own device', async () => {
		const id = await adaDevice();
		const response = await DELETE(fakeEvent({ db: harness.db, user: ada, params: { id } }));
		expect(response.status).toBe(200);
		expect(await listPushDevices(harness.db, ada.id)).toEqual([]);
	});
});

describe('POST /api/push/subscriptions/check', () => {
	async function check(user: TestUser | null, json: unknown) {
		return await CHECK(fakeEvent({ db: harness.db, user, json }));
	}

	it('refuses an unsigned visitor', async () => {
		const result = await runAndCatch(() => check(null, { endpoint: 'x' }));
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});

	it.each([null, {}, { endpoint: 'https://example.com/not-a-push-service' }])(
		'refuses something that is not a push endpoint: %j',
		async (json) => {
			const result = await runAndCatch(() => check(ada, json));
			expect(result).toMatchObject({ type: 'error', status: 400 });
		}
	);

	it('says whose the browser is, and lets go of another account’s', async () => {
		const subscription = await body();
		const created = await POST(fakeEvent({ db: harness.db, user: ada, json: subscription }));
		const { id } = (await created.json()) as { id: string };

		const mine = await check(ada, { endpoint: subscription.endpoint });
		expect(await mine.json()).toEqual({ status: 'yours', id });

		const theirs = await check(bo, { endpoint: subscription.endpoint });
		expect(await theirs.json()).toEqual({ status: 'released' });
		expect(await listPushDevices(harness.db, ada.id)).toEqual([]);
		expect(await listPushDevices(harness.db, bo.id)).toEqual([]);
	});
});
