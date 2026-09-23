import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { listPartnershipsForUser } from '$lib/server/partnerships';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import { createTestUser, readPartnershipRow, type TestUser } from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

let harness: TestDb;
let db: Db;
let ada: TestUser;

const answers = {
	partnerName: 'Jun',
	yourName: 'Ada',
	partnerRole: 'sub',
	yourRole: 'dom',
	control: 'me'
};

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
		const result = await submit(answers);

		const created = result.form.message;
		expect(created.partnershipId).toEqual(expect.any(String));
		expect(created.url).toMatch(/^https:\/\/app\.test\/invite\/[A-Za-z0-9_-]+$/);

		const row = await readPartnershipRow(db, created.partnershipId);
		expect(row.status).toBe('pending');
		expect(row.inviterId).toBe(ada.id);
		expect(row.inviterName).toBe('Ada');
		expect(row.inviteeName).toBe('Jun');
		expect(row.inviteeRole).toBe('sub');
		expect(row.inviterRole).toBe('dom');
	});

	it('the link in the message actually resolves to the stored token', async () => {
		const result = await submit(answers);
		const row = await readPartnershipRow(db, result.form.message.partnershipId);
		expect(result.form.message.url).toContain(
			encodeURIComponent(defined(row.inviteToken, 'the invite token'))
		);
	});

	it('builds the link on the request origin, not a hard-coded host', async () => {
		const result = await runAction(
			actions,
			'default',
			fakeEvent({ db, user: ada, formData: answers, origin: 'http://localhost:5173' })
		);
		expect(result.form.message.url).toMatch(/^http:\/\/localhost:5173\/invite\//);
	});

	it('"me" stores control against the inviter role', async () => {
		const result = await submit({ ...answers, control: 'me' });
		expect((await readPartnershipRow(db, result.form.message.partnershipId)).control).toBe(
			'inviter'
		);
	});

	it('"them" stores control against the invitee role', async () => {
		const result = await submit({ ...answers, control: 'them' });
		expect((await readPartnershipRow(db, result.form.message.partnershipId)).control).toBe(
			'invitee'
		);
	});

	it('"mix" stores shared control', async () => {
		const result = await submit({ ...answers, control: 'mix' });
		expect((await readPartnershipRow(db, result.form.message.partnershipId)).control).toBe('both');
	});

	it('an omitted role is stored as NULL, not an empty string', async () => {
		const result = await submit({ ...answers, partnerRole: '', yourRole: '' });
		const row = await readPartnershipRow(db, result.form.message.partnershipId);
		expect(row.inviteeRole).toBeNull();
		expect(row.inviterRole).toBeNull();
	});

	it('rejects a blank name without writing anything', async () => {
		const result = await submit({ ...answers, partnerName: '   ' });
		expect(result.status).toBe(400);
		expect(await listPartnershipsForUser(db, ada.id)).toEqual([]);
	});

	it('rejects a control value that is not one of the three answers', async () => {
		// 'inviter' is the stored form of the answer. Accepting it here would be
		// a way to set control without going through controlFromAnswer.
		const result = await submit({ ...answers, control: 'inviter' });
		expect(result.status).toBe(400);
	});

	it('refuses to run without a session', async () => {
		// Form actions run BEFORE layout loads, so the (auth-required) group
		// guard has not fired yet. This check is the only thing standing here.
		const result = await runAndCatch(() => submit(answers, null));
		expect(result).toMatchObject({ type: 'error', status: 401 });
	});
});
