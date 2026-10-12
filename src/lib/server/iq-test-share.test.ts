import { describe, expect, it } from 'vitest';
import { type SharedResult, signSharedResult, verifySharedResult } from './iq-test-share';

const SECRET = 'a'.repeat(43);

const result: SharedResult = {
	role: 'sub',
	intensity: 4,
	vibe: 'gooner',
	iq: 61,
	correct: 4,
	attempted: 14,
	skipped: 3,
	humiliating: true,
	themedLook: true,
	soberIq: 124,
	targetIq: 70,
	createdAt: new Date('2026-10-11T08:30:00Z')
};

describe('shared result tokens', () => {
	it('carry a result there and back, in a short opaque string', async () => {
		const token = await signSharedResult(SECRET, result);
		expect(token).toMatch(/^[A-Za-z0-9_-]{30,40}$/);
		expect(await verifySharedResult(SECRET, token)).toEqual(result);
	});

	it('carry a clinical run with no vibe and no optional numbers', async () => {
		const clinical = {
			...result,
			intensity: 0,
			vibe: null,
			soberIq: null,
			targetIq: null
		} as const;
		expect(await verifySharedResult(SECRET, await signSharedResult(SECRET, clinical))).toEqual(
			clinical
		);
	});

	it('carry whether the results humiliated and wore the vibe, each on its own', async () => {
		for (const [humiliating, themedLook] of [
			[false, false],
			[true, false],
			[false, true]
		] as const) {
			const shared = { ...result, humiliating, themedLook };
			expect(await verifySharedResult(SECRET, await signSharedResult(SECRET, shared))).toEqual(
				shared
			);
		}
	});

	it('refuse a token with any character changed', async () => {
		const token = await signSharedResult(SECRET, result);
		for (let i = 0; i < token.length; i += 1) {
			const swapped = ['A', 'B'].find((letter) => letter !== token.charAt(i));
			const edited = `${token.slice(0, i)}${swapped}${token.slice(i + 1)}`;
			expect(await verifySharedResult(SECRET, edited)).toBeNull();
		}
	});

	it('refuse one signed by another deployment, and anything that is not a token', async () => {
		const token = await signSharedResult(SECRET, result);
		expect(await verifySharedResult('b'.repeat(43), token)).toBeNull();
		for (const garbage of ['', 'not a token', '%%%', 'abc', token.slice(0, -2)]) {
			expect(await verifySharedResult(SECRET, garbage)).toBeNull();
		}
	});
});
