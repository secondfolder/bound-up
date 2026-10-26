import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestInvite,
	createTestPartnership,
	createTestPartnershipTask,
	createTestUser,
	ensureTestPartnershipVault,
	fakeSealed,
	readPartnershipRewardCreditRow,
	readPartnershipTaskRow,
	type TestUser
} from '$lib/testing/fixtures';
import { load } from './+layout.server';
import { actions } from './+page.server';

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;
let stranger: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada', timezone: 'Europe/London' });
	jun = await createTestUser(db, { name: 'Jun', timezone: 'America/New_York' });
	stranger = await createTestUser(db, { name: 'Stranger', timezone: 'UTC' });
});

afterEach(() => harness.close());

const at = (id: string, user: TestUser | null, formData?: Record<string, string>) =>
	fakeEvent({ db, user, params: { id }, formData, path: `/partner/${id}/tasks` });

const run = (name: string, event: never) => runAction(actions, name, event);

describe('load', () => {
	it('returns the partner tasks page view for a member', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const task = await createTestPartnershipTask(db, id, jun, { timezoneOwnerUserId: jun.id });

		const data = await runLoad(load(at(id, ada)));
		expect(data).toMatchObject({
			partner: {
				id,
				names: expect.objectContaining({ partnershipId: id, role: 'inviter' }),
				canManageTasks: false,
				canCompleteTasks: true
			}
		});
		expect(data.tasks).toContainEqual(
			expect.objectContaining({
				id: task.id,
				createdByMe: false,
				revision: 0,
				sealed: expect.objectContaining({ recordId: task.id, ciphertext: task.ciphertext })
			})
		);
	});

	it('404s for a pending invite', async () => {
		const invite = await createTestInvite(db, ada);
		const result = await runAndCatch(() => runLoad(load(at(invite.id, ada))));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	it('404s for someone else’s partnership', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		const result = await runAndCatch(() => runLoad(load(at(id, stranger))));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});

describe('actions', () => {
	it('lets the completing side complete a partner task', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const task = await createTestPartnershipTask(db, id, jun, { creditsAwarded: 2 });

		const result = await run('completeTask', at(id, ada, { taskId: task.id }));
		expect(result).toMatchObject({ message: 'Task completed.' });
		await expect(readPartnershipRewardCreditRow(db, id, ada.id)).resolves.toMatchObject({
			credits: 2
		});
	});

	it('blocks completing your own shared-control task', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada);

		const result = await run('completeTask', at(id, ada, { taskId: task.id }));
		expect(result.status).toBe(403);
	});

	it('undoes a completion for the person who made it, and only them', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const task = await createTestPartnershipTask(db, id, jun, { creditsAwarded: 2 });
		const completed = await run('completeTask', at(id, ada, { taskId: task.id }));
		expect(completed).toMatchObject({ completionId: expect.any(String) });
		const { completionId } = completed as { completionId: string };

		const refused = await run('undoCompletion', at(id, jun, { completionId }));
		expect(refused).toMatchObject({ status: 404 });

		const undone = await run('undoCompletion', at(id, ada, { completionId }));
		expect(undone).toMatchObject({ undone: true });
		await expect(readPartnershipRewardCreditRow(db, id, ada.id)).resolves.toMatchObject({
			credits: 0
		});
	});

	it('404s an undo from outside the partnership', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const result = await runAndCatch(() =>
			run('undoCompletion', at(id, stranger, { completionId: crypto.randomUUID() }))
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});

describe('taskContent', () => {
	/** The content a tick posts: the server stores it as it arrives. */
	const Ticked = fakeSealed('ticked');

	async function contentPost(partnershipId: string, taskId: string) {
		return {
			recordId: taskId,
			vaultId: await ensureTestPartnershipVault(db, partnershipId),
			ciphertext: Ticked,
			payloadVersion: '1',
			completionMessageCount: '0',
			expectedRevision: '0'
		};
	}

	it("saves a tick in the task's content for the partner who set it", async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada);

		const result = await run('taskContent', at(id, ada, await contentPost(id, task.id)));
		expect(result).toEqual({ saved: true });
		await expect(readPartnershipTaskRow(db, task.id)).resolves.toMatchObject({
			ciphertext: Ticked,
			revision: 1
		});
	});

	it('refuses the partner who did not set it, as editing it would be', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada);

		const result = await run('taskContent', at(id, jun, await contentPost(id, task.id)));
		expect(result).toMatchObject({
			status: 403,
			data: { error: 'Only the partner who created a task can edit it.' }
		});
		await expect(readPartnershipTaskRow(db, task.id)).resolves.toMatchObject({ revision: 0 });
	});

	it('404s from outside the partnership', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada);

		const post = await contentPost(id, task.id);
		const result = await runAndCatch(() => run('taskContent', at(id, stranger, post)));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});
