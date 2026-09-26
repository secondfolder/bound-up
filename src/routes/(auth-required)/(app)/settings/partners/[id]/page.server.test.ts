import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '$lib/server/db';
import { partnershipMediaPrefix } from '$lib/server/media';
import { findPendingInviteByToken } from '$lib/server/partnerships';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestInvite,
	createTestPartnership,
	createTestUser,
	expireInvite,
	readPartnershipRow,
	type TestUser
} from '$lib/testing/fixtures';
import { createTestMediaStore, type TestMediaStore } from '$lib/testing/media';
import { actions, load } from './+page.server';

// Under vitest the real factory would pick the local-directory store and touch
// the disk; the in-memory one also lets a test see what was purged.
const media = vi.hoisted(() => ({ store: undefined as TestMediaStore | undefined }));
vi.mock('$lib/server/media/dev', () => ({
	createMediaStore: () => Promise.resolve(media.store)
}));

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;
let stranger: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
	stranger = await createTestUser(db, { name: 'Stranger' });
	media.store = createTestMediaStore();
});

afterEach(() => harness.close());

const at = (id: string, user: TestUser | null, formData?: Record<string, string>) =>
	fakeEvent({ db, user, params: { id }, formData, path: `/settings/partners/${id}` });

const run = (name: string, event: never) => runAction(actions, name, event);

describe('load', () => {
	it('gives the inviter the live invite link', async () => {
		const invite = await createTestInvite(db, ada);
		const data = await runLoad(load(at(invite.id, ada)));

		expect(data.partnership.status).toBe('pending');
		expect(data.inviteUrl).toBe(`https://app.test/invite/${invite.inviteToken}`);
		expect(data.inviteExpired).toBe(false);
	});

	it('withholds the link once the invite has expired', async () => {
		const invite = await createTestInvite(db, ada);
		await expireInvite(db, invite.id);

		const data = await runLoad(load(at(invite.id, ada)));
		expect(data.inviteUrl).toBeNull();
		expect(data.inviteExpired).toBe(true);
	});

	it('never puts a token in the page data of an accepted link', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		const data = await runLoad(load(at(id, ada)));
		expect(data.inviteUrl).toBeNull();
		expect(JSON.stringify(data)).not.toMatch(/invite\//);
	});

	it('404s for a partnership belonging to someone else', async () => {
		// 404 rather than 403: a 403 would confirm the id is real.
		const { id } = await createTestPartnership(db, ada, jun);
		const result = await runAndCatch(() => runLoad(load(at(id, stranger))));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	it('404s for an id that does not exist', async () => {
		const result = await runAndCatch(() => runLoad(load(at('nope', ada))));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	it('prefills the edit form from the viewer’s own side', async () => {
		const { id } = await createTestPartnership(db, ada, jun, {
			yourName: 'Ada',
			partnerName: 'Jun',
			control: 'me'
		});

		const forAda = await runLoad(load(at(id, ada)));
		expect(forAda.partnerEditForm.data).toMatchObject({
			partnerName: 'Jun',
			yourName: 'Ada',
			control: 'me'
		});
		expect(forAda.partnership.canEdit).toBe(true);

		const forJun = await runLoad(load(at(id, jun)));
		expect(forJun.partnerEditForm.data).toMatchObject({
			partnerName: 'Ada',
			yourName: 'Jun',
			// The same stored value reads as "them" from the other side.
			control: 'them'
		});
		expect(forJun.partnership.canEdit).toBe(false);
	});
});

describe('the update action', () => {
	const edit = {
		partnerName: 'Jun II',
		yourName: 'Ada II',
		partnerRole: 'sub',
		yourRole: 'dom',
		control: 'mix'
	};

	it('saves an edit made by the controlling side', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const result = await runAndCatch(() => run('update', at(id, ada, edit)));
		expect(result).toMatchObject({ type: 'redirect', status: 303, location: '/settings/partners' });

		const row = await readPartnershipRow(db, id);
		expect(row.inviterName).toBe('Ada II');
		expect(row.inviteeName).toBe('Jun II');
		expect(row.inviterRole).toBe('dom');
		expect(row.inviteeRole).toBe('sub');
		expect(row.control).toBe('both');
	});

	it('maps the invitee’s names onto the right columns', async () => {
		// The submitted names are in the viewer's terms; storage is in the
		// inviter/invitee terms, so they swap for the invitee.
		const { id } = await createTestPartnership(db, ada, jun, { control: 'them' });
		const result = await runAndCatch(() => run('update', at(id, jun, { ...edit, control: 'me' })));
		expect(result).toMatchObject({ type: 'redirect', status: 303, location: '/settings/partners' });

		const row = await readPartnershipRow(db, id);
		// Jun's "partnerName" is Ada, who is the inviter.
		expect(row.inviterName).toBe('Jun II');
		expect(row.inviteeName).toBe('Ada II');
		expect(row.control).toBe('invitee');
	});

	it('refuses an edit from the side without control', async () => {
		const { id } = await createTestPartnership(db, ada, jun, {
			control: 'me',
			yourName: 'Ada',
			partnerName: 'Jun'
		});

		const result = await run('update', at(id, jun, edit));
		expect(result.status).toBe(403);
		expect((await readPartnershipRow(db, id)).inviterName).toBe('Ada');
	});

	it('rejects invalid input before touching the row', async () => {
		const { id } = await createTestPartnership(db, ada, jun, {
			control: 'mix',
			yourName: 'Ada'
		});
		const result = await run('update', at(id, ada, { ...edit, yourName: '' }));

		expect(result.status).toBe(400);
		expect((await readPartnershipRow(db, id)).inviterName).toBe('Ada');
	});

	it('404s for a stranger', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		const result = await runAndCatch(() => run('update', at(id, stranger, edit)));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	it('refuses to run without a session', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		const result = await runAndCatch(() => run('update', at(id, null, edit)));
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});
});

describe('the rotate action', () => {
	it('returns a fresh link and invalidates the old one', async () => {
		const invite = await createTestInvite(db, ada);
		const result = await run('rotate', at(invite.id, ada));

		expect(result.url).toMatch(/^https:\/\/app\.test\/invite\//);
		expect(result.url).not.toContain(invite.inviteToken);
		expect(await findPendingInviteByToken(db, invite.inviteToken)).toBeNull();
	});

	it('refuses the invitee side of an accepted link', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		const result = await run('rotate', at(id, jun));
		expect(result.status).toBe(400);
	});

	it('refuses a stranger', async () => {
		const invite = await createTestInvite(db, ada);
		const result = await run('rotate', at(invite.id, stranger));
		expect(result.status).toBe(400);
		// The real inviter's link must survive the attempt.
		expect(await findPendingInviteByToken(db, invite.inviteToken)).not.toBeNull();
	});
});

describe('the disconnect action', () => {
	it('lets the side without control leave', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const result = await runAndCatch(() => run('disconnect', at(id, jun)));

		expect(result).toMatchObject({ type: 'redirect', status: 303, location: '/settings/partners' });
		expect(await readPartnershipRow(db, id)).toBeUndefined();
	});

	// Nothing cascades from D1 into the store, so without this every file ever
	// sent in the partnership stayed in R2, billed, for good.
	it('deletes the partnership’s media and nobody else’s', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		const other = await createTestPartnership(db, ada, stranger);
		const store = media.store as TestMediaStore;
		const bytes = new Uint8Array([1]);
		for (const key of ['m1/a1', 'm2/a2']) {
			await store.put(
				`${partnershipMediaPrefix('expiring', id)}${key}`,
				new Blob([bytes]).stream(),
				1
			);
		}
		await store.put(
			`${partnershipMediaPrefix('expiring', other.id)}m3/a3`,
			new Blob([bytes]).stream(),
			1
		);

		await runAndCatch(() => run('disconnect', at(id, jun)));

		expect([...store.objects.keys()]).toEqual([
			`${partnershipMediaPrefix('expiring', other.id)}m3/a3`
		]);
	});

	it('still disconnects when the media purge fails', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		const store = media.store as TestMediaStore;
		store.deletePrefix = () => Promise.reject(new Error('R2 is having a day'));
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const result = await runAndCatch(() => run('disconnect', at(id, jun)));

		expect(result).toMatchObject({ type: 'redirect', status: 303 });
		expect(await readPartnershipRow(db, id)).toBeUndefined();
		expect(logged).toHaveBeenCalledOnce();
	});

	it('lets the inviter cancel a pending invite', async () => {
		const invite = await createTestInvite(db, ada);
		await runAndCatch(() => run('disconnect', at(invite.id, ada)));
		expect(await readPartnershipRow(db, invite.id)).toBeUndefined();
	});

	it('404s for a stranger and leaves the link intact', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		const result = await runAndCatch(() => run('disconnect', at(id, stranger)));

		expect(result).toMatchObject({ type: 'error', status: 404 });
		expect(await readPartnershipRow(db, id)).toBeDefined();
	});

	it('purges nothing for a stranger', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		const store = media.store as TestMediaStore;
		await store.put(
			`${partnershipMediaPrefix('expiring', id)}m1/a1`,
			new Blob([new Uint8Array([1])]).stream(),
			1
		);

		await runAndCatch(() => run('disconnect', at(id, stranger)));

		expect(store.objects.size).toBe(1);
	});

	it('refuses to run without a session', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		const result = await runAndCatch(() => run('disconnect', at(id, null)));
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});
});
