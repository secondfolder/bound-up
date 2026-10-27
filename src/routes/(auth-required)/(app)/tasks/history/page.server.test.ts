import { afterEach, beforeEach, describe, expect, it, it as test } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runLoad } from '$lib/testing/events';
import {
	completeTestTask,
	createTestPartnership,
	createTestPartnershipTask,
	createTestSelfTask,
	createTestUser,
	type TestUser,
	testSoloSpace
} from '$lib/testing/fixtures';
import type { TaskCompletionView } from '$lib/types';
import { load } from './+page.server';

/** The completion history follows the context, as the list does. */

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

const at = (user: TestUser, context: string) =>
	fakeEvent({ db, user, path: '/tasks/history', contextCookie: context });

test('shows the completions in the context’s spaces, saying who did each', async () => {
	const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
	const own = await createTestSelfTask(db, ada);
	const forJun = await createTestPartnershipTask(db, id, ada);
	const ownDone = await completeTestTask(db, ada, own.id);
	const junDone = await completeTestTask(db, jun, forJun.id);

	const everyone = await runLoad(load(at(ada, 'all')));
	expect(
		everyone.completions
			.map((completion: TaskCompletionView) => completion.id)
			.sort((a: string, b: string) => a.localeCompare(b))
	).toEqual([ownDone, junDone].sort((a: string, b: string) => a.localeCompare(b)));
	expect(
		everyone.completions.find((completion: TaskCompletionView) => completion.id === junDone)
	).toMatchObject({
		spaceId: id,
		mine: false,
		createdByMe: true
	});

	const me = await runLoad(load(at(ada, await testSoloSpace(db, ada.id))));
	expect(me.completions.map((completion: TaskCompletionView) => completion.id)).toEqual([ownDone]);

	const shared = await runLoad(load(at(ada, id)));
	expect(shared.completions.map((completion: TaskCompletionView) => completion.id)).toEqual([
		junDone
	]);
});

describe('outside a space', () => {
	it('shows nothing of a partnership the viewer is not in', async () => {
		const kit = await createTestUser(db, { name: 'Kit' });
		const { id } = await createTestPartnership(db, jun, kit, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, jun);
		await completeTestTask(db, kit, task.id);
		const data = await runLoad(load(at(ada, 'all')));
		expect(data.completions).toEqual([]);
	});
});
