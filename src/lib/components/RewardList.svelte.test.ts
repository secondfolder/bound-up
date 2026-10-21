import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { defined } from '$lib/testing/defined';
import { waProp } from '$lib/testing/web-awesome';
import type { SelfRewardView } from '$lib/types';

const { default: RewardList } = await import('./RewardList.svelte');

function reward(overrides: Partial<SelfRewardView> = {}): SelfRewardView {
	const now = new Date('2026-10-01T10:00:00Z');
	return {
		id: 'r1',
		title: 'A night off',
		description: null,
		sealed: null,
		revision: 0,
		cost: 8,
		active: true,
		canClaim: false,
		createdAt: now,
		updatedAt: now,
		...overrides
	};
}

function claimButton(container: HTMLElement): Element {
	return defined(
		Array.from(container.querySelectorAll('.claim-form wa-button'))[0],
		'the claim button'
	);
}

describe('RewardList', () => {
	it('says how far short the balance is, not what the reward costs', () => {
		const { container } = render(RewardList, {
			rewards: [reward()],
			emptyMessage: 'None',
			claimAction: '?/claim',
			balance: 3
		});

		expect(screen.getByText('5 more credits to go')).toBeInTheDocument();
		expect(container.textContent).not.toContain('You need');
		const claim = claimButton(container);
		expect(waProp(claim, 'appearance')).toBe('outlined');
		expect(waProp(claim, 'disabled')).toBe(true);
	});

	it('makes an affordable claim the amber action, with nothing said beside it', () => {
		const { container } = render(RewardList, {
			rewards: [reward({ cost: 2, canClaim: true })],
			emptyMessage: 'None',
			claimAction: '?/claim',
			balance: 3
		});

		const claim = claimButton(container);
		expect(waProp(claim, 'appearance')).toBe('accent');
		expect(waProp(claim, 'variant')).toBe('brand');
		expect(waProp(claim, 'disabled')).toBe(false);
		expect(container.querySelector('.status')).toBeNull();
	});

	it('pluralises the cost', () => {
		render(RewardList, {
			rewards: [reward({ id: 'r1', cost: 1 }), reward({ id: 'r2', cost: 4 })],
			emptyMessage: 'None',
			claimAction: '?/claim'
		});

		expect(screen.getByText('1 credit')).toBeInTheDocument();
		expect(screen.getByText('4 credits')).toBeInTheDocument();
	});

	it('names each edit link by its reward, so a list of them is not all "Edit"', () => {
		const { container } = render(RewardList, {
			rewards: [reward()],
			emptyMessage: 'None',
			claimAction: '?/claim',
			editHref: (id: string) => `/rewards/${id}`
		});

		const edit = defined(container.querySelector('.actions > wa-button'), 'the edit button');
		expect(edit.textContent?.replace(/\s+/g, ' ').trim()).toBe('Edit A night off');
	});
});
