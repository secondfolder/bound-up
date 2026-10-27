import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { defined } from '$lib/testing/defined';
import { testPartnershipRewardView, testSelfRewardView } from '$lib/testing/item-views';
import { testNamesSource, testPartnerView } from '$lib/testing/names';
import { waByProp, waProp, waSettled } from '$lib/testing/web-awesome';
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

function data(
	own: PageData['selfRewards']['rewards'] = [],
	theirs: PageData['partnerRewards'][number]['rewards'] | null = []
): PageData {
	return {
		user: { id: 'u1', name: 'Ada', email: 'ada@example.com', image: null, timezone: 'UTC' },
		partners: [testPartnerView('p1', 'Jun')],
		helpRequests: [],
		features: [],
		isAdmin: false,
		pushAvailable: false,
		debug: false,
		selfRewards: { credits: 10, rewards: own, claims: [] },
		partnerRewards:
			theirs === null
				? []
				: [
						{
							partnershipId: 'p1',
							names: testNamesSource('p1', { partnerName: 'Jun' }),
							image: null,
							credits: 4,
							rewards: theirs
						}
					]
	};
}

describe('/home/rewards/+page.svelte', () => {
	it('offers adding a reward and the claim history', async () => {
		const { container, getByRole } = renderList({ data: data() });
		await waSettled(container);
		expect(getByRole('link', { name: 'Add a reward' })).toBeInTheDocument();
		expect(waByProp(container, 'wa-icon', 'label', 'Claim history')).toHaveLength(1);
	});

	it('shows a wallet per balance, and each balance as a pill, as the tasks page does', async () => {
		const { container } = renderList({ data: data() });
		await waSettled(container);
		const wallets = Array.from(container.querySelectorAll('.wallet'));
		expect(wallets).toHaveLength(2);
		expect(wallets[0]?.querySelector('h2')).toHaveTextContent('Yours');
		expect(wallets[1]?.querySelector('h2')).toHaveTextContent('From Jun');
		const pills = Array.from(container.querySelectorAll('.balances li'));
		expect(pills.map((pill) => pill.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'Yours 10',
			'With Jun 4'
		]);
		// Your own you may set; Jun's is marked with Jun's picture.
		expect(
			waByProp(pills[0] as HTMLElement, 'wa-icon', 'label', 'Edit your reward credits')
		).toHaveLength(1);
		expect(waProp(pills[1]?.querySelector('wa-avatar'), 'label')).toBe('Jun');
	});

	it('leaves the one wallet untitled when there are no partners', async () => {
		const { container } = renderList({ data: data([], null) });
		await waSettled(container);
		expect(container.querySelectorAll('.wallet')).toHaveLength(1);
		expect(container.querySelector('.wallet h2')).toBeNull();
	});

	it('puts what the balance covers first, then what it is short of, with how far', async () => {
		const { container } = renderList({
			data: data([
				testSelfRewardView({ title: 'New book', cost: 18, canClaim: false }),
				testSelfRewardView({ title: 'Long bath', cost: 4 })
			])
		});
		await waSettled(container);
		const groups = Array.from(container.querySelectorAll('.self .item-group'));
		expect(groups.map((group) => group.querySelector('h3')?.textContent?.trim())).toEqual([
			'Within reach1',
			'Saving up1'
		]);
		expect(groups[0]).toHaveTextContent('Long bath');
		expect(groups[1]).toHaveTextContent('New book');
		expect(groups[1]).toHaveTextContent('8 more');
		expect(waProp(groups[1]?.querySelector('wa-progress-bar'), 'value')).toBe(55);
	});

	it('claims only from the opened reward, saying what will be left', async () => {
		const { container, unmount } = renderList({
			data: data([], [testPartnershipRewardView({ title: 'Tea service', cost: 3 })])
		});
		await waSettled(container);
		// Nothing on the row itself spends credits.
		expect(container.querySelector('.claim-form')).toBeNull();

		const body = defined(
			Array.from(container.querySelectorAll<HTMLButtonElement>('button.open')).find((button) =>
				button.textContent?.includes('Tea service')
			),
			'the Tea service row'
		);
		body.click();
		await tick();
		await waSettled(document.body);
		const dialog = defined(document.querySelector('wa-dialog'), 'the reward dialog');
		expect(dialog).toHaveTextContent('1 credit left');
		const form = defined(dialog.querySelector<HTMLFormElement>('.claim-form'), 'the claim form');
		expect(form.getAttribute('action')).toBe('?/partnerClaimReward');
		expect(new FormData(form).get('partnershipId')).toBe('p1');
		expect(form.querySelector('wa-button')).toHaveTextContent('Claim · 3 credits');
		unmount();
	});
});
