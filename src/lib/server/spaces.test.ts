import { getTableColumns, getTableName, inArray, is, sql } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db';
import { defined } from '../testing/defined';
import {
	claimTestReward,
	completeTestTask,
	createTestDaydream,
	createTestInvite,
	createTestNotebookEntry,
	createTestPartnership,
	createTestPartnershipReward,
	createTestPartnershipTask,
	createTestRestoreRequest,
	createTestSelfReward,
	createTestSelfTask,
	createTestThread,
	createTestUser,
	createTestUserKeys,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	type TestUser
} from '../testing/fixtures';
import { createLibraryItem } from './daydreams';
import { type Db, schema } from './db';
import { partnerships, spaceMembers, spaces, user, vaults } from './db/schema';
import { createDream } from './dreams';
import { saveKinkList } from './kink-lists';
import { createTag } from './messaging';
import { acceptInvite, deletePartnership, getPartnershipForUser } from './partnerships';
import {
	deleteAccount,
	deleteSpace,
	listSpacesForUser,
	requireSpaceMember,
	soloSpaceFor
} from './spaces';
import { putEscrow } from './vaults';

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

async function membersOf(spaceId: string) {
	return await db
		.select({ userId: spaceMembers.userId, canManage: spaceMembers.canManage })
		.from(spaceMembers)
		.where(sql`${spaceMembers.spaceId} = ${spaceId}`)
		.orderBy(spaceMembers.userId);
}

describe('solo spaces', () => {
	it('gives every account exactly one, with them as its only manager', async () => {
		const spaceId = defined(await soloSpaceFor(db, ada.id), 'Ada’s solo space');
		expect(await requireSpaceMember(db, spaceId, ada.id)).toEqual({
			spaceId,
			kind: 'solo',
			canManage: true
		});
		expect(await membersOf(spaceId)).toEqual([{ userId: ada.id, canManage: true }]);
		expect(await soloSpaceFor(db, jun.id)).not.toBe(spaceId);
		expect(await requireSpaceMember(db, spaceId, jun.id)).toBeNull();
	});

	it('is given a v4 UUID, like every id the app makes', async () => {
		expect(await soloSpaceFor(db, ada.id)).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
		);
	});
});

describe('shared spaces', () => {
	it('take the partnership’s id, with the inviter as a member from the invite on', async () => {
		const invite = await createTestInvite(db, ada, { control: 'me' });
		expect(await requireSpaceMember(db, invite.id, ada.id)).toEqual({
			spaceId: invite.id,
			kind: 'shared',
			canManage: true
		});
		expect(await membersOf(invite.id)).toEqual([{ userId: ada.id, canManage: true }]);

		await acceptInvite(db, { token: invite.inviteToken, inviteeId: jun.id });
		expect(await membersOf(invite.id)).toEqual(
			[
				{ userId: ada.id, canManage: true },
				{ userId: jun.id, canManage: false }
			].sort((a, b) => a.userId.localeCompare(b.userId))
		);
	});

	it.each([
		['me', true, false],
		['them', false, true],
		['mix', true, true]
	] as const)(
		'sets can_manage from the offer as accepted (%s, from the inviter)',
		async (control, inviter, invitee) => {
			const { id } = await createTestPartnership(db, ada, jun, { control });
			expect(await requireSpaceMember(db, id, ada.id)).toMatchObject({ canManage: inviter });
			expect(await requireSpaceMember(db, id, jun.id)).toMatchObject({ canManage: invitee });
			// And every screen reads who manages from the members.
			expect(new Set((await getPartnershipForUser(db, id, ada.id))?.members)).toEqual(
				new Set([
					{ userId: ada.id, canManage: inviter },
					{ userId: jun.id, canManage: invitee }
				])
			);
		}
	);

	it('reads control from the members, not the column', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		// The column alone says Jun holds control; the members still say Ada.
		await db.update(partnerships).set({ control: 'invitee' }).where(sql`id = ${id}`);
		expect((await getPartnershipForUser(db, id, ada.id))?.canEdit).toBe(true);
		expect((await getPartnershipForUser(db, id, jun.id))?.canEdit).toBe(false);
	});

	it('leaves the members alone when an accept loses the race', async () => {
		const invite = await createTestInvite(db, ada);
		const mo = await createTestUser(db, { name: 'Mo' });
		await acceptInvite(db, { token: invite.inviteToken, inviteeId: jun.id });
		expect(await acceptInvite(db, { token: invite.inviteToken, inviteeId: mo.id })).toEqual({
			ok: false,
			reason: 'not-found'
		});
		expect(await requireSpaceMember(db, invite.id, mo.id)).toBeNull();
	});

	it('refuses an invite under an id that is already a space, and joins nobody to it', async () => {
		const adaSpace = defined(await soloSpaceFor(db, ada.id), 'Ada’s solo space');
		const { createInvite } = await import('./partnerships');
		const result = await createInvite(db, {
			id: adaSpace,
			inviterId: jun.id,
			control: 'inviter',
			invite: { ciphertext: fakeSealed('invite'), payloadVersion: 1, keyWrap: 'd3JhcA==' }
		});
		expect(result).toEqual({ ok: false, reason: 'id-taken' });
		expect(await requireSpaceMember(db, adaSpace, jun.id)).toBeNull();
		expect(await db.select().from(partnerships)).toEqual([]);
	});

	it('lists a user’s spaces, their own first', async () => {
		const first = await createTestPartnership(db, ada, jun);
		const mo = await createTestUser(db, { name: 'Mo' });
		const second = await createTestPartnership(db, mo, ada);
		const listed = await listSpacesForUser(db, ada.id);
		expect(listed.map((space) => space.spaceId)).toEqual([
			await soloSpaceFor(db, ada.id),
			first.id,
			second.id
		]);
		expect(listed.map((space) => space.kind)).toEqual(['solo', 'shared', 'shared']);
	});
});

/** Every table with a `space_id`, straight from the schema, so a new one is checked without anyone listing it. */
function spaceScopedTables(): SQLiteTable[] {
	const tables: SQLiteTable[] = [];
	for (const value of Object.values(schema) as unknown[]) {
		if (is(value, SQLiteTable) && 'spaceId' in getTableColumns(value)) {
			tables.push(value);
		}
	}
	return tables;
}

async function rowsIn(spaceIds: string[]): Promise<Record<string, number>> {
	const counts: Record<string, number> = {};
	for (const table of spaceScopedTables()) {
		const column = defined(getTableColumns(table).spaceId, 'space_id');
		const [row] = await db
			.select({ n: sql<number>`count(*)` })
			.from(table)
			.where(inArray(column, spaceIds));
		counts[getTableName(table)] = row?.n ?? 0;
	}
	return counts;
}

/** Something in every space-scoped table, for one person's space and one shared one. */
async function fillSpaces(partnershipId: string) {
	await createTestUserKeys(db, ada);
	await createTestUserKeys(db, jun);
	const shared = await ensureTestPartnershipVault(db, partnershipId);
	const own = await ensureTestSelfVault(db, ada.id);

	await createTestNotebookEntry(db, ada);
	await createTestNotebookEntry(db, ada, { partnershipId });
	await createTestThread(db, partnershipId, ada);
	await createTag(db, partnershipId, ada.id, {
		id: crypto.randomUUID(),
		name: {
			vaultId: shared,
			ciphertext: fakeSealed('tag'),
			payloadVersion: 1,
			nameIndex: 'n'.repeat(43)
		}
	});
	for (const scope of ['self', { partnershipId }] as const) {
		await saveKinkList(db, ada.id, {
			scope,
			id: crypto.randomUUID(),
			content: {
				vaultId: scope === 'self' ? own : shared,
				ciphertext: fakeSealed('list'),
				payloadVersion: 1
			},
			expectedRevision: null
		});
	}
	await createTestRestoreRequest(db, {
		partnershipId,
		requesterId: ada.id,
		recipient: 'age1stand-in'
	});
	const escrowed = await putEscrow(db, ada.id, {
		id: crypto.randomUUID(),
		heldInSpaceId: partnershipId,
		ciphertext: 'd3JhcA=='
	});
	if (!escrowed) {
		throw new Error('fixture: the escrow was refused');
	}
	await createTestDaydream(db, ada.id);
	await createDream(db, ada.id, crypto.randomUUID(), {
		vaultId: own,
		ciphertext: fakeSealed('dream'),
		payloadVersion: 1
	});
	for (const kind of ['characters', 'ideas'] as const) {
		await createLibraryItem(db, ada.id, kind, {
			id: crypto.randomUUID(),
			content: { vaultId: own, ciphertext: fakeSealed(kind), payloadVersion: 1 }
		});
	}
	// A task and a reward in each space, each completed or claimed, so their
	// completions, claims and balances are there too.
	const ownTask = await createTestSelfTask(db, ada);
	await completeTestTask(db, ada, ownTask.id);
	const ownReward = await createTestSelfReward(db, ada, { cost: 1 });
	await claimTestReward(db, ada, ownReward.id);
	const sharedTask = await createTestPartnershipTask(db, partnershipId, ada);
	await completeTestTask(db, jun, sharedTask.id);
	const sharedReward = await createTestPartnershipReward(db, partnershipId, ada, { cost: 1 });
	await claimTestReward(db, jun, sharedReward.id);
}

describe('deleting a space', () => {
	it('fills every space-scoped table in these tests, so the checks below check something', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		await fillSpaces(id);
		const solo = defined(await soloSpaceFor(db, ada.id), 'solo space');
		const empty = Object.entries(await rowsIn([id, solo])).filter(([, n]) => n === 0);
		// A table listed here gained a `space_id` without a row in `fillSpaces`.
		expect(empty).toEqual([]);
	});

	it('every scoped row the app writes carries its space', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		await fillSpaces(id);
		for (const table of spaceScopedTables()) {
			const column = defined(getTableColumns(table).spaceId, 'space_id');
			const [row] = await db
				.select({ n: sql<number>`count(*)` })
				.from(table)
				.where(sql`${column} is null`);
			expect({ table: getTableName(table), n: row?.n }).toEqual({
				table: getTableName(table),
				n: 0
			});
		}
	});

	it('ending a partnership leaves nothing behind in its space', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		await fillSpaces(id);
		expect(await deletePartnership(db, id, jun.id)).toBe(true);

		expect(Object.values(await rowsIn([id])).every((n) => n === 0)).toBe(true);
		expect(await db.select().from(spaces).where(sql`id = ${id}`)).toEqual([]);
		expect(await membersOf(id)).toEqual([]);
		expect(await db.select().from(vaults).where(sql`partnership_id = ${id}`)).toEqual([]);
		// Ada's own space is untouched.
		const solo = defined(await soloSpaceFor(db, ada.id), 'solo space');
		expect(Object.values(await rowsIn([solo])).some((n) => n > 0)).toBe(true);
	});

	it('refuses someone who is not a member, and deletes nothing', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		const mo = await createTestUser(db, { name: 'Mo' });
		expect(await deletePartnership(db, id, mo.id)).toBe(false);
		expect(await requireSpaceMember(db, id, ada.id)).not.toBeNull();
	});

	it('deleting an account leaves nothing behind in any of its spaces', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		await fillSpaces(id);
		const solo = defined(await soloSpaceFor(db, ada.id), 'solo space');

		await deleteAccount(db, ada.id);

		expect(await rowsIn([id, solo])).toEqual(
			Object.fromEntries(spaceScopedTables().map((table) => [getTableName(table), 0]))
		);
		expect(
			await db
				.select()
				.from(spaces)
				.where(inArray(spaces.id, [id, solo]))
		).toEqual([]);
		expect(await db.select().from(user).where(sql`id = ${ada.id}`)).toEqual([]);
		// Jun keeps their own space, and is no longer in a shared one.
		expect((await listSpacesForUser(db, jun.id)).map((space) => space.kind)).toEqual(['solo']);
	});

	it('deleteSpace on a solo space takes its vault and what is sealed under it', async () => {
		await createTestUserKeys(db, ada);
		await createTestSelfTask(db, ada);
		const solo = defined(await soloSpaceFor(db, ada.id), 'solo space');
		await deleteSpace(db, solo);
		expect(await db.select().from(vaults)).toEqual([]);
		expect(await soloSpaceFor(db, ada.id)).toBeNull();
	});
});
