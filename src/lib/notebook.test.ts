import { describe, expect, it } from 'vitest';
import {
	canSetAccess,
	compactionBound,
	entryAccessFor,
	groupByMonth,
	holdsControl,
	isEntryDate,
	type PartnerAccess,
	type PartnershipForAccess,
	shouldCutVersion,
	VERSION_IDLE_MS,
	VERSION_MAX_INTERVAL_MS
} from './notebook';

/** The notebook's rules, without a database. See docs/notebook.md, "Access". */

const ada = 'ada';
const bo = 'bo';
const stranger = 'cy';

function partnership(control: PartnershipForAccess['control']): PartnershipForAccess {
	return { control, inviterId: ada, inviteeId: bo };
}

function shared(partnerAccess: PartnerAccess, setBy: string | null = null) {
	return { scope: 'partnership' as const, partnerAccess, accessSetByUserId: setBy };
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

describe('canSetAccess', () => {
	it('is for whoever holds control', () => {
		expect(canSetAccess(shared('edit'), ada, partnership('inviter'))).toBe(true);
		expect(canSetAccess(shared('edit'), bo, partnership('inviter'))).toBe(false);
		expect(canSetAccess(shared('edit'), bo, partnership('invitee'))).toBe(true);
		expect(canSetAccess(shared('edit'), ada, partnership('both'))).toBe(true);
		expect(canSetAccess(shared('edit'), bo, partnership('both'))).toBe(true);
	});

	it('is never for someone outside the partnership', () => {
		expect(canSetAccess(shared('edit'), stranger, partnership('both'))).toBe(false);
	});

	/** With control shared, either may restrict, and the other may not undo it. */
	it('does not let a member lift a restriction set against them by someone still in control', () => {
		expect(canSetAccess(shared('hidden', ada), bo, partnership('both'))).toBe(false);
		expect(canSetAccess(shared('read', ada), bo, partnership('both'))).toBe(false);
		expect(canSetAccess(shared('hidden', ada), ada, partnership('both'))).toBe(true);
	});

	/** Handing control over must never lock its new holder out of their own notebook. */
	it('lets the member now holding control lift a restriction once its setter has lost it', () => {
		expect(canSetAccess(shared('hidden', ada), bo, partnership('invitee'))).toBe(true);
		expect(canSetAccess(shared('hidden', ada), ada, partnership('invitee'))).toBe(false);
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
