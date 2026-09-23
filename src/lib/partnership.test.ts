import { describe, expect, it, test } from 'vitest';
import {
	answerFromControl,
	type ControlAnswer,
	canDisconnect,
	canEditPartnership,
	controlFromAnswer,
	INVITE_TTL_MS,
	isInviteUsable,
	type PartnershipControl,
	type PartnershipRecord,
	type PartnershipRole,
	roleOf,
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
		...overrides
	};
}

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
	it('the inviter sees the invitee name as their partner', () => {
		const view = viewPartnership(record(), INVITER);
		expect(view.partnerName).toBe('Name-For-Invitee');
		expect(view.yourName).toBe('Name-For-Inviter');
		expect(view.role).toBe('inviter');
	});

	it('the invitee sees the mirror image of the same row', () => {
		const view = viewPartnership(record(), INVITEE);
		expect(view.partnerName).toBe('Name-For-Inviter');
		expect(view.yourName).toBe('Name-For-Invitee');
		expect(view.role).toBe('invitee');
	});

	it('the roles flip with the viewer, like the names', () => {
		const r = record({ inviterRole: 'Role-For-Inviter', inviteeRole: 'Role-For-Invitee' });
		const inviterView = viewPartnership(r, INVITER);
		expect(inviterView.partnerRole).toBe('Role-For-Invitee');
		expect(inviterView.yourRole).toBe('Role-For-Inviter');
		const inviteeView = viewPartnership(r, INVITEE);
		expect(inviteeView.partnerRole).toBe('Role-For-Inviter');
		expect(inviteeView.yourRole).toBe('Role-For-Invitee');
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
