import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { testPartnershipTaskView, testSelfTaskView } from '$lib/testing/item-views';
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
	selfTasks: PageData['selfTasks']['tasks'] = [],
	partnerTasks: PageData['partnerTasks'] = []
): PageData {
	return {
		user: {
			id: 'u1',
			name: 'Ada',
			email: 'ada@example.com',
			image: null,
			timezone: 'Europe/London'
		},
		partners: [testPartnerView('p1', 'Jun')],
		helpRequests: [],
		features: [],
		isAdmin: false,
		pushAvailable: false,
		debug: false,
		selfTasks: { tasks: selfTasks, completions: [], credits: 12 },
		partnerTasks
	} as PageData;
}

const junSection = (tasks: PageData['partnerTasks'][number]['tasks']) => ({
	partnershipId: 'p1',
	names: testNamesSource('p1', { partnerName: 'Jun' }),
	image: null,
	tasks,
	credits: 4
});

describe('/home/tasks/+page.svelte', () => {
	it('offers adding a task and the history, with nothing yet to do', async () => {
		const { container, getByRole } = renderList({ data: data() });
		await waSettled(container);
		expect(getByRole('link', { name: 'Add a task' })).toHaveAttribute(
			'href',
			expect.stringMatching(/home\/tasks\/add$/)
		);
		expect(waByProp(container, 'wa-icon', 'label', 'Completion history')).toHaveLength(1);
		expect(container).toHaveTextContent('Nothing to do yet.');
	});

	it("merges a partner's tasks into your own list, named by whose they are", async () => {
		const { container } = renderList({
			data: data(
				[testSelfTaskView({ title: 'Stretch' })],
				[junSection([testPartnershipTaskView({ title: 'Make tea' })])]
			)
		});
		await waSettled(container);
		const ready = container.querySelector('.item-group');
		expect(ready).toHaveTextContent('Ready');
		expect(ready?.querySelectorAll('li')).toHaveLength(2);
		// Marked by Jun's picture, named for a screen reader.
		expect(waProp(ready?.querySelector('wa-avatar.who'), 'label')).toBe('Jun');
		// One list: no panel per partner, and no "Open full task list" on the page.
		expect(container.querySelectorAll('.panel')).toHaveLength(0);
		expect(container).not.toHaveTextContent('Open full task list');
	});

	it('groups what can be done now, what opens later, and what is inactive', async () => {
		const { container } = renderList({
			data: data([
				testSelfTaskView({ title: 'Now' }),
				testSelfTaskView({
					title: 'Soon',
					canComplete: false,
					nextEligibleAt: new Date(Date.now() + 2 * 60 * 60 * 1000)
				}),
				testSelfTaskView({ title: 'Off', active: false, canComplete: false })
			])
		});
		await waSettled(container);
		const groups = Array.from(container.querySelectorAll('.item-group'));
		expect(groups.map((group) => group.querySelector('h3, .summary')?.textContent?.trim())).toEqual(
			['Ready1', 'Later1', 'Inactive1']
		);
		expect(groups[2]?.tagName).toBe('WA-DETAILS');
	});

	it("shows each balance the tasks pay into, a partner's with their picture", async () => {
		const { container } = renderList({
			data: data([], [junSection([testPartnershipTaskView({ title: 'Make tea' })])])
		});
		await waSettled(container);
		const balances = Array.from(container.querySelectorAll('.balances li'));
		expect(balances.map((balance) => balance.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'Yours 12',
			'With Jun 4'
		]);
		expect(balances[0]?.querySelector('wa-avatar')).toBeNull();
		expect(waProp(balances[1]?.querySelector('wa-avatar'), 'label')).toBe('Jun');
	});
});
