import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEBUG_COOKIE, DEBUG_COOKIE_ON } from '$lib/debug';
import { grantFeature } from '$lib/server/features';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

describe('/settings/+page.server.ts', () => {
	it('gives the page the version this build was made as', async () => {
		const data = await runLoad(load(fakeEvent({})));
		expect(data.appVersion).toBe(__APP_VERSION__);
		expect(data.appVersion).not.toBe('');
	});
});

describe('/settings?/debug', () => {
	let harness: TestDb;
	let ada: TestUser;

	beforeEach(async () => {
		harness = await createTestDb();
		ada = await createTestUser(harness.db, { name: 'Ada' });
	});

	afterEach(() => harness.close());

	const post = (on: boolean, cookies: Record<string, string>) =>
		runAndCatch(() =>
			runAction(
				actions,
				'debug',
				fakeEvent({
					db: harness.db,
					user: ada,
					cookies,
					formData: { on: String(on) }
				})
			)
		);

	it('is refused for an account without the feature, and sets nothing', async () => {
		const cookies: Record<string, string> = {};
		const outcome = await post(true, cookies);
		expect(outcome).toMatchObject({ type: 'error', status: 403 });
		expect(cookies).toEqual({});
	});

	it('switches this device on, then off again', async () => {
		const admin = await createTestUser(harness.db, { role: 'admin' });
		await grantFeature(harness.db, {
			userId: ada.id,
			feature: 'debugMode',
			grantedByUserId: admin.id
		});
		const cookies: Record<string, string> = {};

		expect(await post(true, cookies)).toEqual({ type: 'ok', value: { debug: true } });
		expect(cookies[DEBUG_COOKIE]).toBe(DEBUG_COOKIE_ON);

		expect(await post(false, cookies)).toEqual({ type: 'ok', value: { debug: false } });
		expect(cookies).not.toHaveProperty(DEBUG_COOKIE);
	});
});
