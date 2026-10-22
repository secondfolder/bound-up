import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { testPartnershipTaskView } from '$lib/testing/item-views';
import { legacyNamesSource, testPartnerView } from '$lib/testing/names';
import { waByProp, waSettled } from '$lib/testing/web-awesome';
import type { LayoutData as PageData } from './$types';

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

function data({
	canManageTasks = true,
	canCompleteTasks = true,
	tasks = []
}: {
	canManageTasks?: boolean;
	canCompleteTasks?: boolean;
	tasks?: PageData['tasks'];
} = {}): PageData {
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
		partner: {
			id: 'p1',
			names: legacyNamesSource('p1', { partnerName: 'Jun' }),
			canManageTasks,
			canCompleteTasks,
			counterpartUserId: 'u2',
			counterpartTimezone: 'America/New_York'
		},
		tasks,
		completions: [],
		viewerCredits: 4,
		counterpartCredits: 1
	} as PageData;
}

const fromJun = testPartnershipTaskView({ id: 'task-1', title: 'From Jun', createdByMe: false });
const forJun = testPartnershipTaskView({
	id: 'task-2',
	title: 'For Jun',
	createdByMe: true,
	canManage: true,
	canComplete: false
});

function addButton(container: HTMLElement) {
	return container.querySelector('wa-button.add');
}

describe('/partner/[id]/tasks/+page.svelte', () => {
	it('lists the tasks you set, to watch rather than tick, with a way to add one', async () => {
		const { container } = renderList({
			data: data({ canManageTasks: true, canCompleteTasks: false, tasks: [forJun] })
		});
		await waSettled(container);
		expect(container.querySelector('[role="tablist"]')).toBeNull();
		// No heading for the list: the page says whose it is.
		expect(container.querySelector('section[aria-label="Tasks set for Jun"] h3')).toBeNull();
		// Nothing to tick in a list of tasks this side set.
		expect(container.querySelector('.item-row .leading')).toBeNull();
		// Both balances these tasks touch would show under shared control; here,
		// only Jun's, which this side sets.
		expect(container.querySelector('.balances')).toHaveTextContent('Jun 1');
		expect(container.querySelector('.balances')).not.toHaveTextContent('Yours');
		expect(container.querySelector('button.tick')).toBeNull();
		expect(addButton(container)?.getAttribute('href')).toMatch(/partner\/p1\/tasks\/add$/);
		expect(waByProp(container, 'wa-icon', 'label', 'Completion history')).toHaveLength(1);
	});

	it('lists what Jun set for you as a to-do list, with no way to add one', async () => {
		const { container } = renderList({
			data: data({ canManageTasks: false, canCompleteTasks: true, tasks: [fromJun] })
		});
		await waSettled(container);
		expect(container.querySelector('[role="tablist"]')).toBeNull();
		expect(container).toHaveTextContent('Ready');
		expect(container.querySelector('button.tick')).toHaveAccessibleName('Complete From Jun');
		expect(addButton(container)).toBeNull();
		// No panels and no section titles of their own: the groups are the list's.
		expect(container.querySelectorAll('.panel, h2')).toHaveLength(0);
	});

	it('splits shared control into a tab for each of you', async () => {
		const { container } = renderList({
			data: data({ canManageTasks: true, canCompleteTasks: true, tasks: [fromJun, forJun] })
		});
		await waSettled(container);
		const tabs = Array.from(container.querySelectorAll('[role="tab"]')).map((tab) =>
			tab.textContent?.replace(/\s+/g, ' ').trim()
		);
		// This side sets tasks, so the tasks it set come first, and are shown.
		expect(tabs).toEqual(['For Jun 1', 'For you 1']);
		const [theirs, mine] = Array.from(container.querySelectorAll('[role="tabpanel"]'));
		expect(theirs).not.toHaveAttribute('hidden');
		expect(mine).toHaveAttribute('hidden');
		expect(mine).toHaveTextContent('From Jun');
		expect(mine).not.toHaveTextContent('For Jun');
		expect(mine?.querySelector('button.tick')).not.toBeNull();
		expect(theirs).toHaveTextContent('For Jun');
		expect(theirs?.querySelector('.item-row .leading')).toBeNull();
		expect(addButton(container)).not.toBeNull();
	});

	it('says when either side has nothing yet', async () => {
		const { container } = renderList({ data: data() });
		await waSettled(container);
		expect(container).toHaveTextContent('Jun has not set you any tasks yet.');
		expect(container).toHaveTextContent('You have not set Jun any tasks yet.');
	});
});
