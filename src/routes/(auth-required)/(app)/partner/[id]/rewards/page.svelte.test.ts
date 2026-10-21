import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { legacyNamesSource, testPartnerView } from '$lib/testing/names';
import type { PageData } from './$types';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const { default: Page } = await import('./+page.svelte');

function data(claimCount: number, claimable = true): PageData {
	return {
		user: { id: 'u1', name: 'Ada', email: 'ada@example.com', image: null, timezone: 'UTC' },
		partners: [testPartnerView('p1', 'Jun')],
		helpRequests: [],
		features: [],
		isAdmin: false,
		pushAvailable: false,
		debug: false,
		partner: {
			id: 'p1',
			names: legacyNamesSource('p1', { partnerName: 'Jun' }),
			canManageRewards: true,
			canClaimRewards: claimable
		},
		counterpartUserId: 'u2',
		viewerCredits: 4,
		counterpartCredits: 1,
		rewards: [
			{
				id: 'r1',
				title: 'Tea',
				description: 'Fresh pot first',
				cost: 2,
				active: true,
				createdByMe: false,
				canClaim: claimable,
				sealed: null,
				revision: 0,
				createdAt: new Date(),
				updatedAt: new Date()
			}
		],
		claims: Array.from({ length: claimCount }, (_, index) => ({
			id: `c${index}`,
			rewardTitle: 'Tea',
			rewardDescription: null,
			rewardCost: 2,
			mine: false,
			createdByMe: false,
			sealed: null,
			createdAt: new Date()
		}))
	};
}

describe('/partner/[id]/rewards/+page.svelte', () => {
	it('always offers claim history, as the tasks page does', () => {
		const { container } = render(Page, { data: data(0) });
		const buttons = Array.from(container.querySelectorAll('wa-button')).map((node) =>
			node.textContent?.trim()
		);
		expect(buttons).toContain('Claim history');
	});

	it('hides claim-side credits and claim controls for the controller-only view', () => {
		const { container } = render(Page, { data: data(0, false) });
		expect(container.querySelector('.title-row')?.textContent).toContain("Jun's credits:");
		expect(container.querySelector('.title-row')?.textContent).toContain('1');
		expect(container.querySelector('.claim-form')).toBeNull();
		expect(container.textContent).not.toContain('more credits to go');
		expect(container.querySelector('.secondary-credit-row')).toBeNull();
	});

	it('puts the only list straight on the page, not in a panel, with no heading of its own', () => {
		const { container } = render(Page, { data: data(0) });
		expect(container.querySelector('.panel')).toBeNull();
		expect(container.querySelectorAll('h2')).toHaveLength(0);
	});

	it('shows the claimant their own balance beside the list', () => {
		const { container } = render(Page, { data: data(0) });
		expect(container.querySelector('.title-row')?.textContent).toContain('Your credits:');
		expect(container.querySelector('.title-row')?.textContent).toContain('4');
	});
});
