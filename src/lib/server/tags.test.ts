import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db';
import { defined } from '../testing/defined';
import {
	createTestPartnership,
	createTestThread,
	createTestUser,
	ensureTestPartnershipVault,
	ensureTestSelfVault,
	fakeSealed,
	type TestUser
} from '../testing/fixtures';
import { listUnsealedContent, sealUnsealedContent } from './content-sealing';
import { messageTags } from './db/schema';
import { createTag, listTags, type SealedTagName, setThreadTags, updateTag } from './messaging';

/**
 * Message tags with sealed names (docs/messaging.md, "Tags"). The server never
 * sees a name: it stores the sealed record, and enforces "no two tags called
 * the same" through the name's blind index.
 */

let harness: TestDb;
let ada: TestUser;
let jun: TestUser;
let partnershipId: string;
let vaultId: string;

/** A stand-in blind index: 43 base64url characters, as `blindIndex` produces. */
function nameIndex(label: string): string {
	return label.padEnd(43, 'x').slice(0, 43);
}

function sealedName(label: string, overrides: Partial<SealedTagName> = {}): SealedTagName {
	return {
		vaultId,
		ciphertext: fakeSealed('tag'),
		payloadVersion: 1,
		nameIndex: nameIndex(label),
		...overrides
	};
}

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	jun = await createTestUser(harness.db, { name: 'Jun' });
	partnershipId = (await createTestPartnership(harness.db, ada, jun)).id;
	vaultId = await ensureTestPartnershipVault(harness.db, partnershipId);
});

afterEach(() => harness.close());

describe('createTag', () => {
	it('stores the sealed name and its index, and no name in the clear', async () => {
		const id = crypto.randomUUID();
		const name = sealedName('planning');
		const result = await createTag(harness.db, partnershipId, ada.id, {
			id,
			name,
			color: '#55a36b'
		});
		expect(result).toEqual({
			ok: true,
			tag: {
				id,
				name: '',
				color: '#55a36b',
				sealed: {
					recordId: id,
					vaultId,
					ciphertext: name.ciphertext,
					payloadVersion: 1
				}
			}
		});
		const [row] = await harness.db.select().from(messageTags).where(eq(messageTags.id, id));
		expect(row).toMatchObject({
			name: '',
			ciphertext: name.ciphertext,
			vaultId,
			nameIndex: name.nameIndex
		});
	});

	it('refuses a second tag whose name has the same index', async () => {
		await createTag(harness.db, partnershipId, ada.id, {
			id: crypto.randomUUID(),
			name: sealedName('planning')
		});
		await expect(
			createTag(harness.db, partnershipId, jun.id, {
				id: crypto.randomUUID(),
				name: sealedName('planning')
			})
		).resolves.toEqual({ ok: false, reason: 'duplicate-name' });
	});

	it('refuses an id that is already taken', async () => {
		const id = crypto.randomUUID();
		await createTag(harness.db, partnershipId, ada.id, { id, name: sealedName('one') });
		await expect(
			createTag(harness.db, partnershipId, ada.id, { id, name: sealedName('two') })
		).resolves.toEqual({ ok: false, reason: 'id-taken' });
	});

	it('refuses a name sealed under another vault, or malformed', async () => {
		const elsewhere = (
			await createTestPartnership(harness.db, ada, await createTestUser(harness.db))
		).id;
		const otherVault = await ensureTestPartnershipVault(harness.db, elsewhere);
		for (const name of [
			sealedName('a', { vaultId: otherVault }),
			sealedName('b', { ciphertext: 'not sealed' }),
			sealedName('c', { payloadVersion: 99 }),
			sealedName('d', { nameIndex: 'short' })
		]) {
			await expect(
				createTag(harness.db, partnershipId, ada.id, { id: crypto.randomUUID(), name })
			).resolves.toEqual({ ok: false, reason: 'invalid-name' });
		}
	});

	it('refuses someone outside the partnership', async () => {
		const stranger = await createTestUser(harness.db);
		await expect(
			createTag(harness.db, partnershipId, stranger.id, {
				id: crypto.randomUUID(),
				name: sealedName('planning')
			})
		).resolves.toEqual({ ok: false, reason: 'not-a-member' });
	});
});

describe('updateTag', () => {
	it('renames with a new sealed name and bumps the revision, or only recolours', async () => {
		const id = crypto.randomUUID();
		await createTag(harness.db, partnershipId, ada.id, { id, name: sealedName('one') });

		const renamed = sealedName('two');
		await expect(
			updateTag(harness.db, partnershipId, jun.id, id, { name: renamed })
		).resolves.toMatchObject({ ok: true, tag: { sealed: { ciphertext: renamed.ciphertext } } });
		await expect(
			updateTag(harness.db, partnershipId, jun.id, id, { color: '#3f9caa' })
		).resolves.toMatchObject({
			ok: true,
			tag: { color: '#3f9caa', sealed: { ciphertext: renamed.ciphertext } }
		});
		const [row] = await harness.db.select().from(messageTags).where(eq(messageTags.id, id));
		expect(row).toMatchObject({ revision: 1, nameIndex: renamed.nameIndex, color: '#3f9caa' });
	});

	it("refuses a rename onto another tag's name", async () => {
		const first = crypto.randomUUID();
		const second = crypto.randomUUID();
		await createTag(harness.db, partnershipId, ada.id, { id: first, name: sealedName('one') });
		await createTag(harness.db, partnershipId, ada.id, { id: second, name: sealedName('two') });
		await expect(
			updateTag(harness.db, partnershipId, ada.id, second, { name: sealedName('one') })
		).resolves.toEqual({ ok: false, reason: 'duplicate-name' });
	});
});

describe('listing', () => {
	it('lists tags with their sealed names, on the partnership and on threads', async () => {
		const id = crypto.randomUUID();
		const name = sealedName('planning');
		await createTag(harness.db, partnershipId, ada.id, { id, name });
		const { threadId } = await createTestThread(harness.db, partnershipId, ada);
		await setThreadTags(harness.db, partnershipId, ada.id, threadId, [id]);

		const tags = defined(await listTags(harness.db, partnershipId, jun.id), 'the tags');
		expect(tags).toEqual([
			{
				id,
				name: '',
				color: expect.any(String),
				sealed: { recordId: id, vaultId, ciphertext: name.ciphertext, payloadVersion: 1 }
			}
		]);
	});
});

describe('sealing tags made before sealing', () => {
	async function legacyTag(name: string): Promise<string> {
		const id = crypto.randomUUID();
		await harness.db.insert(messageTags).values({ id, partnershipId, name, color: '#5d7fc2' });
		return id;
	}

	it('hands a member the plaintext tags, and seals them with their index', async () => {
		const id = await legacyTag('planning');
		const page = defined(
			await listUnsealedContent(harness.db, jun.id, { kind: 'partnership', partnershipId }),
			'the page'
		);
		expect(page.tags).toEqual([{ id, name: 'planning' }]);

		const ciphertext = fakeSealed('tag');
		await expect(
			sealUnsealedContent(
				harness.db,
				jun.id,
				{ kind: 'partnership', partnershipId },
				{
					vaultId,
					tasks: [],
					completions: [],
					rewards: [],
					claims: [],
					tags: [{ id, ciphertext, payloadVersion: 1, nameIndex: nameIndex('planning') }]
				}
			)
		).resolves.toEqual({ ok: true, sealed: 1 });
		const [row] = await harness.db.select().from(messageTags).where(eq(messageTags.id, id));
		expect(row).toMatchObject({ name: '', ciphertext, vaultId, nameIndex: nameIndex('planning') });
	});

	it('leaves a tag in plaintext when its name is already taken, rather than failing', async () => {
		await createTag(harness.db, partnershipId, ada.id, {
			id: crypto.randomUUID(),
			name: sealedName('planning')
		});
		const clash = await legacyTag('planning');
		const fine = await legacyTag('errands');
		await expect(
			sealUnsealedContent(
				harness.db,
				ada.id,
				{ kind: 'partnership', partnershipId },
				{
					vaultId,
					tasks: [],
					completions: [],
					rewards: [],
					claims: [],
					tags: [
						{
							id: clash,
							ciphertext: fakeSealed('a'),
							payloadVersion: 1,
							nameIndex: nameIndex('planning')
						},
						{
							id: fine,
							ciphertext: fakeSealed('b'),
							payloadVersion: 1,
							nameIndex: nameIndex('errands')
						}
					]
				}
			)
		).resolves.toEqual({ ok: true, sealed: 1 });
		const [row] = await harness.db.select().from(messageTags).where(eq(messageTags.id, clash));
		expect(row).toMatchObject({ name: 'planning', ciphertext: null });
	});

	it('refuses tags in the self scope, which has none', async () => {
		const selfVault = await ensureTestSelfVault(harness.db, ada.id);
		const id = await legacyTag('planning');
		await expect(
			sealUnsealedContent(
				harness.db,
				ada.id,
				{ kind: 'self' },
				{
					vaultId: selfVault,
					tasks: [],
					completions: [],
					rewards: [],
					claims: [],
					tags: [{ id, ciphertext: fakeSealed('t'), payloadVersion: 1, nameIndex: nameIndex('p') }]
				}
			)
		).resolves.toEqual({ ok: false, reason: 'invalid' });
	});
});
