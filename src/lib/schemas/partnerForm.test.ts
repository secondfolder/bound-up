import { describe, expect, it } from 'vitest';
import { partnershipNamesKind } from '$lib/sealed-kinds/partnerships';
import { partnerInviteFormSchema } from './partnerForm';

const valid = {
	partnerName: 'Ada',
	yourName: 'Jun',
	partnerRole: 'trainer',
	yourRole: 'trainee',
	control: 'mix'
};

describe('partnerInviteFormSchema', () => {
	it('accepts the happy path', () => {
		expect(partnerInviteFormSchema.parse(valid)).toEqual(valid);
	});

	it('leaves names as typed, for the sealed kind to trim', () => {
		// Trimming in the form schema deleted each space as it was typed, because
		// superforms writes the parsed value back into the form (see the schema).
		const parsed = partnerInviteFormSchema.parse({ ...valid, partnerName: 'Mistress ' });
		expect(parsed.partnerName).toBe('Mistress ');
		const sealed = partnershipNamesKind.latest.parse({
			inviterName: '  Ada  ',
			inviteeName: 'Jun',
			inviterRole: ' trainer ',
			inviteeRole: null
		});
		expect(sealed).toMatchObject({ inviterName: 'Ada', inviterRole: 'trainer' });
	});

	it('rejects a name that is only whitespace', () => {
		expect(partnerInviteFormSchema.safeParse({ ...valid, yourName: '   ' }).success).toBe(false);
	});

	it('rejects a name long enough to break the nav', () => {
		expect(
			partnerInviteFormSchema.safeParse({ ...valid, partnerName: 'a'.repeat(61) }).success
		).toBe(false);
		expect(
			partnerInviteFormSchema.safeParse({ ...valid, partnerName: 'a'.repeat(60) }).success
		).toBe(true);
	});

	it('normalises an empty role to null rather than an empty string', () => {
		expect(partnerInviteFormSchema.parse({ ...valid, partnerRole: '' }).partnerRole).toBeNull();
		expect(partnerInviteFormSchema.parse({ ...valid, yourRole: '  ' }).yourRole).toBeNull();
	});

	it('allows each role to be omitted entirely', () => {
		const { partnerRole: _partnerRole, yourRole: _yourRole, ...withoutRoles } = valid;
		const parsed = partnerInviteFormSchema.parse(withoutRoles);
		expect(parsed.partnerRole).toBeNull();
		expect(parsed.yourRole).toBeNull();
	});

	it('rejects an over-long role', () => {
		expect(
			partnerInviteFormSchema.safeParse({ ...valid, partnerRole: 'a'.repeat(41) }).success
		).toBe(false);
		expect(partnerInviteFormSchema.safeParse({ ...valid, yourRole: 'a'.repeat(41) }).success).toBe(
			false
		);
	});

	it('only accepts the three control answers', () => {
		for (const control of ['me', 'them', 'mix']) {
			expect(partnerInviteFormSchema.safeParse({ ...valid, control }).success).toBe(true);
		}
		// 'inviter' is the *stored* value, not an answer — accepting it here would
		// let a crafted post set control without going through controlFromAnswer.
		expect(partnerInviteFormSchema.safeParse({ ...valid, control: 'inviter' }).success).toBe(false);
		expect(partnerInviteFormSchema.safeParse({ ...valid, control: 'both' }).success).toBe(false);
	});
});
