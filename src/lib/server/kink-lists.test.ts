import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '$lib/testing/db';
import {
	createTestPartnership,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	type TestUser
} from '$lib/testing/fixtures';
import type { Db } from './db';
import {
	getKinkList,
	getPartnerKinkList,
	hasKinkListVersions,
	listKinkListVersions,
	listSharedKinkLists,
	saveKinkList
} from './kink-lists';

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

async function selfContent(userId: string, label = 'list') {
	return {
		vaultId: await ensureTestSelfVault(db, userId),
		ciphertext: fakeSealed(label),
		payloadVersion: 1
	};
}

describe('saveKinkList, own list', () => {
	it('creates a list, then edits it compare-and-swap on its revision', async () => {
		const id = crypto.randomUUID();
		const created = await saveKinkList(db, ada.id, {
			scope: 'self',
			id,
			content: await selfContent(ada.id, 'first'),
			expectedRevision: null
		});
		expect(created).toEqual({ ok: true, revision: 0 });

		const second = await selfContent(ada.id, 'second');
		const edited = await saveKinkList(db, ada.id, {
			scope: 'self',
			id,
			content: second,
			expectedRevision: 0
		});
		expect(edited).toEqual({ ok: true, revision: 1 });

		const list = await getKinkList(db, ada.id, 'self');
		expect(list).toMatchObject({ id, scope: 'self', revision: 1 });
		expect(list?.sealed.ciphertext).toBe(second.ciphertext);
	});

	it('refuses a stale revision as a conflict, so the browser merges and retries', async () => {
		const id = crypto.randomUUID();
		await saveKinkList(db, ada.id, {
			scope: 'self',
			id,
			content: await selfContent(ada.id),
			expectedRevision: null
		});
		await saveKinkList(db, ada.id, {
			scope: 'self',
			id,
			content: await selfContent(ada.id),
			expectedRevision: 0
		});
		const stale = await saveKinkList(db, ada.id, {
			scope: 'self',
			id,
			content: await selfContent(ada.id, 'stale'),
			expectedRevision: 0
		});
		expect(stale).toEqual({ ok: false, reason: 'conflict' });
	});

	it('refuses a second new list from another device as a conflict, keeping the first', async () => {
		const first = crypto.randomUUID();
		await saveKinkList(db, ada.id, {
			scope: 'self',
			id: first,
			content: await selfContent(ada.id, 'first'),
			expectedRevision: null
		});
		const second = await saveKinkList(db, ada.id, {
			scope: 'self',
			id: crypto.randomUUID(),
			content: await selfContent(ada.id, 'second'),
			expectedRevision: null
		});
		expect(second).toEqual({ ok: false, reason: 'conflict' });
		expect((await getKinkList(db, ada.id, 'self'))?.id).toBe(first);
	});

	it('refuses a list sealed under someone else’s vault', async () => {
		const result = await saveKinkList(db, ada.id, {
			scope: 'self',
			id: crypto.randomUUID(),
			content: await selfContent(jun.id),
			expectedRevision: null
		});
		expect(result).toEqual({ ok: false, reason: 'wrong-vault' });
	});

	it('refuses an envelope that is not a sealed record', async () => {
		const result = await saveKinkList(db, ada.id, {
			scope: 'self',
			id: crypto.randomUUID(),
			content: { ...(await selfContent(ada.id)), ciphertext: 'plain text' },
			expectedRevision: null
		});
		expect(result).toEqual({ ok: false, reason: 'bad-content' });
	});

	it('keeps each person’s list to themselves', async () => {
		await saveKinkList(db, ada.id, {
			scope: 'self',
			id: crypto.randomUUID(),
			content: await selfContent(ada.id),
			expectedRevision: null
		});
		expect(await getKinkList(db, jun.id, 'self')).toBeNull();
	});

	it('cannot edit another person’s list by its id', async () => {
		const id = crypto.randomUUID();
		await saveKinkList(db, ada.id, {
			scope: 'self',
			id,
			content: await selfContent(ada.id),
			expectedRevision: null
		});
		const result = await saveKinkList(db, jun.id, {
			scope: 'self',
			id,
			content: await selfContent(jun.id),
			expectedRevision: 0
		});
		expect(result).toEqual({ ok: false, reason: 'not-found' });
	});

	it('records when the list was last edited', async () => {
		const id = crypto.randomUUID();
		const then = new Date('2026-10-01T00:00:00Z');
		await saveKinkList(db, ada.id, {
			scope: 'self',
			id,
			content: await selfContent(ada.id),
			expectedRevision: null,
			now: then
		});
		expect((await getKinkList(db, ada.id, 'self'))?.editedAt).toEqual(then);
	});
});

describe('saveKinkList, a partnership’s copy', () => {
	it('accepts a member’s list sealed under the partnership’s vault', async () => {
		const { id: partnershipId } = await createTestPartnership(db, ada, jun);
		const result = await saveKinkList(db, ada.id, {
			scope: { partnershipId },
			id: crypto.randomUUID(),
			content: {
				vaultId: await ensureTestPartnershipVault(db, partnershipId),
				ciphertext: fakeSealed('shared'),
				payloadVersion: 1
			},
			expectedRevision: null
		});
		expect(result).toEqual({ ok: true, revision: 0 });
		// Ada's own list is a separate scope, still empty.
		expect(await getKinkList(db, ada.id, 'self')).toBeNull();
	});

	it('refuses someone outside the partnership as if it did not exist', async () => {
		const { id: partnershipId } = await createTestPartnership(db, ada, jun);
		const outsider = await createTestUser(db, { name: 'Mo' });
		const result = await saveKinkList(db, outsider.id, {
			scope: { partnershipId },
			id: crypto.randomUUID(),
			content: {
				vaultId: await ensureTestPartnershipVault(db, partnershipId),
				ciphertext: fakeSealed('shared'),
				payloadVersion: 1
			},
			expectedRevision: null
		});
		expect(result).toEqual({ ok: false, reason: 'not-member' });
	});

	it('refuses a partnership copy sealed under the member’s own vault', async () => {
		const { id: partnershipId } = await createTestPartnership(db, ada, jun);
		await ensureTestPartnershipVault(db, partnershipId);
		const result = await saveKinkList(db, ada.id, {
			scope: { partnershipId },
			id: crypto.randomUUID(),
			content: await selfContent(ada.id),
			expectedRevision: null
		});
		expect(result).toEqual({ ok: false, reason: 'wrong-vault' });
	});
});

describe('shared copies', () => {
	async function share(owner: TestUser, partnershipId: string, label = 'shared') {
		const content = {
			vaultId: await ensureTestPartnershipVault(db, partnershipId),
			ciphertext: fakeSealed(label),
			payloadVersion: 1
		};
		await saveKinkList(db, owner.id, {
			scope: { partnershipId },
			id: crypto.randomUUID(),
			content,
			expectedRevision: null
		});
		return content;
	}

	it('lets each member read the other’s copy, and only the other’s', async () => {
		const { id: partnershipId } = await createTestPartnership(db, ada, jun);
		const adas = await share(ada, partnershipId, 'ada');
		const juns = await share(jun, partnershipId, 'jun');

		const forJun = await getPartnerKinkList(db, jun.id, partnershipId);
		expect(forJun.ok && forJun.list?.sealed.ciphertext).toBe(adas.ciphertext);
		const forAda = await getPartnerKinkList(db, ada.id, partnershipId);
		expect(forAda.ok && forAda.list?.sealed.ciphertext).toBe(juns.ciphertext);
	});

	it('answers null while the partner shares nothing, and refuses anyone outside', async () => {
		const { id: partnershipId } = await createTestPartnership(db, ada, jun);
		expect(await getPartnerKinkList(db, ada.id, partnershipId)).toEqual({ ok: true, list: null });
		const outsider = await createTestUser(db, { name: 'Mo' });
		await share(ada, partnershipId);
		expect(await getPartnerKinkList(db, outsider.id, partnershipId)).toEqual({
			ok: false,
			reason: 'not-member'
		});
	});

	it('lists your shared copies but not your own list', async () => {
		const { id: partnershipId } = await createTestPartnership(db, ada, jun);
		await saveKinkList(db, ada.id, {
			scope: 'self',
			id: crypto.randomUUID(),
			content: await selfContent(ada.id),
			expectedRevision: null
		});
		await share(ada, partnershipId);
		expect((await listSharedKinkLists(db, ada.id)).map((list) => list.scope)).toEqual([
			partnershipId
		]);
	});
});

describe('version history', () => {
	const Day = 24 * 60 * 60 * 1000;
	const start = new Date('2026-01-01T00:00:00Z');
	const dayAfter = (days: number) => new Date(start.getTime() + days * Day);

	const saved = new Map<string, string>();

	/** Saves with the given label, remembering its (random) ciphertext under it. */
	async function save(id: string, label: string, expectedRevision: number | null, now: Date) {
		const content = await selfContent(ada.id, label);
		saved.set(label, content.ciphertext);
		return await saveKinkList(db, ada.id, { scope: 'self', id, content, expectedRevision, now });
	}

	it('keeps nothing while edits come within a week of each other', async () => {
		const id = crypto.randomUUID();
		await save(id, 'first', null, start);
		await save(id, 'second', 0, dayAfter(3));
		await save(id, 'third', 1, dayAfter(9));
		expect(await listKinkListVersions(db, ada.id)).toEqual([]);
	});

	it('keeps the list as it was when the next save comes after a quiet week', async () => {
		const id = crypto.randomUUID();
		await save(id, 'first', null, start);
		await save(id, 'second', 0, dayAfter(2));
		await save(id, 'after the gap', 1, dayAfter(10));

		const versions = await listKinkListVersions(db, ada.id);
		expect(versions).toHaveLength(1);
		const [version] = versions;
		expect(version?.sealed).toMatchObject({ recordId: id, ciphertext: saved.get('second') });
		expect(version?.editedTo).toEqual(dayAfter(2));
		expect((await getKinkList(db, ada.id, 'self'))?.sealed.ciphertext).toBe(
			saved.get('after the gap')
		);
	});

	it('says whether any version is kept, for the list to offer its history', async () => {
		const id = crypto.randomUUID();
		await save(id, 'first', null, start);
		expect(await hasKinkListVersions(db, ada.id)).toBe(false);
		await save(id, 'after the gap', 0, dayAfter(10));
		expect(await hasKinkListVersions(db, ada.id)).toBe(true);
	});

	it('keeps the list a fresh start replaces, however recently it changed', async () => {
		// "Start a new list", on a list its owner's device could not open.
		const id = crypto.randomUUID();
		await save(id, 'unreadable', null, start);
		const content = await selfContent(ada.id, 'empty');
		const result = await saveKinkList(db, ada.id, {
			scope: 'self',
			id,
			content,
			expectedRevision: 0,
			keepVersion: true,
			now: dayAfter(1)
		});
		expect(result.ok).toBe(true);
		const versions = await listKinkListVersions(db, ada.id);
		expect(versions.map((version) => version.sealed.ciphertext)).toEqual([saved.get('unreadable')]);
	});

	it('starts each version where the one before it ended', async () => {
		const id = crypto.randomUUID();
		await save(id, 'one', null, start);
		await save(id, 'two', 0, dayAfter(8));
		await save(id, 'three', 1, dayAfter(20));

		const versions = await listKinkListVersions(db, ada.id);
		expect(versions.map((version) => [version.editedFrom, version.editedTo])).toEqual([
			[start, start],
			[start, dayAfter(8)]
		]);
	});

	it('freezes nothing for a save that loses the race', async () => {
		const id = crypto.randomUUID();
		await save(id, 'first', null, start);
		await save(id, 'winner', 0, dayAfter(10));
		expect(await save(id, 'loser', 0, dayAfter(10))).toEqual({ ok: false, reason: 'conflict' });
		expect(await listKinkListVersions(db, ada.id)).toHaveLength(1);
	});

	it('keeps no history of a partnership’s copy', async () => {
		const { id: partnershipId } = await createTestPartnership(db, ada, jun);
		const content = async () => ({
			vaultId: await ensureTestPartnershipVault(db, partnershipId),
			ciphertext: fakeSealed('copy'),
			payloadVersion: 1
		});
		const id = crypto.randomUUID();
		const scope = { partnershipId };
		await saveKinkList(db, ada.id, {
			scope,
			id,
			content: await content(),
			expectedRevision: null,
			now: start
		});
		await saveKinkList(db, ada.id, {
			scope,
			id,
			content: await content(),
			expectedRevision: 0,
			now: dayAfter(30)
		});
		expect(await listKinkListVersions(db, ada.id)).toEqual([]);
	});

	it('lists only the user’s own versions', async () => {
		const id = crypto.randomUUID();
		await save(id, 'first', null, start);
		await save(id, 'second', 0, dayAfter(10));
		expect(await listKinkListVersions(db, jun.id)).toEqual([]);
	});
});
