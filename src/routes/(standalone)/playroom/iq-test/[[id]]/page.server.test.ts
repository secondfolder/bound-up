import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEBUG_COOKIE, DEBUG_COOKIE_ON } from '$lib/debug';
import { DIALOG_SEEN_COOKIE } from '$lib/playroom/iq-test/device';
import { iqTestResults } from '$lib/server/db/schema';
import { grantFeature } from '$lib/server/features';
import { signSharedResult } from '$lib/server/iq-test-share';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import type { IqTestResultView } from '$lib/types';
import { load } from './+page.server';

let harness: TestDb;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	jun = await createTestUser(harness.db, { name: 'Jun' });
});

afterEach(() => harness.close());

const result = {
	role: 'sub' as const,
	intensity: 0 as const,
	vibe: null,
	correct: 4,
	attempted: 12,
	skipped: 0,
	humiliating: true,
	themedLook: true,
	soberIq: null,
	targetIq: null,
	seed: 1
};

describe('/playroom/iq-test load', () => {
	it('works signed out, with no history from the server', async () => {
		const data = await runLoad(load(fakeEvent({ user: null, cookies: {}, params: {} })));
		expect(data.history).toBeNull();
	});

	it('opens with the setup dialog until it has been dealt with this session', async () => {
		const first = await runLoad(load(fakeEvent({ user: null, cookies: {}, params: {} })));
		expect(first.dialogSeen).toBe(false);
		const reload = await runLoad(
			load(fakeEvent({ user: null, cookies: { [DIALOG_SEEN_COOKIE]: '1' }, params: {} }))
		);
		expect(reload.dialogSeen).toBe(true);
	});

	it('shows the testing aids only in debug mode: the feature and this device switched on', async () => {
		const on = { [DEBUG_COOKIE]: DEBUG_COOKIE_ON };
		const anonymous = await runLoad(load(fakeEvent({ user: null, cookies: on, params: {} })));
		expect(anonymous.debug).toBe(false);
		const ungranted = await runLoad(
			load(fakeEvent({ db: harness.db, user: ada, cookies: { ...on }, params: {} }))
		);
		expect(ungranted.debug).toBe(false);

		await grantFeature(harness.db, {
			userId: ada.id,
			feature: 'debugMode',
			grantedByUserId: jun.id
		});
		const switchedOff = await runLoad(
			load(fakeEvent({ db: harness.db, user: ada, cookies: {}, params: {} }))
		);
		expect(switchedOff.debug).toBe(false);
		const switchedOn = await runLoad(
			load(fakeEvent({ db: harness.db, user: ada, cookies: { ...on }, params: {} }))
		);
		expect(switchedOn.debug).toBe(true);
		const other = await runLoad(
			load(fakeEvent({ db: harness.db, user: jun, cookies: { ...on }, params: {} }))
		);
		expect(other.debug).toBe(false);
	});

	it("lists the signed-in user's own results, newest first, and nobody else's", async () => {
		// Explicit times: two inserts in the same millisecond would tie.
		await harness.db.insert(iqTestResults).values([
			{ ...result, ownerId: ada.id, iq: 90, createdAt: new Date('2026-10-01T10:00:00Z') },
			{ ...result, ownerId: ada.id, iq: 70, createdAt: new Date('2026-10-02T10:00:00Z') },
			{ ...result, ownerId: jun.id, iq: 130, createdAt: new Date('2026-10-03T10:00:00Z') }
		]);

		const data = await runLoad(
			load(fakeEvent({ db: harness.db, user: ada, cookies: {}, params: {} }))
		);
		expect((data.history ?? []).map((entry: IqTestResultView) => entry.iq)).toEqual([70, 90]);
	});
});

describe('/playroom/iq-test/[id] load', () => {
	const Secret = 's'.repeat(43);

	function open(id: string, user: TestUser | null) {
		return runAndCatch(() =>
			load(
				fakeEvent({
					db: harness.db,
					user,
					cookies: {},
					params: { id },
					authContext: { secret: Secret }
				})
			)
		);
	}

	it("opens an account's result for anyone with its link, saying whose it is", async () => {
		const [row] = await harness.db
			.insert(iqTestResults)
			.values({ ...result, ownerId: ada.id, iq: 66 })
			.returning({ id: iqTestResults.id });
		const id = row?.id ?? '';

		const mine = await open(id, ada);
		expect(mine).toMatchObject({
			type: 'ok',
			value: { shared: { isMine: true, result: { iq: 66 } } }
		});
		const theirs = await open(id, jun);
		expect(theirs).toMatchObject({ type: 'ok', value: { shared: { isMine: false } } });
		const anonymous = await open(id, null);
		expect(anonymous).toMatchObject({
			type: 'ok',
			value: { dialogSeen: true, shared: { isMine: false } }
		});
		expect(JSON.stringify(anonymous)).not.toContain(ada.id);
	});

	it('opens a signed-out result from its token', async () => {
		const token = await signSharedResult(Secret, {
			...result,
			iq: 55,
			skipped: 2,
			createdAt: new Date('2026-10-11T00:00:00Z')
		});
		expect(await open(token, null)).toMatchObject({
			type: 'ok',
			value: { shared: { result: { iq: 55, skipped: 2, id: token, shareToken: token } } }
		});
	});

	it('is a 404 for a deleted result, an edited token, or anything else', async () => {
		const token = await signSharedResult(Secret, { ...result, iq: 55, createdAt: new Date() });
		const edited = `${token.slice(0, 5)}${token[5] === 'A' ? 'B' : 'A'}${token.slice(6)}`;
		for (const id of ['00000000-0000-4000-8000-000000000000', edited, 'nonsense']) {
			expect(await open(id, ada)).toMatchObject({ type: 'error', status: 404 });
		}
	});
});
