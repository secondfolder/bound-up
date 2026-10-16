import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defined } from '$lib/testing/defined';
import { INVITE_TTL_MS } from '../partnership';
import { createTestDb, type TestDb } from '../testing/db';
import {
	createTestInvite,
	createTestPartnership,
	createTestUser,
	ensureTestPartnershipVault,
	expireInvite,
	FAKE_INVITE_KEY_WRAP,
	fakeSealed,
	readPartnershipRow,
	type TestUser
} from '../testing/fixtures';
import type { Db } from './db';
import {
	acceptInvite,
	createInvite,
	deletePartnership,
	findPendingInviteByToken,
	generateInviteToken,
	getPartnershipForUser,
	listPartnersForNav,
	listPartnershipsForUser,
	partnershipExistsBetween,
	rotateInviteToken,
	updatePartnership
} from './partnerships';

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;
let stranger: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada', image: '/ada.png' });
	jun = await createTestUser(db, { name: 'Jun' });
	stranger = await createTestUser(db, { name: 'Stranger' });
});

afterEach(() => harness.close());

/** A freshly sealed invite, as the inviter's browser posts it. */
function sealedInvite() {
	return { ciphertext: fakeSealed('invite'), payloadVersion: 1, keyWrap: FAKE_INVITE_KEY_WRAP };
}

describe('generateInviteToken', () => {
	it('is URL-safe, so it survives being pasted into a path', () => {
		for (let i = 0; i < 20; i += 1) {
			expect(generateInviteToken()).toMatch(/^[A-Za-z0-9_-]+$/);
		}
	});

	it('does not repeat', () => {
		const tokens = new Set(Array.from({ length: 500 }, () => generateInviteToken()));
		expect(tokens.size).toBe(500);
	});

	it('carries enough entropy to be unguessable', () => {
		// 32 bytes as unpadded base64url.
		expect(generateInviteToken().length).toBeGreaterThanOrEqual(43);
	});
});

describe('createInvite', () => {
	it('stores a pending row with a live token', async () => {
		const now = new Date('2026-03-01T12:00:00Z');
		const invite = await createTestInvite(db, ada, { control: 'me', now });

		const row = await readPartnershipRow(db, invite.id);
		expect(row.status).toBe('pending');
		expect(row.inviteeId).toBeNull();
		expect(row.inviterId).toBe(ada.id);
		// "me", answered by the inviter, is stored as 'inviter'.
		expect(row.control).toBe('inviter');
		expect(row.inviteToken).toBe(invite.inviteToken);
		expect(invite.inviteExpiresAt.getTime()).toBe(now.getTime() + INVITE_TTL_MS);
	});

	it('stores the names only sealed, never in the clear', async () => {
		const invite = await createTestInvite(db, ada);

		const row = await readPartnershipRow(db, invite.id);
		expect(row.inviteCiphertext).toBe(invite.inviteCiphertext);
		expect(row.invitePayloadVersion).toBe(1);
		expect(row.inviteKeyWrap).toBe(FAKE_INVITE_KEY_WRAP);
		expect(row.inviterName).toBe('');
		expect(row.inviteeName).toBe('');
		expect(row.inviterRole).toBeNull();
		expect(row.inviteeRole).toBeNull();
		expect(row.namesCiphertext).toBeNull();
	});

	it('uses the id the browser chose, since the invite is sealed to it', async () => {
		const id = crypto.randomUUID();
		const result = await createInvite(db, {
			id,
			inviterId: ada.id,
			control: 'both',
			invite: sealedInvite()
		});
		expect(result).toMatchObject({ ok: true, id });
	});

	it('refuses an id that is already taken, leaving the first row alone', async () => {
		const first = await createTestInvite(db, ada);
		const result = await createInvite(db, {
			id: first.id,
			inviterId: stranger.id,
			control: 'both',
			invite: sealedInvite()
		});

		expect(result).toEqual({ ok: false, reason: 'id-taken' });
		const row = await readPartnershipRow(db, first.id);
		expect(row.inviterId).toBe(ada.id);
		expect(row.inviteCiphertext).toBe(first.inviteCiphertext);
	});

	it.each([
		['an empty ciphertext', { ciphertext: '' }],
		['a ciphertext of the wrong shape', { ciphertext: 'Ada and Jun in the clear' }],
		['an oversized ciphertext', { ciphertext: `sb1.${'a'.repeat(4096)}` }],
		['an unknown payload version', { payloadVersion: 99 }],
		['a key wrap that is not base64', { keyWrap: 'not base64!' }],
		['an empty key wrap', { keyWrap: '' }]
	])('refuses %s', async (_label, override) => {
		const id = crypto.randomUUID();
		const result = await createInvite(db, {
			id,
			inviterId: ada.id,
			control: 'both',
			invite: { ...sealedInvite(), ...override }
		});

		expect(result).toEqual({ ok: false, reason: 'bad-invite' });
		expect(await readPartnershipRow(db, id)).toBeUndefined();
	});

	it('lets the same inviter have several invites outstanding', async () => {
		const a = await createTestInvite(db, ada);
		const b = await createTestInvite(db, ada);
		expect(a.inviteToken).not.toBe(b.inviteToken);
		expect(await listPartnershipsForUser(db, ada.id)).toHaveLength(2);
	});
});

describe('findPendingInviteByToken', () => {
	it('finds a live invite', async () => {
		const invite = await createTestInvite(db, ada);
		const found = await findPendingInviteByToken(db, invite.inviteToken);
		expect(found?.id).toBe(invite.id);
	});

	it('returns null for an unknown token', async () => {
		expect(await findPendingInviteByToken(db, 'nope')).toBeNull();
	});
});

describe('acceptInvite', () => {
	it('links the two accounts and consumes the token', async () => {
		const invite = await createTestInvite(db, ada);
		const result = await acceptInvite(db, { token: invite.inviteToken, inviteeId: jun.id });

		expect(result).toEqual({ ok: true, id: invite.id });
		const row = await readPartnershipRow(db, invite.id);
		expect(row.status).toBe('accepted');
		expect(row.inviteeId).toBe(jun.id);
		expect(row.acceptedAt).toBeInstanceOf(Date);
		// Cleared so the link cannot be replayed, and so the unique index is
		// free for the same inviter's next invite.
		expect(row.inviteToken).toBeNull();
		expect(row.inviteExpiresAt).toBeNull();
	});

	it('refuses a token that has already been used', async () => {
		const invite = await createTestInvite(db, ada);
		await acceptInvite(db, { token: invite.inviteToken, inviteeId: jun.id });

		const second = await acceptInvite(db, { token: invite.inviteToken, inviteeId: stranger.id });
		expect(second).toEqual({ ok: false, reason: 'not-found' });
	});

	it('only one of two simultaneous accepts wins', async () => {
		const invite = await createTestInvite(db, ada);
		const [first, second] = await Promise.all([
			acceptInvite(db, { token: invite.inviteToken, inviteeId: jun.id }),
			acceptInvite(db, { token: invite.inviteToken, inviteeId: stranger.id })
		]);

		expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
		const row = await readPartnershipRow(db, invite.id);
		expect([jun.id, stranger.id]).toContain(row.inviteeId);
	});

	it('refuses an expired invite', async () => {
		const invite = await createTestInvite(db, ada);
		await expireInvite(db, invite.id);

		expect(await acceptInvite(db, { token: invite.inviteToken, inviteeId: jun.id })).toEqual({
			ok: false,
			reason: 'expired'
		});
	});

	it('refuses an unknown token', async () => {
		expect(await acceptInvite(db, { token: 'nope', inviteeId: jun.id })).toEqual({
			ok: false,
			reason: 'not-found'
		});
	});

	it('refuses the inviter accepting their own link', async () => {
		const invite = await createTestInvite(db, ada);
		expect(await acceptInvite(db, { token: invite.inviteToken, inviteeId: ada.id })).toEqual({
			ok: false,
			reason: 'self'
		});
	});

	it('refuses a second link between the same two people', async () => {
		await createTestPartnership(db, ada, jun);
		const second = await createTestInvite(db, ada);

		expect(await acceptInvite(db, { token: second.inviteToken, inviteeId: jun.id })).toEqual({
			ok: false,
			reason: 'already-linked'
		});
	});

	it('refuses a duplicate even when the roles are reversed', async () => {
		await createTestPartnership(db, ada, jun);
		// Jun now invites Ada. They are already linked, just the other way round.
		const reversed = await createTestInvite(db, jun);

		expect(await acceptInvite(db, { token: reversed.inviteToken, inviteeId: ada.id })).toEqual({
			ok: false,
			reason: 'already-linked'
		});
	});

	it('refuses an invite from before names were sealed, which has no invite key', async () => {
		const invite = await createTestInvite(db, ada, {
			legacyNames: { inviterName: 'Ada', inviteeName: 'Jun' }
		});

		expect(await acceptInvite(db, { token: invite.inviteToken, inviteeId: jun.id })).toEqual({
			ok: false,
			reason: 'expired'
		});
		const row = await readPartnershipRow(db, invite.id);
		expect(row.status).toBe('pending');
		expect(row.inviteeId).toBeNull();
	});

	it('keeps the sealed invite on the row, since there is no vault to move it to yet', async () => {
		const invite = await createTestInvite(db, ada);
		await acceptInvite(db, { token: invite.inviteToken, inviteeId: jun.id });

		const row = await readPartnershipRow(db, invite.id);
		expect(row.inviteCiphertext).toBe(invite.inviteCiphertext);
		expect(row.inviteKeyWrap).toBe(FAKE_INVITE_KEY_WRAP);
	});

	it('refuses re-sealed names of the wrong shape', async () => {
		const invite = await createTestInvite(db, ada, { control: 'mix' });
		const result = await acceptInvite(db, {
			token: invite.inviteToken,
			inviteeId: jun.id,
			invite: { ciphertext: 'Renamed Ada', payloadVersion: 1 }
		});

		expect(result).toEqual({ ok: false, reason: 'bad-invite' });
		const row = await readPartnershipRow(db, invite.id);
		expect(row.status).toBe('pending');
		expect(row.inviteCiphertext).toBe(invite.inviteCiphertext);
	});

	describe('the names the accepter re-seals', () => {
		it('replace the invite when control is shared', async () => {
			const invite = await createTestInvite(db, ada, { control: 'mix' });
			const resealed = fakeSealed('renamed');
			await acceptInvite(db, {
				token: invite.inviteToken,
				inviteeId: jun.id,
				invite: { ciphertext: resealed, payloadVersion: 1 },
				control: 'invitee'
			});

			const row = await readPartnershipRow(db, invite.id);
			expect(row.inviteCiphertext).toBe(resealed);
			expect(row.control).toBe('invitee');
			// The key is unchanged, so the inviter's wrap of it still opens the new seal.
			expect(row.inviteKeyWrap).toBe(FAKE_INVITE_KEY_WRAP);
		});

		it('replace the invite when the accepter holds control', async () => {
			// "them", answered by the inviter, means the invitee is in control.
			const invite = await createTestInvite(db, ada, { control: 'them' });
			const resealed = fakeSealed('renamed');
			await acceptInvite(db, {
				token: invite.inviteToken,
				inviteeId: jun.id,
				invite: { ciphertext: resealed, payloadVersion: 1 }
			});

			expect((await readPartnershipRow(db, invite.id)).inviteCiphertext).toBe(resealed);
		});

		it('are ignored when the inviter holds control', async () => {
			const invite = await createTestInvite(db, ada, { control: 'me' });
			await acceptInvite(db, {
				token: invite.inviteToken,
				inviteeId: jun.id,
				invite: { ciphertext: fakeSealed('hijacked'), payloadVersion: 1 },
				control: 'invitee'
			});

			const row = await readPartnershipRow(db, invite.id);
			expect(row.inviteCiphertext).toBe(invite.inviteCiphertext);
			// The control setting itself is the most important thing not to hand
			// over: accepting must not be a way to seize it.
			expect(row.control).toBe('inviter');
			// ...but the link is still made.
			expect(row.status).toBe('accepted');
		});
	});
});

describe('rotateInviteToken', () => {
	it('issues a new token and kills the old one', async () => {
		const invite = await createTestInvite(db, ada);
		const rotated = await rotateInviteToken(db, invite.id, ada.id, sealedInvite());

		expect(rotated?.inviteToken).toBeTruthy();
		expect(rotated?.inviteToken).not.toBe(invite.inviteToken);
		expect(await findPendingInviteByToken(db, invite.inviteToken)).toBeNull();
		expect(
			(await findPendingInviteByToken(db, defined(rotated, 'the rotated invite').inviteToken))?.id
		).toBe(invite.id);
	});

	it('seals the invite again under the new key', async () => {
		const invite = await createTestInvite(db, ada);
		const next = { ...sealedInvite(), keyWrap: 'bmV3LWtleS13cmFw' };
		await rotateInviteToken(db, invite.id, ada.id, next);

		const row = await readPartnershipRow(db, invite.id);
		expect(row.inviteCiphertext).toBe(next.ciphertext);
		expect(row.inviteKeyWrap).toBe('bmV3LWtleS13cmFw');
	});

	it('gives an invite from before sealing a key, clearing its plaintext names', async () => {
		const invite = await createTestInvite(db, ada, {
			legacyNames: {
				inviterName: 'Ada',
				inviteeName: 'Jun',
				inviterRole: 'dom',
				inviteeRole: 'sub'
			}
		});
		const next = sealedInvite();
		const rotated = await rotateInviteToken(db, invite.id, ada.id, next);

		const row = await readPartnershipRow(db, invite.id);
		expect(row.inviteCiphertext).toBe(next.ciphertext);
		expect(row.inviterName).toBe('');
		expect(row.inviteeName).toBe('');
		expect(row.inviterRole).toBeNull();
		expect(row.inviteeRole).toBeNull();
		// ...and the new link can be accepted, where the legacy one could not.
		expect(
			await acceptInvite(db, {
				token: defined(rotated, 'the rotated invite').inviteToken,
				inviteeId: jun.id
			})
		).toEqual({ ok: true, id: invite.id });
	});

	it('refuses a malformed re-seal, leaving the old link working', async () => {
		const invite = await createTestInvite(db, ada);
		expect(
			await rotateInviteToken(db, invite.id, ada.id, { ...sealedInvite(), ciphertext: 'plain' })
		).toBeNull();
		expect(
			await rotateInviteToken(db, invite.id, ada.id, { ...sealedInvite(), keyWrap: '!!' })
		).toBeNull();
		expect((await findPendingInviteByToken(db, invite.inviteToken))?.inviteCiphertext).toBe(
			invite.inviteCiphertext
		);
	});

	it('extends the expiry window', async () => {
		const created = new Date('2026-03-01T00:00:00Z');
		const invite = await createTestInvite(db, ada, { now: created });
		const later = new Date('2026-03-05T00:00:00Z');

		const rotated = await rotateInviteToken(db, invite.id, ada.id, sealedInvite(), later);
		expect(rotated?.inviteExpiresAt.getTime()).toBe(later.getTime() + INVITE_TTL_MS);
	});

	it('refuses anyone who is not the inviter', async () => {
		const invite = await createTestInvite(db, ada);
		expect(await rotateInviteToken(db, invite.id, stranger.id, sealedInvite())).toBeNull();
		// The original link must survive a rejected rotation, sealed names and all.
		expect((await findPendingInviteByToken(db, invite.inviteToken))?.inviteCiphertext).toBe(
			invite.inviteCiphertext
		);
	});

	it('refuses an already-accepted partnership', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		expect(await rotateInviteToken(db, id, ada.id, sealedInvite())).toBeNull();
	});
});

describe('listPartnersForNav', () => {
	it('hands each side the names source for their own end, and the other’s picture', async () => {
		const invite = await createTestInvite(db, ada);
		await acceptInvite(db, { token: invite.inviteToken, inviteeId: jun.id });

		const [adaTab] = await listPartnersForNav(db, ada.id);
		expect(adaTab).toMatchObject({ id: invite.id, image: null });
		expect(adaTab.names).toMatchObject({ partnershipId: invite.id, role: 'inviter' });
		expect(adaTab.names.invite?.ciphertext).toBe(invite.inviteCiphertext);

		const [junTab] = await listPartnersForNav(db, jun.id);
		expect(junTab).toMatchObject({ id: invite.id, image: '/ada.png' });
		expect(junTab.names.role).toBe('invitee');
		// The key wrap is to the inviter: the invitee has no use for it.
		expect(junTab.names.invite?.keyWrap).toBeNull();
		expect(adaTab.names.invite?.keyWrap).toBe(FAKE_INVITE_KEY_WRAP);
	});

	it('a partnership from before sealing still carries its plaintext names', async () => {
		await createTestPartnership(db, ada, jun, {
			legacyNames: { inviterName: 'Ada', inviteeName: 'Jun' }
		});
		const [tab] = await listPartnersForNav(db, jun.id);
		expect(tab.names.legacy).toMatchObject({ inviterName: 'Ada', inviteeName: 'Jun' });
		expect(tab.names.role).toBe('invitee');
	});

	it('leaves pending invites out of the nav', async () => {
		await createTestInvite(db, ada);
		expect(await listPartnersForNav(db, ada.id)).toEqual([]);
	});

	it('shows nothing to someone in no partnerships', async () => {
		await createTestPartnership(db, ada, jun);
		expect(await listPartnersForNav(db, stranger.id)).toEqual([]);
	});

	it('lists several partners in a stable order', async () => {
		const kit = await createTestUser(db, { name: 'Kit' });
		const withJun = await createTestPartnership(db, ada, jun);
		const withKit = await createTestPartnership(db, kit, ada);

		const first = await listPartnersForNav(db, ada.id);
		const second = await listPartnersForNav(db, ada.id);
		expect(first.map((p) => p.id).sort((a, b) => a.localeCompare(b))).toEqual(
			[withJun.id, withKit.id].sort((a, b) => a.localeCompare(b))
		);
		expect(first.map((p) => p.names.role).sort((a, b) => a.localeCompare(b))).toEqual([
			'invitee',
			'inviter'
		]);
		expect(second).toEqual(first);
	});

	it('keys tabs on the partnership id, not the partner’s user id', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		const [tab] = await listPartnersForNav(db, ada.id);
		expect(tab.id).toBe(id);
		expect(tab.id).not.toBe(jun.id);
	});
});

describe('listPartnershipsForUser', () => {
	it('includes both pending and accepted', async () => {
		await createTestPartnership(db, ada, jun);
		const pending = await createTestInvite(db, ada);

		const all = await listPartnershipsForUser(db, ada.id);
		expect(all.map((p) => p.status).sort((a, b) => a.localeCompare(b))).toEqual([
			'accepted',
			'pending'
		]);
		const view = all.find((p) => p.status === 'pending');
		expect(view?.names.invite?.ciphertext).toBe(pending.inviteCiphertext);
		expect(view?.names.invite?.keyWrap).toBe(FAKE_INVITE_KEY_WRAP);
	});

	it('shows the invitee their side of the row', async () => {
		await createTestPartnership(db, ada, jun, {
			legacyNames: { inviterName: 'Ada', inviteeName: 'Jun' }
		});
		const [view] = await listPartnershipsForUser(db, jun.id);
		expect(view.role).toBe('invitee');
		expect(view.names.role).toBe('invitee');
		expect(view.names.legacy).toMatchObject({ inviterName: 'Ada', inviteeName: 'Jun' });
	});
});

describe('getPartnershipForUser', () => {
	it('returns the row to a member', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		expect((await getPartnershipForUser(db, id, ada.id))?.id).toBe(id);
		expect((await getPartnershipForUser(db, id, jun.id))?.id).toBe(id);
	});

	it('returns null to anyone else', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		expect(await getPartnershipForUser(db, id, stranger.id)).toBeNull();
	});

	it('returns null for an id that does not exist', async () => {
		expect(await getPartnershipForUser(db, 'made-up', ada.id)).toBeNull();
	});

	it('gives a pending invite back to its inviter, token and all', async () => {
		const invite = await createTestInvite(db, ada);
		const view = await getPartnershipForUser(db, invite.id, ada.id);
		expect(view?.status).toBe('pending');
		expect(view?.inviteToken).toBe(invite.inviteToken);
		expect(view?.counterpart).toBeNull();
	});
});

describe('updatePartnership', () => {
	/** The names sealed in `id`'s vault, as an editor that opened `revision` posts them. */
	async function sealedNames(id: string, expectedRevision = 0) {
		return {
			vaultId: await ensureTestPartnershipVault(db, id),
			ciphertext: fakeSealed('names'),
			payloadVersion: 1,
			expectedRevision
		};
	}

	it('applies an edit from the side that holds control', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const names = await sealedNames(id);
		const result = await updatePartnership(db, id, ada.id, { control: 'both', names });

		expect(result).toEqual({ ok: true });
		const row = await readPartnershipRow(db, id);
		expect(row.namesCiphertext).toBe(names.ciphertext);
		expect(row.namesVaultId).toBe(names.vaultId);
		expect(row.namesRevision).toBe(1);
		expect(row.control).toBe('both');
	});

	it('moves the names into the vault, clearing the invite and any plaintext', async () => {
		const { id } = await createTestPartnership(db, ada, jun, {
			legacyNames: { inviterName: 'Ada', inviteeName: 'Jun', inviterRole: 'dom' }
		});
		await updatePartnership(db, id, ada.id, { control: 'both', names: await sealedNames(id) });

		const row = await readPartnershipRow(db, id);
		expect(row.inviterName).toBe('');
		expect(row.inviteeName).toBe('');
		expect(row.inviterRole).toBeNull();
		expect(row.inviteCiphertext).toBeNull();
		expect(row.inviteKeyWrap).toBeNull();
	});

	it('changes only control when no names are posted', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const before = await readPartnershipRow(db, id);
		expect(await updatePartnership(db, id, ada.id, { control: 'invitee' })).toEqual({ ok: true });

		const row = await readPartnershipRow(db, id);
		expect(row.control).toBe('invitee');
		expect(row.inviteCiphertext).toBe(before.inviteCiphertext);
		expect(row.namesRevision).toBe(before.namesRevision);
	});

	it('refuses the side that does not', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		const result = await updatePartnership(db, id, jun.id, {
			control: 'invitee',
			names: await sealedNames(id)
		});

		expect(result).toEqual({ ok: false, reason: 'forbidden' });
		const row = await readPartnershipRow(db, id);
		expect(row.namesCiphertext).toBeNull();
		expect(row.control).toBe('inviter');
	});

	it('lets either side edit when control is shared', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		expect(
			await updatePartnership(db, id, ada.id, { control: 'both', names: await sealedNames(id, 0) })
		).toEqual({ ok: true });
		expect(
			await updatePartnership(db, id, jun.id, { control: 'both', names: await sealedNames(id, 1) })
		).toEqual({ ok: true });
		expect((await readPartnershipRow(db, id)).namesRevision).toBe(2);
	});

	it('refuses a non-member outright', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
		const result = await updatePartnership(db, id, stranger.id, { control: 'both' });
		expect(result).toEqual({ ok: false, reason: 'forbidden' });
	});

	it('handing control away takes it away immediately', async () => {
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		await updatePartnership(db, id, ada.id, { control: 'invitee' });

		// Ada gave control to Jun, so her next edit must be refused.
		const second = await updatePartnership(db, id, ada.id, { control: 'inviter' });
		expect(second).toEqual({ ok: false, reason: 'forbidden' });
		expect((await readPartnershipRow(db, id)).control).toBe('invitee');
	});

	describe('the sealed names', () => {
		it('are refused when the edit was made against a stale revision', async () => {
			const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
			const adas = await sealedNames(id, 0);
			await updatePartnership(db, id, ada.id, { control: 'both', names: adas });

			// Jun opened the names before Ada saved: the server cannot merge
			// what it cannot read, so his write must not silently replace hers.
			const result = await updatePartnership(db, id, jun.id, {
				control: 'invitee',
				names: await sealedNames(id, 0)
			});

			expect(result).toEqual({ ok: false, reason: 'conflict' });
			const row = await readPartnershipRow(db, id);
			expect(row.namesCiphertext).toBe(adas.ciphertext);
			expect(row.namesRevision).toBe(1);
			expect(row.control).toBe('both');
		});

		it('are refused when sealed in another partnership’s vault', async () => {
			const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
			await ensureTestPartnershipVault(db, id);
			const other = await createTestPartnership(db, ada, stranger);
			const result = await updatePartnership(db, id, ada.id, {
				control: 'both',
				names: { ...(await sealedNames(other.id)) }
			});

			expect(result).toEqual({ ok: false, reason: 'bad-names' });
			expect((await readPartnershipRow(db, id)).namesCiphertext).toBeNull();
		});

		it('are refused when the partnership has no vault yet', async () => {
			const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
			const result = await updatePartnership(db, id, ada.id, {
				control: 'both',
				names: {
					vaultId: crypto.randomUUID(),
					ciphertext: fakeSealed('names'),
					payloadVersion: 1,
					expectedRevision: 0
				}
			});
			expect(result).toEqual({ ok: false, reason: 'bad-names' });
		});

		it('are refused when the ciphertext is malformed', async () => {
			const { id } = await createTestPartnership(db, ada, jun, { control: 'mix' });
			const result = await updatePartnership(db, id, ada.id, {
				control: 'both',
				names: { ...(await sealedNames(id)), ciphertext: 'Ada and Jun' }
			});
			expect(result).toEqual({ ok: false, reason: 'bad-names' });
		});

		it('are refused on a pending invite, which has no vault', async () => {
			const invite = await createTestInvite(db, ada);
			const result = await updatePartnership(db, invite.id, ada.id, {
				control: 'both',
				names: await sealedNames(invite.id)
			});
			expect(result).toEqual({ ok: false, reason: 'bad-names' });
		});
	});

	describe('a pending invite’s names', () => {
		it('are sealed again by the inviter', async () => {
			const invite = await createTestInvite(db, ada, { control: 'mix' });
			const resealed = fakeSealed('renamed');
			const result = await updatePartnership(db, invite.id, ada.id, {
				control: 'inviter',
				invite: { ciphertext: resealed, payloadVersion: 1 }
			});

			expect(result).toEqual({ ok: true });
			const row = await readPartnershipRow(db, invite.id);
			expect(row.inviteCiphertext).toBe(resealed);
			expect(row.control).toBe('inviter');
			// Same key, so the link already sent still opens the new seal.
			expect(row.inviteToken).toBe(invite.inviteToken);
			expect(row.inviteKeyWrap).toBe(FAKE_INVITE_KEY_WRAP);
		});

		it('are refused once the invite has been accepted', async () => {
			const invite = await createTestInvite(db, ada, { control: 'mix' });
			await acceptInvite(db, { token: invite.inviteToken, inviteeId: jun.id });

			for (const editor of [ada, jun]) {
				const result = await updatePartnership(db, invite.id, editor.id, {
					control: 'both',
					invite: { ciphertext: fakeSealed('late'), payloadVersion: 1 }
				});
				expect(result).toEqual({ ok: false, reason: 'bad-names' });
			}
			expect((await readPartnershipRow(db, invite.id)).inviteCiphertext).toBe(
				invite.inviteCiphertext
			);
		});

		it('are refused when malformed', async () => {
			const invite = await createTestInvite(db, ada);
			const result = await updatePartnership(db, invite.id, ada.id, {
				control: 'both',
				invite: { ciphertext: 'Jun', payloadVersion: 1 }
			});
			expect(result).toEqual({ ok: false, reason: 'bad-names' });
			expect((await readPartnershipRow(db, invite.id)).inviteCiphertext).toBe(
				invite.inviteCiphertext
			);
		});

		it('are refused from a stranger', async () => {
			const invite = await createTestInvite(db, ada);
			const result = await updatePartnership(db, invite.id, stranger.id, {
				control: 'both',
				invite: { ciphertext: fakeSealed('x'), payloadVersion: 1 }
			});
			expect(result).toEqual({ ok: false, reason: 'forbidden' });
		});
	});
});

describe('deletePartnership', () => {
	it('lets the side without control leave anyway', async () => {
		// The rule this protects: control gates editing, never leaving.
		const { id } = await createTestPartnership(db, ada, jun, { control: 'me' });
		expect(await deletePartnership(db, id, jun.id)).toBe(true);
		expect(await readPartnershipRow(db, id)).toBeUndefined();
	});

	it('lets the inviter cancel a pending invite', async () => {
		const invite = await createTestInvite(db, ada);
		expect(await deletePartnership(db, invite.id, ada.id)).toBe(true);
		expect(await findPendingInviteByToken(db, invite.inviteToken)).toBeNull();
	});

	it('refuses a non-member', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		expect(await deletePartnership(db, id, stranger.id)).toBe(false);
		expect(await readPartnershipRow(db, id)).toBeDefined();
	});

	it('removes the partner from both navs', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		await deletePartnership(db, id, ada.id);
		expect(await listPartnersForNav(db, ada.id)).toEqual([]);
		expect(await listPartnersForNav(db, jun.id)).toEqual([]);
	});

	it('frees the pair to link again afterwards', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		await deletePartnership(db, id, ada.id);

		const again = await createTestInvite(db, ada);
		expect(await acceptInvite(db, { token: again.inviteToken, inviteeId: jun.id })).toMatchObject({
			ok: true
		});
	});
});

describe('partnershipExistsBetween', () => {
	it('is true in both directions once linked', async () => {
		await createTestPartnership(db, ada, jun);
		expect(await partnershipExistsBetween(db, ada.id, jun.id)).toBe(true);
		expect(await partnershipExistsBetween(db, jun.id, ada.id)).toBe(true);
	});

	it('is false while the invite is only pending', async () => {
		await createTestInvite(db, ada);
		expect(await partnershipExistsBetween(db, ada.id, jun.id)).toBe(false);
	});
});

describe('cascade behaviour', () => {
	it('deleting a user takes their partnerships with them', async () => {
		const { id } = await createTestPartnership(db, ada, jun);
		const { user } = await import('./db/schema');
		const { eq } = await import('drizzle-orm');
		await db.delete(user).where(eq(user.id, jun.id));

		// Otherwise Ada would keep a nav tab pointing at a deleted account.
		expect(await readPartnershipRow(db, id)).toBeUndefined();
	});
});
