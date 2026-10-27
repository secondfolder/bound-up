import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { soloSpaceFor } from '$lib/server/spaces';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import {
	createTestInvite,
	createTestPartnership,
	createTestUser,
	createTestUserKeys,
	type TestUser
} from '$lib/testing/fixtures';
import { DELETE, POST } from './+server';
import { POST as releaseEscrow } from './escrow-release/+server';
import { POST as issueShare } from './escrow-share/+server';
import { DELETE as deleteEscrows, PUT as putEscrow } from './escrows/+server';
import { PUT as putWrap } from './wraps/+server';

/**
 * The space vault endpoints' answers. What may be written is
 * `server/vaults.ts`'s job and is tested there; this is the mapping from its
 * results to statuses, which the browser relies on — 409 in particular is how
 * a device learns it lost a race rather than failed — and the membership
 * check every path starts with: a space the caller is not in is a 404, the
 * same as one that does not exist.
 */

const SECRET = 'route-test-secret';
const KEY_CHECK = 'A'.repeat(43);
const WRAP = 'd3JhcA==';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let harness: TestDb;
let ada: TestUser;
let jun: TestUser;
let cy: TestUser;
let adaKey: string;
let junKey: string;
let adaSolo: string;
let junSolo: string;
let partnershipId: string;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	jun = await createTestUser(harness.db, { name: 'Jun' });
	cy = await createTestUser(harness.db, { name: 'Cy' });
	adaKey = (await createTestUserKeys(harness.db, ada)).recipient;
	junKey = (await createTestUserKeys(harness.db, jun)).recipient;
	await createTestUserKeys(harness.db, cy);
	adaSolo = defined(await soloSpaceFor(harness.db, ada.id), "Ada's solo space");
	junSolo = defined(await soloSpaceFor(harness.db, jun.id), "Jun's solo space");
	partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
});

afterEach(() => harness.close());

const ownVault = (vaultId = id(1)) => ({
	id: vaultId,
	keyCheck: KEY_CHECK,
	wraps: [{ userId: ada.id, ciphertext: WRAP, forRecipient: adaKey }]
});

const sharedVault = (vaultId = id(2)) => ({
	id: vaultId,
	keyCheck: KEY_CHECK,
	wraps: [
		{ userId: ada.id, ciphertext: WRAP, forRecipient: adaKey },
		{ userId: jun.id, ciphertext: WRAP, forRecipient: junKey }
	]
});

const create = (spaceId: string, json: unknown, user: TestUser | null = ada) =>
	runAndCatch(() => POST(fakeEvent({ db: harness.db, user, params: { spaceId }, json })));

const status = (result: Awaited<ReturnType<typeof runAndCatch>>) =>
	result.type === 'ok' ? (result.value as Response).status : result.status;

describe('POST /api/spaces/[spaceId]/vault', () => {
	it('refuses an unsigned visitor', async () => {
		expect(await create(adaSolo, ownVault(), null)).toMatchObject({ type: 'error', status: 401 });
	});

	it('creates, then answers a second vault for the same space with 409', async () => {
		expect(status(await create(adaSolo, ownVault(id(1))))).toBe(201);
		expect(await create(adaSolo, ownVault(id(3)))).toMatchObject({ type: 'error', status: 409 });
		expect(status(await create(partnershipId, sharedVault(id(2))))).toBe(201);
		expect(await create(partnershipId, sharedVault(id(4)), jun)).toMatchObject({
			type: 'error',
			status: 409
		});
	});

	it('rejects an id the browser did not make, a missing wrap, and a scope in the body', async () => {
		expect(await create(adaSolo, ownVault('not-a-uuid'))).toMatchObject({ status: 400 });
		expect(await create(adaSolo, { ...ownVault(), wraps: [] })).toMatchObject({ status: 400 });
		// The space is the path's: one wrap is not every member of a shared space.
		expect(await create(partnershipId, ownVault())).toMatchObject({ status: 400 });
	});

	it('404s a space the caller is not in, a member of another space included', async () => {
		// Jun's own space, asked for by Ada, who shares a space with Jun.
		expect(await create(junSolo, ownVault())).toMatchObject({ type: 'error', status: 404 });
		// The partnership, asked for by someone outside it.
		expect(await create(partnershipId, sharedVault(), cy)).toMatchObject({
			type: 'error',
			status: 404
		});
		// A space that does not exist reads the same.
		expect(await create(id(99), ownVault())).toMatchObject({ type: 'error', status: 404 });
	});

	it('404s a pending invite’s space, which has nobody to share a vault with yet', async () => {
		const invite = await createTestInvite(harness.db, ada);
		expect(await create(invite.id, sharedVault())).toMatchObject({ type: 'error', status: 404 });
	});
});

describe('PUT /api/spaces/[spaceId]/vault/wraps', () => {
	const put = (spaceId: string, json: unknown, user: TestUser = ada) =>
		runAndCatch(() =>
			putWrap(fakeEvent({ db: harness.db, user, params: { spaceId }, json, method: 'PUT' }))
		);

	beforeEach(async () => {
		await create(adaSolo, ownVault(id(1)));
		await create(partnershipId, sharedVault(id(2)));
	});

	it('takes a wrap for the named space’s vault', async () => {
		const result = await put(adaSolo, {
			vaultId: id(1),
			userId: ada.id,
			ciphertext: WRAP,
			forRecipient: adaKey
		});
		expect(status(result)).toBe(200);
	});

	it('answers 409 for a partner’s wrap that still opens', async () => {
		expect(
			await put(partnershipId, {
				vaultId: id(2),
				userId: jun.id,
				ciphertext: WRAP,
				forRecipient: junKey
			})
		).toMatchObject({ type: 'error', status: 409 });
	});

	/** A member of both spaces still cannot reach one's vault through the other. */
	it('404s a vault that is not the named space’s', async () => {
		expect(
			await put(adaSolo, { vaultId: id(2), userId: ada.id, ciphertext: WRAP, forRecipient: adaKey })
		).toMatchObject({ type: 'error', status: 404 });
		expect(
			await put(partnershipId, {
				vaultId: id(1),
				userId: ada.id,
				ciphertext: WRAP,
				forRecipient: adaKey
			})
		).toMatchObject({ type: 'error', status: 404 });
	});

	it('404s a space the caller is not in', async () => {
		expect(
			await put(
				partnershipId,
				{ vaultId: id(2), userId: cy.id, ciphertext: WRAP, forRecipient: adaKey },
				cy
			)
		).toMatchObject({ type: 'error', status: 404 });
		expect(
			await put(
				adaSolo,
				{ vaultId: id(1), userId: jun.id, ciphertext: WRAP, forRecipient: junKey },
				jun
			)
		).toMatchObject({ type: 'error', status: 404 });
	});

	it('rejects a body without the vault it is for', async () => {
		expect(
			await put(adaSolo, { userId: ada.id, ciphertext: WRAP, forRecipient: adaKey })
		).toMatchObject({ type: 'error', status: 400 });
	});
});

describe('the own vault’s endpoints', () => {
	beforeEach(async () => {
		await create(adaSolo, ownVault(id(1)));
	});

	const share = (spaceId: string, escrowId: string, user: TestUser = ada) =>
		runAndCatch(() =>
			issueShare(
				fakeEvent({
					db: harness.db,
					user,
					params: { spaceId },
					json: { escrowId },
					authContext: { secret: SECRET }
				})
			)
		);
	const escrow = (spaceId: string, heldInSpaceId: string, user: TestUser = ada) =>
		runAndCatch(() =>
			putEscrow(
				fakeEvent({
					db: harness.db,
					user,
					params: { spaceId },
					json: { id: id(30), heldInSpaceId, ciphertext: WRAP },
					method: 'PUT'
				})
			)
		);
	const release = (spaceId: string, user: TestUser = ada) =>
		runAndCatch(() =>
			releaseEscrow(
				fakeEvent({ db: harness.db, user, params: { spaceId }, authContext: { secret: SECRET } })
			)
		);
	const dropEscrows = (spaceId: string, user: TestUser = ada) =>
		runAndCatch(() => deleteEscrows(fakeEvent({ db: harness.db, user, params: { spaceId } })));
	const deleteVault = (spaceId: string, user: TestUser = ada) =>
		runAndCatch(() => DELETE(fakeEvent({ db: harness.db, user, params: { spaceId } })));

	it('work in the caller’s own solo space', async () => {
		expect(status(await share(adaSolo, id(30)))).toBe(200);
		expect(status(await escrow(adaSolo, partnershipId))).toBe(200);
		const released = await release(adaSolo);
		expect(released.type === 'ok' && (await (released.value as Response).json())).toEqual({
			relays: []
		});
		expect(status(await dropEscrows(adaSolo))).toBe(204);
		// Still opens with Ada's key, so it is not lost and is not deleted.
		expect(await deleteVault(adaSolo)).toMatchObject({ type: 'error', status: 409 });
	});

	/**
	 * Only the own vault is escrowed or deleted as lost, so a shared space —
	 * one the caller is in — is a 404 like any space that is not theirs.
	 */
	it('404 in a shared space, in someone else’s solo space, and in none', async () => {
		for (const spaceId of [partnershipId, junSolo, id(99)]) {
			expect(await share(spaceId, id(31))).toMatchObject({ type: 'error', status: 404 });
			expect(await escrow(spaceId, partnershipId)).toMatchObject({ type: 'error', status: 404 });
			expect(await release(spaceId)).toMatchObject({ type: 'error', status: 404 });
			expect(await dropEscrows(spaceId)).toMatchObject({ type: 'error', status: 404 });
			expect(await deleteVault(spaceId)).toMatchObject({ type: 'error', status: 404 });
		}
	});

	it('hold an escrow only with a partner the caller really has', async () => {
		const elsewhere = (await createTestPartnership(harness.db, jun, cy)).id;
		expect(await escrow(adaSolo, elsewhere)).toMatchObject({ type: 'error', status: 404 });
		expect(await escrow(adaSolo, adaSolo)).toMatchObject({ type: 'error', status: 404 });
	});
});
