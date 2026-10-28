import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { defined } from '$lib/testing/defined';
import { testPartnershipTaskView, testSelfTaskView } from '$lib/testing/item-views';
import { testNamesSource, testPartnerView } from '$lib/testing/names';
import { waSettled } from '$lib/testing/web-awesome';
import type { ContextSpaceView, ItemSpaceView, TasksListView } from '$lib/types';
import type { LayoutData } from './$types';

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
// superforms imports SvelteKit's own `invalidateAll`; the page's refreshes are `$lib/navigation`'s.
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
vi.mock('$lib/navigation', () => import('$lib/testing/navigation'));
/** The list is the route's layout, which reads an action's answer from `page`. */
vi.mock('$app/state', () => ({ page: { form: null, data: {} } }));

const { default: Layout } = await import('./+layout.svelte');

const solo: ContextSpaceView = { id: 'space-own', kind: 'solo', colour: 'me', names: null };
const shared: ContextSpaceView = {
	id: 'space-shared',
	kind: 'shared',
	colour: 'teal',
	names: testNamesSource('space-shared', { partnerName: 'Jun' })
};
const soloSpace: ItemSpaceView = {
	id: 'space-own',
	kind: 'solo',
	canManage: true,
	viewerActs: true,
	others: []
};
const sharedSpace: ItemSpaceView = {
	id: 'space-shared',
	kind: 'shared',
	canManage: true,
	viewerActs: true,
	others: [{ userId: 'u2', timezone: 'UTC' }]
};

function renderList(list: TasksListView) {
	const data = {
		user: { id: 'u1', name: 'Ada', email: 'ada@example.com', image: null, timezone: 'UTC' },
		partners: [testPartnerView('space-shared', 'Jun')],
		helpRequests: [],
		features: [],
		isAdmin: false,
		pushAvailable: false,
		debug: false,
		contextSpaces: [solo, shared],
		context: { kind: 'all' },
		list
	} as unknown as LayoutData;
	return render(Layout, {
		data,
		children: createRawSnippet(() => ({ render: () => '<span></span>' }))
	});
}

const own = testSelfTaskView({ id: 'own', title: 'Stretch' });
const fromJun = testPartnershipTaskView({ id: 'from-jun', title: 'Make tea' });
const forJun = testPartnershipTaskView({
	id: 'for-jun',
	title: 'Water plants',
	createdByMe: true,
	canManage: true,
	canComplete: false,
	assigneeUserId: 'u2'
});

describe('/tasks', () => {
	it('shows only a to-do list in Me, with no chips and no set-for-others', async () => {
		const { container } = renderList({
			spaces: [soloSpace],
			toDo: [own],
			setForOthers: [],
			balances: [{ spaceId: 'space-own', userId: 'u1', mine: true, credits: 3, canSet: true }]
		});
		await waSettled(container);
		expect(container.querySelector('h2#to-do')).toHaveTextContent('To do');
		expect(container.querySelector('h2#set-for-others')).toBeNull();
		expect(container.querySelector('.chip')).toBeNull();
		// One space: its balance is in the chip itself.
		expect(container.querySelector('.credits-chip')).toHaveTextContent('You 3');
		expect(
			container.querySelector('nav[aria-label="Tasks and rewards"] [aria-current="page"]')
		).toHaveTextContent('Tasks');
		expect(container.querySelector('h1')).toHaveTextContent('Tasks & Rewards');
		// No back link: the page is one of the bottom nav's.
		expect(container.querySelector('a[aria-label="Back to Today"]')).toBeNull();
		// One place a task can go, so the add button adds there, with no fan.
		const add = container.querySelector('.add-button button');
		expect(add).toHaveAccessibleName('Add a task');
		expect(add).not.toHaveAttribute('aria-expanded');
		expect(container.querySelector('a[href$="/tasks/history"]')).toHaveTextContent(
			'Completed tasks'
		);
	});

	it('shows both lists in Everyone, each row saying whose space it is in', async () => {
		const { container } = renderList({
			spaces: [soloSpace, sharedSpace],
			toDo: [own, { ...fromJun, spaceId: 'space-shared' }],
			setForOthers: [{ ...forJun, spaceId: 'space-shared' }],
			balances: [
				{ spaceId: 'space-own', userId: 'u1', mine: true, credits: 3, canSet: true },
				{ spaceId: 'space-shared', userId: 'u1', mine: true, credits: 1, canSet: false },
				{ spaceId: 'space-shared', userId: 'u2', mine: false, credits: 5, canSet: true }
			]
		});
		await waSettled(container);
		expect(container.querySelector('h2#set-for-others')).toHaveTextContent('Set for others');
		const chips = [...container.querySelectorAll('.chip')].map((chip) => chip.textContent?.trim());
		expect(chips).toEqual(['Me', 'Jun', 'Jun']);
		// Only the ones set for her can be ticked.
		expect(container.querySelectorAll('button.tick')).toHaveLength(2);
		// Several spaces: the chip is only the coins and an arrow, and every
		// balance is in its sheet, a row per space, kept apart, never added up.
		const credits = defined(
			container.querySelector<HTMLElement>('.credits-chip'),
			'the credits chip'
		);
		expect(credits).toHaveAccessibleName('Credits');
		expect(credits.textContent?.trim()).toBe('');
		credits.click();
		await vi.waitFor(() =>
			expect(container.ownerDocument.querySelectorAll('.groups li')).toHaveLength(2)
		);
		const rows = [...container.ownerDocument.querySelectorAll('.groups li')].map((row) =>
			row.textContent?.replace(/\s+/g, ' ').trim()
		);
		expect(rows[0]).toMatch(/Me You 3$/);
		expect(rows[1]).toMatch(/Jun You 1 Jun 5$/);
		// Two places a task can go: the add button asks whose, with a fan.
		expect(container.querySelector('.add-button button')).toHaveAttribute('aria-expanded', 'false');
	});

	it('offers no way to add where the viewer sets nothing', async () => {
		const { container } = renderList({
			spaces: [{ ...sharedSpace, canManage: false }],
			toDo: [{ ...fromJun, spaceId: 'space-shared' }],
			setForOthers: [],
			balances: []
		});
		await waSettled(container);
		expect(container.querySelector('.add-button')).toBeNull();
	});
});
