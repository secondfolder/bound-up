import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	completeTestTask,
	createTestPartnership,
	createTestPartnershipTask,
	createTestSelfTask,
	createTestUser,
	ensureTestPartnershipVault,
	fakeSealed,
	readBalanceRow,
	readTaskRow,
	setTestPartnershipControl,
	type TestUser,
	testSoloSpace
} from '$lib/testing/fixtures';
import type { BalanceView, ItemSpaceView, TaskView } from '$lib/types';
import { load } from './+layout.server';
import { actions } from './+page.server';

/**
 * The tasks list in every context, and its actions: the list follows the
 * context, splitting what the viewer does (to do) from what they set for
 * someone else; every action names its task, and the context never decides
 * where a write goes. See docs/tasks.md and docs/contexts.md.
 */

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;
let kit: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada', timezone: 'Europe/London' });
	jun = await createTestUser(db, { name: 'Jun', timezone: 'America/New_York' });
	kit = await createTestUser(db, { name: 'Kit' });
});

afterEach(() => harness.close());

function at(
	user: TestUser | null,
	options: { context?: string; formData?: Record<string, string> } = {}
) {
	return fakeEvent({
		db,
		user,
		path: '/tasks',
		...(options.context === undefined ? {} : { contextCookie: options.context }),
		...(options.formData ? { formData: options.formData } : {})
	});
}

const run = (name: string, event: never) => runAction(actions, name, event);
const ids = (tasks: TaskView[]) => tasks.map((task) => task.id).sort((a, b) => a.localeCompare(b));

describe('the list, in each context', () => {
	it('shows only your own tasks in Me, with nothing set for others', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const own = await createTestSelfTask(db, ada);
		await createTestPartnershipTask(db, id, jun);
		const solo = await testSoloSpace(db, ada.id);

		const { list, context } = await runLoad(load(at(ada, { context: solo })));
		expect(context).toEqual({ kind: 'space', spaceId: solo });
		expect(ids(list.toDo)).toEqual([own.id]);
		expect(list.setForOthers).toEqual([]);
		expect(list.spaces).toEqual([
			{ id: solo, kind: 'solo', canManage: true, viewerActs: true, others: [] }
		]);
		expect(list.balances).toEqual([
			{ spaceId: solo, userId: ada.id, mine: true, credits: 0, canSet: true }
		]);
	});

	it('splits a partnership under shared control into to do and set for others', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const forAda = await createTestPartnershipTask(db, id, jun);
		const forJun = await createTestPartnershipTask(db, id, ada);

		const { list } = await runLoad(load(at(ada, { context: id })));
		expect(ids(list.toDo)).toEqual([forAda.id]);
		expect(ids(list.setForOthers)).toEqual([forJun.id]);
		// Only what she set is hers to edit; only what was set for her, hers to complete.
		expect(list.toDo[0]).toMatchObject({ createdByMe: false, canManage: false, canComplete: true });
		expect(list.setForOthers[0]).toMatchObject({
			createdByMe: true,
			canManage: true,
			canComplete: false,
			assigneeUserId: jun.id
		});
		// Her own balance there, which her to-dos pay into, and Jun's, which hers to him do.
		expect(list.balances.map((balance: BalanceView) => [balance.userId, balance.mine])).toEqual([
			[ada.id, true],
			[jun.id, false]
		]);
	});

	it('gives the side that only sets tasks no to-dos, and the other side nothing to set', async () => {
		// Ada controls: she sets, Jun does.
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const task = await createTestPartnershipTask(db, id, ada);

		const adas = (await runLoad(load(at(ada, { context: id })))).list;
		expect(adas.toDo).toEqual([]);
		expect(ids(adas.setForOthers)).toEqual([task.id]);
		expect(adas.spaces[0]).toMatchObject({ canManage: true, viewerActs: false });
		expect(adas.balances).toEqual([
			{ spaceId: id, userId: jun.id, mine: false, credits: 0, canSet: true }
		]);

		const juns = (await runLoad(load(at(jun, { context: id })))).list;
		expect(ids(juns.toDo)).toEqual([task.id]);
		expect(juns.setForOthers).toEqual([]);
		expect(juns.spaces[0]).toMatchObject({ canManage: false, viewerActs: true });
	});

	it('hides a task a change of control left on the wrong side, and shows it again after', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const task = await createTestPartnershipTask(db, id, ada);
		await setTestPartnershipControl(db, id, 'invitee');

		for (const viewer of [ada, jun]) {
			const { list } = await runLoad(load(at(viewer, { context: id })));
			expect([...list.toDo, ...list.setForOthers]).toEqual([]);
		}
		await setTestPartnershipControl(db, id, 'inviter');
		expect(ids((await runLoad(load(at(jun, { context: id })))).list.toDo)).toEqual([task.id]);
	});

	it('shows everything at once in Everyone, from every space', async () => {
		const withJun = (await createTestPartnership(db, ada, jun, { control: 'mix' })).id;
		const withKit = (await createTestPartnership(db, kit, ada, { control: 'me' })).id;
		const own = await createTestSelfTask(db, ada);
		const fromJun = await createTestPartnershipTask(db, withJun, jun);
		const forJun = await createTestPartnershipTask(db, withJun, ada);
		const fromKit = await createTestPartnershipTask(db, withKit, kit);

		const { list, context } = await runLoad(load(at(ada, { context: 'all' })));
		expect(context).toEqual({ kind: 'all' });
		expect(ids(list.toDo)).toEqual(
			[own.id, fromJun.id, fromKit.id].sort((a, b) => a.localeCompare(b))
		);
		expect(ids(list.setForOthers)).toEqual([forJun.id]);
		// Each task names its space, for the chip on its row.
		expect(list.toDo.find((task: TaskView) => task.id === fromKit.id)?.spaceId).toBe(withKit);
		// Solo first, then each partnership, as the switcher lists them.
		expect(list.spaces.map((space: ItemSpaceView) => space.id)).toEqual([
			await testSoloSpace(db, ada.id),
			withJun,
			withKit
		]);
	});

	it('is Everyone for a device that has never switched, and for a space that is not yours', async () => {
		const { id } = await createTestPartnership(db, jun, kit);
		await createTestSelfTask(db, ada);
		for (const cookie of [undefined, id]) {
			const { context, list } = await runLoad(load(at(ada, cookie ? { context: cookie } : {})));
			expect(context).toEqual({ kind: 'all' });
			expect(list.toDo).toHaveLength(1);
		}
	});

	it('refuses to load without a session', async () => {
		await expect(runAndCatch(() => runLoad(load(at(null))))).resolves.toMatchObject({
			type: 'error',
			status: 401
		});
	});
});

describe('complete', () => {
	it('completes a task set for you, crediting your balance in its space whatever the context', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const task = await createTestPartnershipTask(db, id, ada, { creditsAwarded: 3 });
		const solo = await testSoloSpace(db, jun.id);

		// The cookie says Jun's own space; the task's own space is what counts.
		const result = await run(
			'complete',
			at(jun, { context: solo, formData: { taskId: task.id } }) as never
		);
		expect(result).toMatchObject({ taskId: task.id, completionId: expect.any(String) });
		await expect(readBalanceRow(db, id, jun.id)).resolves.toMatchObject({ credits: 3 });
		await expect(readBalanceRow(db, solo, jun.id)).resolves.toBeUndefined();
		await expect(readTaskRow(db, task.id)).resolves.toMatchObject({ active: false });
	});

	it('refuses the person who set it, even under shared control', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada);
		const result = await run('complete', at(ada, { formData: { taskId: task.id } }) as never);
		expect(result).toMatchObject({ status: 403 });
		await expect(readTaskRow(db, task.id)).resolves.toMatchObject({ completedCount: 0 });
	});

	it('404s a task in a space you are not in', async () => {
		const { id } = await createTestPartnership(db, jun, kit, { control: 'me' });
		const task = await createTestPartnershipTask(db, id, jun);
		const result = await runAndCatch(() =>
			run('complete', at(ada, { formData: { taskId: task.id } }) as never)
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	it('refuses a malformed id', async () => {
		const result = await run('complete', at(ada, { formData: { taskId: 'nope' } }) as never);
		expect(result).toMatchObject({ status: 400 });
	});
});

describe('undo', () => {
	it('takes a completion back, and its credits with it', async () => {
		const task = await createTestSelfTask(db, ada, { creditsAwarded: 2 });
		const completionId = await completeTestTask(db, ada, task.id);
		const result = await run('undo', at(ada, { formData: { completionId } }) as never);
		expect(result).toEqual({ undone: true });
		await expect(readTaskRow(db, task.id)).resolves.toMatchObject({
			active: true,
			completedCount: 0
		});
		await expect(
			readBalanceRow(db, await testSoloSpace(db, ada.id), ada.id)
		).resolves.toMatchObject({ credits: 0 });
	});

	it('refuses the partner who did not complete it', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const task = await createTestPartnershipTask(db, id, ada);
		const completionId = await completeTestTask(db, jun, task.id);
		const result = await run('undo', at(ada, { formData: { completionId } }) as never);
		expect(result).toMatchObject({ status: 404 });
	});
});

describe('content', () => {
	it('saves a ticked description for whoever set the task, and refuses whoever it is for', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const task = await createTestPartnershipTask(db, id, ada);
		const post = {
			recordId: task.id,
			vaultId: await ensureTestPartnershipVault(db, id),
			ciphertext: fakeSealed('ticked'),
			payloadVersion: '1',
			completionMessageCount: '1',
			expectedRevision: '0'
		};

		const refused = await run('content', at(jun, { formData: post }) as never);
		expect(refused).toMatchObject({ status: 403 });

		await expect(run('content', at(ada, { formData: post }) as never)).resolves.toEqual({
			saved: true
		});
		await expect(readTaskRow(db, task.id)).resolves.toMatchObject({
			ciphertext: post.ciphertext,
			revision: 1
		});
	});
});
