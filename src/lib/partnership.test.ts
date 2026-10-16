import { describe, expect, it, test } from 'vitest';
import {
	answerFromControl,
	type ControlAnswer,
	canDisconnect,
	canEditPartnership,
	controlFromAnswer,
	INVITE_TTL_MS,
	isInviteUsable,
	namesForViewer,
	namesSourceFor,
	type PartnershipControl,
	type PartnershipRecord,
	type PartnershipRole,
	roleOf,
	type StoredNames,
	storedNamesFrom,
	type ViewerNames,
	viewPartnership
} from './partnership';

const INVITER = 'user-inviter';
const INVITEE = 'user-invitee';
const STRANGER = 'user-stranger';

function record(overrides: Partial<PartnershipRecord> = {}): PartnershipRecord {
	return {
		id: 'p1',
		status: 'accepted',
		inviterId: INVITER,
		inviteeId: INVITEE,
		// Named so a swapped assertion is obvious rather than a coin flip.
		inviterName: 'Name-For-Inviter',
		inviteeName: 'Name-For-Invitee',
		inviterRole: null,
		inviteeRole: null,
		control: 'both',
		namesCiphertext: null,
		namesVaultId: null,
		namesPayloadVersion: null,
		namesRevision: 0,
		inviteCiphertext: null,
		invitePayloadVersion: null,
		inviteKeyWrap: null,
		...overrides
	};
}

/** The sealed columns of a row whose names are in the partnership's vault. */
const SEALED_NAMES = {
	inviterName: '',
	inviteeName: '',
	namesCiphertext: 'sb1.names',
	namesVaultId: 'vault-1',
	namesPayloadVersion: 1,
	namesRevision: 3
} satisfies Partial<PartnershipRecord>;

/** The columns of a row whose names are still sealed under the invite key. */
const INVITE_NAMES = {
	inviterName: '',
	inviteeName: '',
	inviteCiphertext: 'sb1.invite',
	invitePayloadVersion: 1,
	inviteKeyWrap: 'd3JhcA=='
} satisfies Partial<PartnershipRecord>;

describe('roleOf', () => {
	it('identifies each side', () => {
		expect(roleOf(record(), INVITER)).toBe('inviter');
		expect(roleOf(record(), INVITEE)).toBe('invitee');
	});

	it('returns null for someone who is not a member', () => {
		expect(roleOf(record(), STRANGER)).toBeNull();
	});

	it('returns null for the invitee slot while it is empty', () => {
		// A pending row has inviteeId === null, and null must never match a
		// missing/undefined user id by accident.
		expect(roleOf(record({ status: 'pending', inviteeId: null }), STRANGER)).toBeNull();
	});
});

describe('canEditPartnership', () => {
	it('"both" lets either side edit', () => {
		const r = record({ control: 'both' });
		expect(canEditPartnership(r, INVITER)).toBe(true);
		expect(canEditPartnership(r, INVITEE)).toBe(true);
	});

	it('"inviter" lets only the inviter edit', () => {
		const r = record({ control: 'inviter' });
		expect(canEditPartnership(r, INVITER)).toBe(true);
		expect(canEditPartnership(r, INVITEE)).toBe(false);
	});

	it('"invitee" lets only the invitee edit', () => {
		const r = record({ control: 'invitee' });
		expect(canEditPartnership(r, INVITER)).toBe(false);
		expect(canEditPartnership(r, INVITEE)).toBe(true);
	});

	it('never lets a non-member edit, whatever the control setting', () => {
		for (const control of ['inviter', 'invitee', 'both'] as PartnershipControl[]) {
			expect(canEditPartnership(record({ control }), STRANGER)).toBe(false);
		}
	});
});

describe('canDisconnect', () => {
	it('either member may leave regardless of who holds control', () => {
		for (const control of ['inviter', 'invitee', 'both'] as PartnershipControl[]) {
			const r = record({ control });
			expect(canDisconnect(r, INVITER)).toBe(true);
			expect(canDisconnect(r, INVITEE)).toBe(true);
		}
	});

	it('a non-member may not', () => {
		expect(canDisconnect(record(), STRANGER)).toBe(false);
	});
});

describe('viewPartnership', () => {
	it('carries no plaintext names, only where to read them from', () => {
		const view = viewPartnership(record(SEALED_NAMES), INVITER);
		expect(view).not.toHaveProperty('partnerName');
		expect(view).not.toHaveProperty('yourName');
		expect(view.names.sealed?.ciphertext).toBe('sb1.names');
	});

	it('the names source carries the viewer’s role, so the mapping flips with them', () => {
		expect(viewPartnership(record(), INVITER).names.role).toBe('inviter');
		expect(viewPartnership(record(), INVITEE).names.role).toBe('invitee');
		expect(viewPartnership(record(), INVITEE).role).toBe('invitee');
	});

	it('canEdit is carried onto the view', () => {
		expect(viewPartnership(record({ control: 'inviter' }), INVITEE).canEdit).toBe(false);
		expect(viewPartnership(record({ control: 'inviter' }), INVITER).canEdit).toBe(true);
	});

	it('throws rather than returning a half-built view for a stranger', () => {
		expect(() => viewPartnership(record(), STRANGER)).toThrow(/not a member/);
	});

	it('carries the counterpart through untouched', () => {
		const view = viewPartnership(record(), INVITER, {
			userId: INVITEE,
			image: '/a.png',
			timezone: 'UTC'
		});
		expect(view.counterpart).toEqual({ userId: INVITEE, image: '/a.png', timezone: 'UTC' });
	});

	it('id is the partnership id, never a user id', () => {
		expect(viewPartnership(record({ id: 'p-42' }), INVITER).id).toBe('p-42');
	});
});

describe('namesForViewer / storedNamesFrom', () => {
	// Named so a swapped assertion is obvious rather than a coin flip.
	const stored: StoredNames = {
		inviterName: 'Name-For-Inviter',
		inviteeName: 'Name-For-Invitee',
		inviterRole: 'Role-For-Inviter',
		inviteeRole: 'Role-For-Invitee'
	};

	it('the inviter sees the invitee name as their partner', () => {
		expect(namesForViewer(stored, 'inviter')).toEqual({
			partnerName: 'Name-For-Invitee',
			yourName: 'Name-For-Inviter',
			partnerRole: 'Role-For-Invitee',
			yourRole: 'Role-For-Inviter'
		});
	});

	it('the invitee sees the mirror image of the same names', () => {
		expect(namesForViewer(stored, 'invitee')).toEqual({
			partnerName: 'Name-For-Inviter',
			yourName: 'Name-For-Invitee',
			partnerRole: 'Role-For-Inviter',
			yourRole: 'Role-For-Invitee'
		});
	});

	it('round-trips from storage through either viewer', () => {
		for (const role of ['inviter', 'invitee'] as PartnershipRole[]) {
			expect(storedNamesFrom(namesForViewer(stored, role), role)).toEqual(stored);
		}
	});

	it('round-trips from what a viewer typed through storage', () => {
		const typed: ViewerNames = {
			partnerName: 'Theirs',
			yourName: 'Mine',
			partnerRole: null,
			yourRole: 'My-Role'
		};
		for (const role of ['inviter', 'invitee'] as PartnershipRole[]) {
			expect(namesForViewer(storedNamesFrom(typed, role), role)).toEqual(typed);
		}
	});

	it('stores what the inviter typed against the inviter’s columns', () => {
		const typed: ViewerNames = {
			partnerName: 'Theirs',
			yourName: 'Mine',
			partnerRole: null,
			yourRole: null
		};
		expect(storedNamesFrom(typed, 'inviter').inviterName).toBe('Mine');
		expect(storedNamesFrom(typed, 'invitee').inviterName).toBe('Theirs');
	});
});

describe('namesSourceFor', () => {
	it('a row from before sealing is a legacy source, in plaintext', () => {
		const source = namesSourceFor(record({ inviterRole: 'R' }), 'invitee');
		expect(source).toEqual({
			partnershipId: 'p1',
			role: 'invitee',
			sealed: null,
			invite: null,
			legacy: {
				inviterName: 'Name-For-Inviter',
				inviteeName: 'Name-For-Invitee',
				inviterRole: 'R',
				inviteeRole: null
			}
		});
	});

	it('an invite hands its key wrap to the inviter only', () => {
		const r = record({ status: 'pending', inviteeId: null, ...INVITE_NAMES });
		expect(namesSourceFor(r, 'inviter')).toEqual({
			partnershipId: 'p1',
			role: 'inviter',
			sealed: null,
			invite: { ciphertext: 'sb1.invite', payloadVersion: 1, keyWrap: 'd3JhcA==' },
			legacy: null
		});
		// The invitee keeps the key from the link; a wrap to the inviter is not theirs.
		expect(namesSourceFor(r, 'invitee').invite).toEqual({
			ciphertext: 'sb1.invite',
			payloadVersion: 1,
			keyWrap: null
		});
	});

	it('sealed names are read from the vault, revision included', () => {
		expect(namesSourceFor(record(SEALED_NAMES), 'invitee')).toEqual({
			partnershipId: 'p1',
			role: 'invitee',
			sealed: { vaultId: 'vault-1', ciphertext: 'sb1.names', payloadVersion: 1, revision: 3 },
			invite: null,
			legacy: null
		});
	});

	it('sealed names win over a leftover invite', () => {
		const source = namesSourceFor(record({ ...INVITE_NAMES, ...SEALED_NAMES }), 'inviter');
		expect(source.sealed).not.toBeNull();
		expect(source.invite).toBeNull();
		expect(source.legacy).toBeNull();
	});

	it('an invite is never mistaken for legacy names', () => {
		const source = namesSourceFor(record(INVITE_NAMES), 'inviter');
		expect(source.legacy).toBeNull();
	});

	it('a half-written sealed record is not a sealed source', () => {
		const source = namesSourceFor(record({ ...SEALED_NAMES, namesVaultId: null }), 'inviter');
		expect(source.sealed).toBeNull();
	});
});

describe('controlFromAnswer / answerFromControl', () => {
	it('maps the asker’s side onto the stored roles', () => {
		expect(controlFromAnswer('me', 'inviter')).toBe('inviter');
		expect(controlFromAnswer('them', 'inviter')).toBe('invitee');
		expect(controlFromAnswer('me', 'invitee')).toBe('invitee');
		expect(controlFromAnswer('them', 'invitee')).toBe('inviter');
		expect(controlFromAnswer('mix', 'inviter')).toBe('both');
		expect(controlFromAnswer('mix', 'invitee')).toBe('both');
	});

	it('round-trips for every answer and role', () => {
		for (const answer of ['me', 'them', 'mix'] as ControlAnswer[]) {
			for (const role of ['inviter', 'invitee'] as PartnershipRole[]) {
				expect(answerFromControl(controlFromAnswer(answer, role), role)).toBe(answer);
			}
		}
	});

	it('"me" for one side reads as "them" for the other', () => {
		// The regression this guards: storing the answer verbatim would make both
		// members believe they were in control.
		const stored = controlFromAnswer('me', 'inviter');
		expect(answerFromControl(stored, 'inviter')).toBe('me');
		expect(answerFromControl(stored, 'invitee')).toBe('them');
	});
});

describe('isInviteUsable', () => {
	const now = new Date('2026-01-01T00:00:00Z');
	const live = {
		status: 'pending' as const,
		inviteToken: 'tok',
		inviteExpiresAt: new Date(now.getTime() + 1000)
	};

	it('accepts a pending invite inside its window', () => {
		expect(isInviteUsable(live, now)).toBe(true);
	});

	it('rejects one that has expired', () => {
		expect(isInviteUsable({ ...live, inviteExpiresAt: new Date(now.getTime() - 1) }, now)).toBe(
			false
		);
	});

	it('rejects one that expires exactly now', () => {
		expect(isInviteUsable({ ...live, inviteExpiresAt: now }, now)).toBe(false);
	});

	it('rejects an already-accepted partnership', () => {
		expect(isInviteUsable({ ...live, status: 'accepted' }, now)).toBe(false);
	});

	it('rejects a consumed token', () => {
		expect(isInviteUsable({ ...live, inviteToken: null }, now)).toBe(false);
		expect(isInviteUsable({ ...live, inviteExpiresAt: null }, now)).toBe(false);
	});
});

test('INVITE_TTL_MS is seven days', () => {
	expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
});
