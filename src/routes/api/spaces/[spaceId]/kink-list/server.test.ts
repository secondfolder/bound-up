import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { soloSpaceFor } from '$lib/server/spaces';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestInvite,
	createTestPartnership,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	type TestUser
} from '$lib/testing/fixtures';
import { GET, PUT } from './+server';
import { GET as getPartnerCopy } from './partner/+server';

/**
 * The kink list endpoints, named by space: your own list in your solo space,
 * your copy for a partner in the partnership's shared space. What may be
 * saved is `server/kink-lists.ts`'s job and is tested there; this is which
 * space means which list, and the membership check — a space the caller is
 * not in is a 404, the same as one that does not exist.
 */

let harness: TestDb;
let ada: TestUser;
let jun: TestUser;
let cy: TestUser;
let adaSolo: string;
let junSolo: string;
let partnershipId: string;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	jun = await createTestUser(harness.db, { name: 'Jun' });
	cy = await createTestUser(harness.db, { name: 'Cy' });
	adaSolo = defined(await soloSpaceFor(harness.db, ada.id), "Ada's solo space");
	junSolo = defined(await soloSpaceFor(harness.db, jun.id), "Jun's solo space");
	partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
});

afterEach(() => harness.close());

const save = (spaceId: string, json: unknown, user: TestUser = ada) =>
	runAndCatch(() =>
		PUT(fakeEvent({ db: harness.db, user, params: { spaceId }, json, method: 'PUT' }))
	);

const fetchList = async (spaceId: string, user: TestUser | null = ada) =>
	runAndCatch(async () => {
		const response = (await GET(
			fakeEvent({ db: harness.db, user, params: { spaceId } })
		)) as Response;
		return (await response.json()) as { list: { id: string; scope: string } | null };
	});

const fetchPartnerCopy = (spaceId: string, user: TestUser = ada) =>
	runAndCatch(async () => {
		const response = (await getPartnerCopy(
			fakeEvent({ db: harness.db, user, params: { spaceId } })
		)) as Response;
		return (await response.json()) as { list: { id: string } | null };
	});

async function ownList(user: TestUser, id = crypto.randomUUID()) {
	return {
		id,
		vaultId: await ensureTestSelfVault(harness.db, user.id),
		ciphertext: fakeSealed('list'),
		payloadVersion: 1,
		expectedRevision: null
	};
}

async function sharedCopy(id = crypto.randomUUID()) {
	return {
		id,
		vaultId: await ensureTestPartnershipVault(harness.db, partnershipId),
		ciphertext: fakeSealed('copy'),
		payloadVersion: 1,
		expectedRevision: null
	};
}

describe('/api/spaces/[spaceId]/kink-list', () => {
	it('refuses an unsigned visitor', async () => {
		expect(await fetchList(adaSolo, null)).toMatchObject({ type: 'error', status: 401 });
	});

	it('saves and fetches your own list in your solo space', async () => {
		const body = await ownList(ada);
		const saved = await save(adaSolo, body);
		expect(saved.type === 'ok' && (await (saved.value as Response).json())).toEqual({
			revision: 0
		});
		expect(await fetchList(adaSolo)).toEqual({
			type: 'ok',
			value: { list: expect.objectContaining({ id: body.id, scope: 'self' }) }
		});
		// Saving it again from a stale revision is the race the browser merges after.
		expect(await save(adaSolo, body)).toMatchObject({ type: 'error', status: 409 });
	});

	it('saves your copy for a partner in the partnership’s space, where they can read it', async () => {
		const body = await sharedCopy();
		expect((await save(partnershipId, body)).type).toBe('ok');
		expect(await fetchList(partnershipId)).toEqual({
			type: 'ok',
			value: { list: expect.objectContaining({ id: body.id, scope: partnershipId }) }
		});
		// The copy is Ada's: Jun's own copy there is still unsaved.
		expect(await fetchList(partnershipId, jun)).toEqual({ type: 'ok', value: { list: null } });
		expect(await fetchPartnerCopy(partnershipId, jun)).toEqual({
			type: 'ok',
			value: { list: expect.objectContaining({ id: body.id }) }
		});
	});

	/** Your own list is sealed in your own vault, and a shared copy in the partnership's. */
	it('refuses a list sealed in the other space’s vault', async () => {
		expect(await save(partnershipId, await ownList(ada))).toMatchObject({
			type: 'error',
			status: 409
		});
		expect(await save(adaSolo, await sharedCopy())).toMatchObject({ type: 'error', status: 409 });
	});

	it('404s a space the caller is not in, a member of another space included', async () => {
		// Jun's own space, asked for by Ada, who shares a space with Jun.
		expect(await fetchList(junSolo)).toMatchObject({ type: 'error', status: 404 });
		expect(await save(junSolo, await ownList(jun))).toMatchObject({ type: 'error', status: 404 });
		// The partnership, asked for by someone outside it.
		expect(await fetchList(partnershipId, cy)).toMatchObject({ type: 'error', status: 404 });
		expect(await save(partnershipId, await sharedCopy(), cy)).toMatchObject({
			type: 'error',
			status: 404
		});
		// A space that does not exist reads the same.
		expect(await fetchList(crypto.randomUUID())).toMatchObject({ type: 'error', status: 404 });
	});

	it('will not save a copy into a pending invite’s space', async () => {
		const invite = await createTestInvite(harness.db, ada);
		expect(
			await save(invite.id, { ...(await sharedCopy()), vaultId: crypto.randomUUID() })
		).toMatchObject({ type: 'error', status: 404 });
	});
});

describe('/api/spaces/[spaceId]/kink-list/partner', () => {
	it('is null while the partner shares nothing', async () => {
		expect(await fetchPartnerCopy(partnershipId, jun)).toEqual({
			type: 'ok',
			value: { list: null }
		});
	});

	/** A solo space has nobody else in it; it reads like a space you are not in. */
	it('404s a solo space, and a shared space the caller is not in', async () => {
		expect(await fetchPartnerCopy(adaSolo)).toMatchObject({ type: 'error', status: 404 });
		expect(await fetchPartnerCopy(partnershipId, cy)).toMatchObject({
			type: 'error',
			status: 404
		});
		expect(await fetchPartnerCopy(junSolo)).toMatchObject({ type: 'error', status: 404 });
	});
});
