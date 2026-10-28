import { describe, expect, it } from 'vitest';
import {
	canMoveEntry,
	canSetAccess,
	compactionBound,
	entryAccessFor,
	groupByMonth,
	holdsAccessAuthority,
	holdsControl,
	isEntryDate,
	type PartnerAccess,
	type SpaceForAccess,
	shouldCutVersion,
	VERSION_IDLE_MS,
	VERSION_MAX_INTERVAL_MS
} from './notebook';

/** The notebook's rules, without a database. See docs/notebook.md, "Access". */

const ada = 'ada';
const bo = 'bo';
const stranger = 'cy';

/**
 * Ada and Bo's space, managed as a role-shaped answer says (Ada invited Bo):
 * `inviter` is Ada alone, `invitee` Bo alone, `both` the two of them.
 */
function partnership(control: 'inviter' | 'invitee' | 'both'): SpaceForAccess {
	return {
		members: [
			{ userId: ada, canManage: control !== 'invitee' },
			{ userId: bo, canManage: control !== 'inviter' }
		]
	};
}

/** A shared entry; Ada wrote it unless `createdBy` says otherwise. */
function shared(
	partnerAccess: PartnerAccess,
	setBy: string | null = null,
	createdBy: string | null = ada
) {
	return {
		scope: 'partnership' as const,
		partnerAccess,
		accessSetByUserId: setBy,
		createdByUserId: createdBy
	};
}

describe('entryAccessFor', () => {
	it('lets only the owner near a solo entry', () => {
		const entry = { scope: 'self' as const, ownerId: ada };
		expect(entryAccessFor(entry, ada)).toBe('edit');
		expect(entryAccessFor(entry, bo)).toBe('none');
	});

	it('lets both partners edit a shared entry by default', () => {
		const link = partnership('inviter');
		expect(entryAccessFor(shared('edit'), ada, link)).toBe('edit');
		expect(entryAccessFor(shared('edit'), bo, link)).toBe('edit');
	});

	it('gives nobody outside the partnership anything', () => {
		expect(entryAccessFor(shared('edit'), stranger, partnership('both'))).toBe('none');
		expect(entryAccessFor(shared('edit'), ada)).toBe('none');
	});

	it('binds a restriction only on the member who did not set it', () => {
		const link = partnership('inviter');
		expect(entryAccessFor(shared('read', ada), ada, link)).toBe('edit');
		expect(entryAccessFor(shared('read', ada), bo, link)).toBe('read');
		expect(entryAccessFor(shared('hidden', ada), ada, link)).toBe('edit');
		expect(entryAccessFor(shared('hidden', ada), bo, link)).toBe('none');
	});
});

describe('holdsAccessAuthority', () => {
	it('is whoever holds control, whoever wrote the entry', () => {
		expect(holdsAccessAuthority(shared('edit', null, bo), ada, partnership('inviter'))).toBe(true);
		expect(holdsAccessAuthority(shared('edit', null, bo), bo, partnership('inviter'))).toBe(false);
	});

	/** Shared control gives the say over each entry to whoever created it. */
	it('is the creator alone when control is shared', () => {
		expect(holdsAccessAuthority(shared('edit', null, ada), ada, partnership('both'))).toBe(true);
		expect(holdsAccessAuthority(shared('edit', null, ada), bo, partnership('both'))).toBe(false);
		expect(holdsAccessAuthority(shared('edit', null, bo), bo, partnership('both'))).toBe(true);
	});

	/** An entry whose creator deleted their account must still have somebody with the say. */
	it('falls back to either member when the creator is gone', () => {
		expect(holdsAccessAuthority(shared('edit', null, null), ada, partnership('both'))).toBe(true);
		expect(holdsAccessAuthority(shared('edit', null, null), bo, partnership('both'))).toBe(true);
	});

	it('is never for someone outside the partnership', () => {
		expect(
			holdsAccessAuthority(shared('edit', null, stranger), stranger, partnership('both'))
		).toBe(false);
	});

	/**
	 * Written in members, so a space of more than two needs nothing new: the
	 * creator's say, when it is shared, holds only while they are still in it.
	 */
	it('reads can_manage per member, and falls back when the creator has left', () => {
		const group: SpaceForAccess = {
			members: [
				{ userId: ada, canManage: true },
				{ userId: bo, canManage: true },
				{ userId: stranger, canManage: false }
			]
		};
		expect(holdsAccessAuthority(shared('edit', null, bo), ada, group)).toBe(false);
		expect(holdsAccessAuthority(shared('edit', null, bo), bo, group)).toBe(true);
		expect(holdsAccessAuthority(shared('edit', null, stranger), stranger, group)).toBe(false);
		const left = shared('edit', null, 'someone-who-left');
		expect(holdsAccessAuthority(left, ada, group)).toBe(true);
		expect(holdsAccessAuthority(left, bo, group)).toBe(true);
		expect(entryAccessFor(shared('hidden', ada), stranger, group)).toBe('none');
		expect(entryAccessFor(shared('read', ada), stranger, group)).toBe('read');
	});
});

describe('canMoveEntry', () => {
	it('is for the owner of a solo entry and nobody else', () => {
		expect(canMoveEntry({ scope: 'self', ownerId: ada }, ada)).toBe(true);
		expect(canMoveEntry({ scope: 'self', ownerId: ada }, bo)).toBe(false);
	});

	it('is for whoever has the say over a shared entry, as setting its access is', () => {
		expect(canMoveEntry(shared('edit'), ada, partnership('inviter'))).toBe(true);
		expect(canMoveEntry(shared('edit'), bo, partnership('inviter'))).toBe(false);
		expect(canMoveEntry(shared('edit', null, bo), bo, partnership('both'))).toBe(true);
		expect(canMoveEntry(shared('edit', null, bo), ada, partnership('both'))).toBe(false);
		expect(canMoveEntry(shared('edit'), stranger, partnership('both'))).toBe(false);
	});

	it('is never for a shared entry without its space to check against', () => {
		expect(canMoveEntry(shared('edit'), ada)).toBe(false);
	});
});

describe('canSetAccess', () => {
	it('is for whoever holds control', () => {
		expect(canSetAccess(shared('edit'), ada, partnership('inviter'))).toBe(true);
		expect(canSetAccess(shared('edit'), bo, partnership('inviter'))).toBe(false);
		expect(canSetAccess(shared('edit'), bo, partnership('invitee'))).toBe(true);
	});

	it('is only for the creator when control is shared', () => {
		expect(canSetAccess(shared('edit', null, ada), ada, partnership('both'))).toBe(true);
		expect(canSetAccess(shared('edit', null, ada), bo, partnership('both'))).toBe(false);
		expect(canSetAccess(shared('edit', null, bo), bo, partnership('both'))).toBe(true);
	});

	it('is never for someone outside the partnership', () => {
		expect(canSetAccess(shared('edit'), stranger, partnership('both'))).toBe(false);
	});

	it('does not let a member lift a restriction set against them by someone who still has the say', () => {
		expect(canSetAccess(shared('hidden', ada), bo, partnership('both'))).toBe(false);
		expect(canSetAccess(shared('read', ada), bo, partnership('both'))).toBe(false);
		expect(canSetAccess(shared('hidden', ada), ada, partnership('both'))).toBe(true);
	});

	/** Handing control over must never lock its new holder out of their own notebook. */
	it('lets the member now holding control lift a restriction once its setter has lost it', () => {
		expect(canSetAccess(shared('hidden', ada), bo, partnership('invitee'))).toBe(true);
		expect(canSetAccess(shared('hidden', ada), ada, partnership('invitee'))).toBe(false);
	});

	/**
	 * Before only the creator could restrict under shared control, either
	 * member could. Such a restriction must not be stuck: the creator, who has
	 * the say now, may lift it.
	 */
	it('lets the creator lift a restriction the other member set under shared control', () => {
		expect(canSetAccess(shared('hidden', bo, ada), ada, partnership('both'))).toBe(true);
		expect(canSetAccess(shared('hidden', bo, ada), bo, partnership('both'))).toBe(false);
	});
});

describe('holdsControl', () => {
	it('follows the control setting', () => {
		expect(holdsControl(partnership('inviter'), ada)).toBe(true);
		expect(holdsControl(partnership('inviter'), bo)).toBe(false);
		expect(holdsControl(partnership('both'), bo)).toBe(true);
		expect(holdsControl(partnership('both'), stranger)).toBe(false);
	});
});

describe('shouldCutVersion', () => {
	const now = 10_000_000;

	it('waits while nothing has been edited since the last version', () => {
		expect(shouldCutVersion({ lastEditAt: null, lastVersionAt: 0, now })).toBe(false);
	});

	it('cuts once the entry has been idle long enough', () => {
		expect(
			shouldCutVersion({ lastEditAt: now - VERSION_IDLE_MS, lastVersionAt: now - 1000, now })
		).toBe(true);
		expect(
			shouldCutVersion({ lastEditAt: now - VERSION_IDLE_MS + 1, lastVersionAt: now - 1000, now })
		).toBe(false);
	});

	it('splits a very long sitting even while it is still going', () => {
		expect(
			shouldCutVersion({
				lastEditAt: now - 1000,
				lastVersionAt: now - VERSION_MAX_INTERVAL_MS,
				now
			})
		).toBe(true);
	});

	it('takes the e2e overrides', () => {
		expect(
			shouldCutVersion({ lastEditAt: now - 600, lastVersionAt: now - 1000, now, idleMs: 500 })
		).toBe(true);
	});
});

describe('compactionBound', () => {
	it('keeps everything while there is only one version', () => {
		expect(compactionBound([])).toBeNull();
		expect(compactionBound([40])).toBeNull();
	});

	/** One version's margin, so a bad newest snapshot can still be rebuilt around. */
	it('is the second-newest version, never the newest', () => {
		expect(compactionBound([40, 90])).toBe(40);
		expect(compactionBound([90, 12, 40])).toBe(40);
	});
});

describe('groupByMonth', () => {
	it('groups consecutive entries by month, keeping their order', () => {
		const entries = [
			{ id: 'a', entryDate: '2026-10-22' },
			{ id: 'b', entryDate: '2026-10-01' },
			{ id: 'c', entryDate: '2026-09-30' }
		];
		expect(groupByMonth(entries)).toEqual([
			{ month: '2026-10', entries: [entries[0], entries[1]] },
			{ month: '2026-09', entries: [entries[2]] }
		]);
	});
});

describe('isEntryDate', () => {
	it.each(['2026-10-22', '2024-02-29'])('accepts %s', (date) => {
		expect(isEntryDate(date)).toBe(true);
	});

	it.each(['2026-13-01', '2026-1-1', '22/10/2026', '', null])('refuses %s', (date) => {
		expect(isEntryDate(date)).toBe(false);
	});
});
