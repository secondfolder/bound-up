import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { testPartnershipRewardView } from '$lib/testing/item-views';
import { testNamesSource, testPartnerView } from '$lib/testing/names';
import { waByProp, waSettled } from '$lib/testing/web-awesome';
import type { LayoutData as PageData } from './$types';

// Titles and names are sealed; these open them by record id (sealed-refs.ts).
vi.mock('$lib/crypto/sealed', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/crypto/sealed')>()),
	openRecord: (await import('$lib/testing/sealed-refs')).openTestRecord
}));
vi.mock('$lib/crypto/vaults.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/crypto/vaults.svelte')>()),
	vaultById: (id: string) => ({ id })
}));

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));
/** The list is the route's layout, which reads an action's answer from `page`. */
vi.mock('$app/state', () => ({ page: { form: null, data: {} } }));

const { default: Layout } = await import('./+layout.svelte');

/** The list, with no sheet open over it: its child route renders nothing. */
function renderList(props: { data: PageData }) {
	return render(Layout, {
		...props,
		children: createRawSnippet(() => ({ render: () => '<span></span>' }))
	});
}

const fromJun = testPartnershipRewardView({ title: 'Tea', cost: 2, createdByMe: false });
const forJun = testPartnershipRewardView({
	title: 'Breakfast in bed',
	cost: 9,
	createdByMe: true,
	canClaim: false
});

function data({
	canManageRewards = true,
	canClaimRewards = true,
	rewards = [fromJun, forJun]
}: {
	canManageRewards?: boolean;
	canClaimRewards?: boolean;
	rewards?: PageData['rewards'];
} = {}): PageData {
	return {
		user: { id: 'u1', name: 'Ada', email: 'ada@example.com', image: null, timezone: 'UTC' },
		partners: [testPartnerView('p1', 'Jun')],
		helpRequests: [],
		features: [],
		isAdmin: false,
		pushAvailable: false,
		debug: false,
		contextSpaces: [],
		context: { kind: 'all' },
		partner: {
			id: 'p1',
			names: testNamesSource('p1', { partnerName: 'Jun' }),
			canManageRewards,
			canClaimRewards
		},
		counterpartUserId: canManageRewards ? 'u2' : null,
		viewerCredits: 4,
		counterpartCredits: canManageRewards ? 1 : null,
		rewards,
		claims: []
	} as PageData;
}

describe('/partner/[id]/rewards/+page.svelte', () => {
	it('always offers the claim history', async () => {
		const { container } = renderList({ data: data({ canManageRewards: false }) });
		await waSettled(container);
		expect(waByProp(container, 'wa-icon', 'label', 'Claim history')).toHaveLength(1);
	});

	it("shows the managing side Jun's balance, editable, and how close Jun is", async () => {
		const { container } = renderList({
			data: data({ canClaimRewards: false, rewards: [forJun] })
		});
		await waSettled(container);
		expect(container.querySelector('[role="tablist"]')).toBeNull();
		expect(container.querySelector('.balances')).toHaveTextContent('Jun 1');
		expect(container.querySelector('.balances')).not.toHaveTextContent('Yours');
		expect(waByProp(container, 'wa-icon', 'label', "Edit Jun's reward credits")).toHaveLength(1);
		expect(container).toHaveTextContent('Jun is saving up');
		expect(container).toHaveTextContent('Jun needs 8 more');
		expect(waByProp(container, 'wa-icon', 'label', 'Add a reward')).toHaveLength(1);
	});

	it('shows the claiming side their own balance and no way to add', async () => {
		const { container } = renderList({
			data: data({ canManageRewards: false, rewards: [fromJun] })
		});
		await waSettled(container);
		expect(container.querySelector('.balances')).toHaveTextContent('Yours 4');
		expect(container).toHaveTextContent('Within reach');
		expect(waByProp(container, 'wa-icon', 'label', 'Add a reward')).toHaveLength(0);
		// The page is titled "Rewards"; its one wallet does not say it again.
		expect(container.querySelectorAll('h2, .panel')).toHaveLength(0);
	});

	it('splits shared control into a tab for each of you', async () => {
		const { container } = renderList({ data: data() });
		await waSettled(container);
		const tabs = Array.from(container.querySelectorAll('[role="tab"]')).map((tab) =>
			tab.textContent?.replace(/\s+/g, ' ').trim()
		);
		expect(tabs).toEqual(['For you 1', 'For Jun 1']);
		const [mine, theirs] = Array.from(container.querySelectorAll('[role="tabpanel"]'));
		// The first is shown, the other kept but hidden.
		expect(mine).not.toHaveAttribute('hidden');
		expect(theirs).toHaveAttribute('hidden');
		// Both balances, over both tabs.
		expect(container.querySelector('.balances')).toHaveTextContent('Yours 4 Jun 1');
		expect(mine).toHaveTextContent('Tea');
		expect(theirs).toHaveTextContent('Breakfast in bed');
	});
});
