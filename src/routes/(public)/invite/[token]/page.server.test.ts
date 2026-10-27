import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONTEXT_COOKIE } from '$lib/context';
import type { Db } from '$lib/server/db';
import { listPartnersForNav } from '$lib/server/partnerships';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestInvite,
	createTestPartnership,
	createTestUser,
	createTestUserKeys,
	expireInvite,
	FAKE_INVITE_KEY_WRAP,
	fakeSealed,
	readPartnershipRow,
	type TestUser
} from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

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

const at = (
	token: string,
	user: TestUser | null,
	formData?: Record<string, string>,
	cookies: Record<string, string> = {}
) => fakeEvent({ db, user, params: { token }, formData, cookies, path: `/invite/${token}` });

const accept = (event: never) => runAction(actions, 'default', event);

describe('load', () => {
	it('asks an anonymous visitor to sign in, and remembers where to come back to', async () => {
		const invite = await createTestInvite(db, ada);
		const data = await runLoad(load(at(invite.inviteToken, null)));

		expect(data.state).toBe('sign-in-required');
		// Sealed: the page opens it with the key in the link's fragment.
		expect(data.invite).toEqual({
			partnershipId: invite.id,
			ciphertext: invite.inviteCiphertext,
			payloadVersion: 1
		});
		expect(data.redirectTo).toBe(`/invite/${invite.inviteToken}`);
	});

	it('shows an anonymous visitor nothing but the sealed invite', async () => {
		// Not the inviter's account name, not their email, not the key wrap —
		// this page is reachable by anyone holding the link.
		const invite = await createTestInvite(db, ada);
		const data = await runLoad(load(at(invite.inviteToken, null)));

		const serialised = JSON.stringify(data);
		expect(serialised).toContain(invite.inviteCiphertext);
		expect(serialised).not.toContain(ada.email);
		expect(serialised).not.toContain(ada.id);
		expect(serialised).not.toContain(ada.name);
		expect(serialised).not.toContain(FAKE_INVITE_KEY_WRAP);
	});

	it('reports an unknown token as simply invalid', async () => {
		const data = await runLoad(load(at('made-up', null)));
		expect(data.state).toBe('invalid');
		expect(data.invite).toBeNull();
	});

	it('reports an expired token the same way, giving nothing away', async () => {
		const invite = await createTestInvite(db, ada);
		await expireInvite(db, invite.id);

		const data = await runLoad(load(at(invite.inviteToken, null)));
		expect(data.state).toBe('invalid');
		expect(data.invite).toBeNull();
	});

	it('reports a consumed token as invalid', async () => {
		const invite = await createTestInvite(db, ada);
		await runAndCatch(() => accept(at(invite.inviteToken, jun, {})));

		const data = await runLoad(load(at(invite.inviteToken, null)));
		expect(data.state).toBe('invalid');
	});

	it('tells the inviter it is their own link', async () => {
		const invite = await createTestInvite(db, ada);
		expect((await runLoad(load(at(invite.inviteToken, ada)))).state).toBe('self');
	});

	it('tells an already-linked partner so', async () => {
		await createTestPartnership(db, ada, jun);
		const second = await createTestInvite(db, ada);
		expect((await runLoad(load(at(second.inviteToken, jun)))).state).toBe('already-linked');
	});

	describe('the confirmation screen', () => {
		it('is editable when the accepter is in control', async () => {
			// "them", answered by the inviter, means the invitee is in control.
			const invite = await createTestInvite(db, ada, { control: 'them' });
			const data = await runLoad(load(at(invite.inviteToken, jun)));

			expect(data.state).toBe('confirm');
			expect(data.editable).toBe(true);
		});

		it('is editable when control is shared', async () => {
			const invite = await createTestInvite(db, ada, { control: 'mix' });
			expect((await runLoad(load(at(invite.inviteToken, jun)))).editable).toBe(true);
		});

		it('is read-only when the inviter keeps control', async () => {
			const invite = await createTestInvite(db, ada, { control: 'me' });
			expect((await runLoad(load(at(invite.inviteToken, jun)))).editable).toBe(false);
		});

		it('hands over the inviter’s recipient, for the page to check against the invite', async () => {
			const { recipient } = await createTestUserKeys(db, ada);
			const invite = await createTestInvite(db, ada);
			const data = await runLoad(load(at(invite.inviteToken, jun)));
			expect(data.inviterRecipient).toBe(recipient);
		});

		it('says so when the inviter has no recipient to check against', async () => {
			const invite = await createTestInvite(db, ada);
			expect((await runLoad(load(at(invite.inviteToken, jun)))).inviterRecipient).toBeNull();
		});

		it('leaves the names for the page to fill in once the invite is open', async () => {
			const invite = await createTestInvite(db, ada, { control: 'mix' });
			const data = await runLoad(load(at(invite.inviteToken, jun)));

			expect(data.partnerAcceptForm?.data).toMatchObject({
				partnerName: '',
				yourName: '',
				partnerRole: null,
				yourRole: null,
				control: 'mix'
			});
			expect(data.invite?.ciphertext).toBe(invite.inviteCiphertext);
		});

		it('shows the inviter’s "me" as the accepter’s "them"', async () => {
			const invite = await createTestInvite(db, ada, { control: 'me' });
			const data = await runLoad(load(at(invite.inviteToken, jun)));
			expect(data.partnerAcceptForm?.data.control).toBe('them');
		});
	});
});

/** The names as the accepter left them, sealed again under the same invite key. */
const confirmation = () => ({
	control: 'them',
	inviteCiphertext: fakeSealed('accepted'),
	invitePayloadVersion: '1'
});

describe('the accept action', () => {
	it('links the accounts and lands on Today in the new partnership’s context', async () => {
		const invite = await createTestInvite(db, ada, { control: 'mix' });
		// A device that was last looking at Everyone.
		const jar: Record<string, string> = { [CONTEXT_COOKIE]: 'all' };
		const result = await runAndCatch(() =>
			accept(at(invite.inviteToken, jun, confirmation(), jar))
		);

		expect(result).toMatchObject({ type: 'redirect', status: 303, location: '/today' });
		// A partnership's space has the partnership's id.
		expect(jar[CONTEXT_COOKIE]).toBe(invite.id);
		expect((await readPartnershipRow(db, invite.id)).status).toBe('accepted');
	});

	it('leaves the context alone when the accept fails', async () => {
		const invite = await createTestInvite(db, ada);
		const jar: Record<string, string> = { [CONTEXT_COOKIE]: 'all' };
		await runAndCatch(() => accept(at(invite.inviteToken, ada, confirmation(), jar)));
		expect(jar[CONTEXT_COOKIE]).toBe('all');
	});

	it('accepts a read-only confirmation that posts nothing', async () => {
		const invite = await createTestInvite(db, ada, { control: 'me' });
		const result = await runAndCatch(() => accept(at(invite.inviteToken, jun, {})));

		expect(result).toMatchObject({ type: 'redirect', status: 303 });
		const row = await readPartnershipRow(db, invite.id);
		expect(row.status).toBe('accepted');
		expect(row.inviteCiphertext).toBe(invite.inviteCiphertext);
	});

	it('puts each partner in the other’s nav', async () => {
		const invite = await createTestInvite(db, ada, { control: 'mix' });
		await runAndCatch(() => accept(at(invite.inviteToken, jun, confirmation())));

		expect(await listPartnersForNav(db, ada.id)).toEqual([
			{ id: invite.id, names: expect.objectContaining({ role: 'inviter' }), image: null }
		]);
		expect(await listPartnersForNav(db, jun.id)).toEqual([
			{ id: invite.id, names: expect.objectContaining({ role: 'invitee' }), image: null }
		]);
	});

	it('stores the accepter’s re-sealed names and maps their control answer', async () => {
		const invite = await createTestInvite(db, ada, { control: 'mix' });
		const post = { ...confirmation(), control: 'me' };
		await runAndCatch(() => accept(at(invite.inviteToken, jun, post)));

		const row = await readPartnershipRow(db, invite.id);
		expect(row.inviteCiphertext).toBe(post.inviteCiphertext);
		// The accepter is the invitee, so their "me" is the invitee.
		expect(row.control).toBe('invitee');
	});

	it('ignores edits from an accepter who does not hold control', async () => {
		// The server has to be the thing that refuses them, not the page.
		const invite = await createTestInvite(db, ada, { control: 'me' });
		await runAndCatch(() =>
			accept(at(invite.inviteToken, jun, { ...confirmation(), control: 'me' }))
		);

		const row = await readPartnershipRow(db, invite.id);
		expect(row.inviteCiphertext).toBe(invite.inviteCiphertext);
		expect(row.control).toBe('inviter');
		expect(row.status).toBe('accepted');
	});

	it('refuses an anonymous accept', async () => {
		const invite = await createTestInvite(db, ada);
		const result = await runAndCatch(() => accept(at(invite.inviteToken, null, confirmation())));
		expect(result).toMatchObject({ type: 'error', status: 401 });
		expect((await readPartnershipRow(db, invite.id)).status).toBe('pending');
	});

	it('refuses the inviter accepting their own invite', async () => {
		const invite = await createTestInvite(db, ada);
		const result = await accept(at(invite.inviteToken, ada, confirmation()));

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'This is your own invite link.' }
		});
		expect((await readPartnershipRow(db, invite.id)).status).toBe('pending');
	});

	it('reports an expired invite with something the user can act on', async () => {
		const invite = await createTestInvite(db, ada);
		await expireInvite(db, invite.id);

		const result = await accept(at(invite.inviteToken, jun, confirmation()));
		expect(result).toMatchObject({
			status: 400,
			data: { error: expect.stringMatching(/expired/i) }
		});
	});

	it('reports an unknown token as a 404', async () => {
		const result = await accept(at('made-up', jun, confirmation()));
		expect(result).toMatchObject({ status: 404 });
	});

	it('refuses a second link between the same pair', async () => {
		await createTestPartnership(db, ada, jun);
		const second = await createTestInvite(db, ada);

		const result = await accept(at(second.inviteToken, jun, confirmation()));
		expect(result).toMatchObject({
			status: 400,
			data: { error: expect.stringMatching(/already linked/i) }
		});
	});

	it('rejects names that are not sealed without consuming the invite', async () => {
		const invite = await createTestInvite(db, ada, { control: 'mix' });
		const result = await accept(
			at(invite.inviteToken, jun, { ...confirmation(), inviteCiphertext: 'Ada' })
		);

		expect(result).toMatchObject({ status: 400 });
		const row = await readPartnershipRow(db, invite.id);
		expect(row.status).toBe('pending');
		expect(row.inviteCiphertext).toBe(invite.inviteCiphertext);
	});

	it('a second accept of the same link fails', async () => {
		const invite = await createTestInvite(db, ada);
		const other = await createTestUser(db, { name: 'Kit' });
		await runAndCatch(() => accept(at(invite.inviteToken, jun, confirmation())));

		const result = await accept(at(invite.inviteToken, other, confirmation()));
		expect(result).toMatchObject({ status: 404 });
		expect((await readPartnershipRow(db, invite.id)).inviteeId).toBe(jun.id);
	});
});
