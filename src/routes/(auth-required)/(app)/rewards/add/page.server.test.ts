import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestPartnership,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readRewardRow,
	type TestUser,
	testSoloSpace
} from '$lib/testing/fixtures';
import { load as layoutLoad } from '../+layout.server';
import { actions, load } from './+page.server';

/** Adding a reward goes to the space the form names, set for whoever that space's rule says. */

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
});

afterEach(() => harness.close());

async function loadIn(user: TestUser, context: string) {
	const layout = await runLoad(
		layoutLoad(fakeEvent({ db, user, path: '/rewards', contextCookie: context }))
	);
	return await runAndCatch(() =>
		runLoad(
			load(
				fakeEvent({ db, user, path: '/rewards/add', contextCookie: context, parentData: layout })
			)
		)
	);
}

const post = (user: TestUser, formData: Record<string, string>) =>
	runAndCatch(() => actions.default?.(fakeEvent({ db, user, path: '/rewards/add', formData })));

const sealedPost = (spaceId: string, vaultId: string) => ({
	spaceId,
	recordId: crypto.randomUUID(),
	vaultId,
	ciphertext: fakeSealed('reward'),
	payloadVersion: '1',
	cost: '4',
	active: 'on'
});

describe('load', () => {
	it('sends the side that does not set rewards back to the list', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		await expect(loadIn(jun, id)).resolves.toMatchObject({
			type: 'redirect',
			location: '/rewards'
		});
		await expect(loadIn(ada, id)).resolves.toMatchObject({ type: 'ok' });
	});
});

describe('the action', () => {
	it('creates your own reward for you, and a partnership reward for the partner', async () => {
		const solo = await testSoloSpace(db, ada.id);
		const own = sealedPost(solo, await ensureTestSelfVault(db, ada.id));
		await expect(post(ada, own)).resolves.toMatchObject({ type: 'redirect', location: '/rewards' });
		await expect(readRewardRow(db, own.recordId)).resolves.toMatchObject({
			spaceId: solo,
			assigneeUserId: ada.id,
			cost: 4
		});

		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const shared = sealedPost(id, await ensureTestPartnershipVault(db, id));
		await post(ada, shared);
		await expect(readRewardRow(db, shared.recordId)).resolves.toMatchObject({
			spaceId: id,
			createdByUserId: ada.id,
			assigneeUserId: jun.id
		});
	});

	it('refuses the side that does not set rewards', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const form = sealedPost(id, await ensureTestPartnershipVault(db, id));
		await expect(post(jun, form)).resolves.toMatchObject({ value: { status: 403 } });
		await expect(readRewardRow(db, form.recordId)).resolves.toBeUndefined();
	});
});
