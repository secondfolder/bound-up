import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import {
	createTestInvite,
	createTestPartnership,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	readPartnershipRewardRow,
	readPartnershipRewardRows,
	type TestUser
} from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

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
});

afterEach(() => harness.close());

const at = (id: string, user: TestUser | null, formData?: Record<string, string>) =>
	fakeEvent({ db, user, params: { id }, formData, path: `/partner/${id}/rewards/add` });

describe('load', () => {
	it('lets the controlling side open the add page', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		await expect(runLoad(load(at(id, ada)))).resolves.toMatchObject({
			partner: { id, names: expect.objectContaining({ partnershipId: id, role: 'inviter' }) }
		});
	});

	it('403s for the non-controlling side', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const result = await runAndCatch(() => runLoad(load(at(id, jun))));
		expect(result).toMatchObject({ type: 'error', status: 403 });
	});

	it('404s for a pending invite or stranger', async () => {
		const invite = await createTestInvite(db, ada);
		const pending = await runAndCatch(() => runLoad(load(at(invite.id, ada))));
		expect(pending).toMatchObject({ type: 'error', status: 404 });

		const { id } = await createTestPartnership(db, ada, jun);
		const strangerResult = await runAndCatch(() => runLoad(load(at(id, stranger))));
		expect(strangerResult).toMatchObject({ type: 'error', status: 404 });
	});
});

/** A reward form as the browser posts it: the settings, and the content sealed. */
async function sealedPost(partnershipId: string, overrides: Record<string, string> = {}) {
	return {
		recordId: crypto.randomUUID(),
		vaultId: await ensureTestPartnershipVault(db, partnershipId),
		ciphertext: fakeSealed('reward'),
		payloadVersion: '1',
		cost: '3',
		active: 'on',
		...overrides
	};
}

describe('actions', () => {
	it('creates a reward from the sealed post and redirects back to the rewards page', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const post = await sealedPost(id);
		const result = await runAndCatch(() => actions.default?.(at(id, ada, post)));

		expect(result).toMatchObject({
			type: 'redirect',
			status: 303,
			location: `/partner/${id}/rewards`
		});
		await expect(readPartnershipRewardRow(db, post.recordId)).resolves.toMatchObject({
			partnershipId: id,
			createdByUserId: ada.id,
			ciphertext: post.ciphertext,
			vaultId: post.vaultId,
			revision: 0,
			cost: 3
		});
	});

	it('does not store a title the post still carries', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const post = await sealedPost(id, { title: 'Movie night', description: 'Pick a film' });
		await runAndCatch(() => actions.default?.(at(id, ada, post)));

		const row = await readPartnershipRewardRow(db, post.recordId);
		expect(row).toMatchObject({
			ciphertext: post.ciphertext
		});
		// Only the sealed record is kept: there is nowhere for the text to go.
		expect(JSON.stringify(row)).not.toContain('Movie night');
	});

	it("refuses content sealed in another partnership's vault", async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const other = await createTestPartnership(db, ada, stranger, { control: 'me' });
		const post = await sealedPost(id, {
			vaultId: await ensureTestPartnershipVault(db, other.id)
		});

		const result = await runAndCatch(() => actions.default?.(at(id, ada, post)));
		expect(result).toMatchObject({ type: 'ok', value: { status: 409 } });
		await expect(readPartnershipRewardRows(db, id)).resolves.toEqual([]);
	});

	it("refuses content sealed in the user's own vault", async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const post = await sealedPost(id, { vaultId: await ensureTestSelfVault(db, ada.id) });

		const result = await runAndCatch(() => actions.default?.(at(id, ada, post)));
		expect(result).toMatchObject({ type: 'ok', value: { status: 409 } });
		await expect(readPartnershipRewardRows(db, id)).resolves.toEqual([]);
	});

	it('refuses the non-controlling side', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const post = await sealedPost(id);

		const result = await runAndCatch(() => actions.default?.(at(id, jun, post)));
		expect(result).toMatchObject({ type: 'ok', value: { status: 403 } });
		await expect(readPartnershipRewardRows(db, id)).resolves.toEqual([]);
	});
});
