import { describe, expect, it } from 'vitest';
import { managersFromControl, someoneElseManages } from './spaces';

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
