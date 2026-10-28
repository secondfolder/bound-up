import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { listPartnershipsForUser } from '$lib/server/partnerships';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestInvite,
	createTestUser,
	FAKE_INVITE_KEY_WRAP,
	fakeSealed,
	readPartnershipRow,
	type TestUser
} from '$lib/testing/fixtures';
import { actions, type InviteCreated, load } from './+page.server';

let harness: TestDb;
let db: Db;
let ada: TestUser;

/**
 * What the browser posts: the names sealed under an invite key the server never
 * sees, that key wrapped to the inviter, and the id the invite was sealed to.
 */
function sealedPost(overrides: Record<string, string> = {}): Record<string, string> {
	return {
		id: crypto.randomUUID(),
		control: 'me',
		inviteCiphertext: fakeSealed('invite'),
		invitePayloadVersion: '1',
		inviteKeyWrap: FAKE_INVITE_KEY_WRAP,
		...overrides
	};
}

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
});

afterEach(() => harness.close());

// The action is `default`, and Actions is typed loosely enough that TS cannot
// know that — one cast here beats one per call.
const submit = (formData: Record<string, string>, user: TestUser | null = ada) =>
	runAction(actions, 'default', fakeEvent({ db, user, formData, path: '/settings/partners/new' }));

/** The created invite, or a failure naming what came back instead. */
function createdFrom(result: unknown): InviteCreated {
	if (typeof result === 'object' && result !== null && 'created' in result) {
		return (result as { created: InviteCreated }).created;
	}
	throw new Error(`expected an invite to be created, got ${JSON.stringify(result)}`);
}

describe('load', () => {
	it('defaults the control question to a mix', async () => {
		// Defaulting to "me" would quietly hand control to whoever clicked Add.
		const { partnerInviteForm } = await runLoad(load(fakeEvent({ db, user: ada })));
		expect(partnerInviteForm.data.control).toBe('mix');
	});

	it('starts with empty names and no errors', async () => {
		const { partnerInviteForm } = await runLoad(load(fakeEvent({ db, user: ada })));
		expect(partnerInviteForm.data.partnerName).toBe('');
		expect(partnerInviteForm.errors).toEqual({});
	});

	it('prefills "yours" from the account name', async () => {
		const { partnerInviteForm } = await runLoad(load(fakeEvent({ db, user: ada })));
		expect(partnerInviteForm.data.yourName).toBe('Ada');
	});
});

describe('the create action', () => {
	it('creates a pending invite and hands back a shareable link', async () => {
		const post = sealedPost();
		const created = createdFrom(await submit(post));

		// The id the browser chose, since the invite was sealed to it.
		expect(created.partnershipId).toBe(post.id);
		expect(created.path).toMatch(/^\/invite\/[A-Za-z0-9_-]+$/);

		const row = await readPartnershipRow(db, created.partnershipId);
		expect(row.status).toBe('pending');
		expect(row.inviterId).toBe(ada.id);
	});

	it('stores the names only as the sealed invite', async () => {
		const post = sealedPost();
		const created = createdFrom(await submit(post));

		const row = await readPartnershipRow(db, created.partnershipId);
		expect(row.inviteCiphertext).toBe(post.inviteCiphertext);
		expect(row.invitePayloadVersion).toBe(1);
		expect(row.inviteKeyWrap).toBe(FAKE_INVITE_KEY_WRAP);
		expect(row.namesCiphertext).toBeNull();
	});

	it('the link in the message actually resolves to the stored token', async () => {
		const created = createdFrom(await submit(sealedPost()));
		const row = await readPartnershipRow(db, created.partnershipId);
		expect(created.path).toContain(
			encodeURIComponent(defined(row.inviteToken, 'the invite token'))
		);
		// The invite key is added by the page, in the fragment: the server never has it.
		expect(created.path).not.toContain('#');
	});

	it('sends only the path: the page puts it on its own origin', async () => {
		// Behind the dev tunnel the request said http:// while the page was on
		// https://, and a link built from it opened where crypto.subtle is missing.
		const result = await runAction(
			actions,
			'default',
			fakeEvent({ db, user: ada, formData: sealedPost(), origin: 'http://localhost:5173' })
		);
		expect(createdFrom(result).path).toMatch(/^\/invite\//);
	});

	it('"me" stores control against the inviter role', async () => {
		const created = createdFrom(await submit(sealedPost({ control: 'me' })));
		expect((await readPartnershipRow(db, created.partnershipId)).control).toBe('inviter');
	});

	it('"them" stores control against the invitee role', async () => {
		const created = createdFrom(await submit(sealedPost({ control: 'them' })));
		expect((await readPartnershipRow(db, created.partnershipId)).control).toBe('invitee');
	});

	it('"mix" stores shared control', async () => {
		const created = createdFrom(await submit(sealedPost({ control: 'mix' })));
		expect((await readPartnershipRow(db, created.partnershipId)).control).toBe('both');
	});

	it.each([
		['plaintext names in place of the sealed invite', { inviteCiphertext: 'Jun' }],
		['a missing key wrap', { inviteKeyWrap: '' }],
		['a key wrap that is not base64', { inviteKeyWrap: 'not base64!' }],
		['an id that is not a UUID', { id: 'p1' }],
		['an unknown payload version', { invitePayloadVersion: '99' }]
	])('rejects %s without writing anything', async (_label, override) => {
		const result = await submit(sealedPost(override));
		expect(result).toMatchObject({ status: 400, data: { error: expect.any(String) } });
		expect(await listPartnershipsForUser(db, ada.id)).toEqual([]);
	});

	it('rejects an id that is already taken, leaving that invite alone', async () => {
		const existing = await createTestInvite(db, ada);
		const result = await submit(sealedPost({ id: existing.id }));

		expect(result).toMatchObject({ status: 400 });
		expect((await readPartnershipRow(db, existing.id)).inviteCiphertext).toBe(
			existing.inviteCiphertext
		);
	});

	it('rejects a control value that is not one of the three answers', async () => {
		// 'inviter' is the stored form of the answer. Accepting it here would be
		// a way to set control without going through controlFromAnswer.
		const result = await submit(sealedPost({ control: 'inviter' }));
		expect(result).toMatchObject({ status: 400 });
	});

	it('refuses to run without a session', async () => {
		// Form actions run BEFORE layout loads, so the (auth-required) group
		// guard has not fired yet. This check is the only thing standing here.
		const result = await runAndCatch(() => submit(sealedPost(), null));
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});
});
