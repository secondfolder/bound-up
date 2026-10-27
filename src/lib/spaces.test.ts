import { describe, expect, it } from 'vitest';
import {
	actsOn,
	assigneeFor,
	canSetBalance,
	managersFromControl,
	managesRecord,
	managesSpace,
	type SpaceForRules,
	someoneElseManages,
	viewerActsIn
} from './spaces';

const roles = { inviterId: 'ada', inviteeId: 'jun' };

describe('managersFromControl', () => {
	it.each([
		['inviter', true, false],
		['invitee', false, true],
		['both', true, true]
	] as const)('gives %s control to the right members', (control, inviter, invitee) => {
		expect(managersFromControl(control, roles)).toEqual([
			{ userId: 'ada', canManage: inviter },
			{ userId: 'jun', canManage: invitee }
		]);
	});

	it('has only the inviter for a pending invite', () => {
		expect(managersFromControl('invitee', { inviterId: 'ada', inviteeId: null })).toEqual([
			{ userId: 'ada', canManage: false }
		]);
	});
});

describe('someoneElseManages', () => {
	const members = managersFromControl('inviter', roles);

	it('is true for the member who does not manage', () => {
		expect(someoneElseManages(members, 'jun')).toBe(true);
	});

	it('is false for the only manager, who sets rather than does', () => {
		expect(someoneElseManages(members, 'ada')).toBe(false);
	});

	it('is true for both when control is shared, with no assumption of two members', () => {
		const three = [...managersFromControl('both', roles), { userId: 'mo', canManage: false }];
		expect(someoneElseManages(three, 'ada')).toBe(true);
		expect(someoneElseManages(three, 'jun')).toBe(true);
		expect(someoneElseManages(three, 'mo')).toBe(true);
	});
});

describe('the task and reward rules, in members', () => {
	const shared = (control: 'inviter' | 'invitee' | 'both'): SpaceForRules => ({
		kind: 'shared',
		members: managersFromControl(control, roles)
	});
	const solo: SpaceForRules = { kind: 'solo', members: [{ userId: 'ada', canManage: true }] };

	it('sets a new one for its creator in their own space, and for the other member in a shared one', () => {
		expect(assigneeFor(solo, 'ada')).toBe('ada');
		expect(assigneeFor(shared('both'), 'ada')).toBe('jun');
		expect(assigneeFor(shared('both'), 'jun')).toBe('ada');
	});

	it('has nobody to set one for in a space with nobody else yet', () => {
		expect(
			assigneeFor({ kind: 'shared', members: [{ userId: 'ada', canManage: true }] }, 'ada')
		).toBeNull();
	});

	it('acts on the side someone else manages for', () => {
		expect(viewerActsIn(solo, 'ada')).toBe(true);
		expect(viewerActsIn(shared('inviter'), 'jun')).toBe(true);
		expect(viewerActsIn(shared('inviter'), 'ada')).toBe(false);
		expect(viewerActsIn(shared('both'), 'ada')).toBe(true);
		expect(viewerActsIn(shared('both'), 'mo')).toBe(false);
	});

	it('acts on a record only when it is theirs and they did not write it', () => {
		const forJun = { createdByUserId: 'ada', assigneeUserId: 'jun' };
		expect(actsOn(forJun, shared('both'), 'jun')).toBe(true);
		expect(actsOn(forJun, shared('both'), 'ada')).toBe(false);
		// A record wrongly assigned to its own creator still is not theirs to do.
		expect(actsOn({ createdByUserId: 'jun', assigneeUserId: 'jun' }, shared('both'), 'jun')).toBe(
			false
		);
		expect(actsOn({ createdByUserId: 'ada', assigneeUserId: 'ada' }, solo, 'ada')).toBe(true);
	});

	it('manages what is set for someone else, never what is set for them', () => {
		const forJun = { createdByUserId: 'ada', assigneeUserId: 'jun' };
		expect(managesSpace(shared('inviter'), 'ada')).toBe(true);
		expect(managesSpace(shared('inviter'), 'jun')).toBe(false);
		expect(managesRecord(forJun, shared('inviter'), 'ada')).toBe(true);
		expect(managesRecord(forJun, shared('both'), 'jun')).toBe(false);
		expect(managesRecord(forJun, shared('invitee'), 'ada')).toBe(false);
		expect(managesRecord({ createdByUserId: 'ada', assigneeUserId: 'ada' }, solo, 'ada')).toBe(
			true
		);
	});

	it('sets your own credits alone, and a partner’s only where you manage', () => {
		expect(canSetBalance(solo, 'ada', 'ada')).toBe(true);
		expect(canSetBalance(shared('inviter'), 'ada', 'jun')).toBe(true);
		expect(canSetBalance(shared('inviter'), 'ada', 'ada')).toBe(false);
		expect(canSetBalance(shared('inviter'), 'jun', 'ada')).toBe(false);
		expect(canSetBalance(shared('both'), 'jun', 'ada')).toBe(true);
		expect(canSetBalance(shared('both'), 'ada', 'mo')).toBe(false);
	});
});
