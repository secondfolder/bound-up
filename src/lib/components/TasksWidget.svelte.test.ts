import { render, screen } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { testNamesSource } from '$lib/testing/names';
import { testSealedRef } from '$lib/testing/sealed-refs';
import { waProp } from '$lib/testing/web-awesome';
import type { RewardsWidgetView, TasksWidgetView } from '$lib/types';
import RewardsWidget from './RewardsWidget.svelte';
import TasksWidget from './TasksWidget.svelte';

// Titles and names are sealed; these open them by record id (sealed-refs.ts).
vi.mock('$lib/crypto/sealed', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/crypto/sealed')>()),
	openRecord: (await import('$lib/testing/sealed-refs')).openTestRecord
}));
vi.mock('$lib/crypto/vaults.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/crypto/vaults.svelte')>()),
	vaultById: (id: string) => ({ id })
}));

function tasks(overrides: Partial<TasksWidgetView> = {}): TasksWidgetView {
	return {
		viewerActs: true,
		ready: [],
		readyCount: 0,
		waitingCount: 0,
		activeCount: 0,
		...overrides
	};
}

function rewards(overrides: Partial<RewardsWidgetView> = {}): RewardsWidgetView {
	return {
		viewerActs: true,
		balances: [{ id: 'self', label: null, credits: 0 }],
		claimable: [],
		claimableCount: 0,
		activeCount: 0,
		...overrides
	};
}

describe('TasksWidget', () => {
	it('lists what is ready and counts what is hidden behind it', async () => {
		render(TasksWidget, {
			href: '/home/tasks',
			tasks: tasks({
				ready: [
					{
						id: 't1',
						title: '',
						kind: 'task',
						sealed: testSealedRef({ title: 'Morning stretches' }),
						note: '+2',
						context: null
					}
				],
				readyCount: 4,
				activeCount: 4
			})
		});

		expect(await screen.findByText('Morning stretches')).toBeInTheDocument();
		expect(screen.getByText('+2')).toBeInTheDocument();
		expect(screen.getByText('and 3 more ready')).toBeInTheDocument();
	});

	it('keeps whose a row is beside a title too long to fit, rather than inside its ellipsis', async () => {
		const { container } = render(TasksWidget, {
			href: '/home/tasks',
			tasks: tasks({
				ready: [
					{
						id: 't1',
						title: '',
						kind: 'task',
						sealed: testSealedRef({
							title: 'Write me a letter with a deliberately long title to see wrapping'
						}),
						note: '+2',
						context: testNamesSource('p1', { partnerName: 'Morgan' })
					}
				],
				readyCount: 1,
				activeCount: 1
			})
		});

		const context = container.querySelector('.context');
		await vi.waitFor(() => expect(context).toHaveTextContent('Morgan'));
		expect(context?.parentElement?.tagName).toBe('LI');
		expect(container.querySelector('.title .context')).toBeNull();
		// The note is credits, and says so.
		expect(waProp(container.querySelector('.note wa-icon'), 'label')).toBe('credits');
	});

	it('shows a placeholder, not an empty title, for a sealed row no vault has opened', () => {
		render(TasksWidget, {
			href: '/home/tasks',
			tasks: tasks({
				ready: [
					{
						id: 't1',
						// The server never has a sealed task's title.
						title: '',
						kind: 'task',
						sealed: {
							recordId: 't1',
							vaultId: 'v1',
							ciphertext: 'sb1.sealed',
							payloadVersion: 1
						},
						note: '+2',
						context: null
					}
				],
				readyCount: 1,
				activeCount: 1
			})
		});

		expect(screen.getByRole('listitem')).toHaveTextContent('…');
		expect(screen.getByText('+2')).toBeInTheDocument();
	});

	it('says what is waiting when nothing is ready, rather than that nothing is', () => {
		render(TasksWidget, {
			href: '/home/tasks',
			tasks: tasks({ waitingCount: 2, activeCount: 2 })
		});

		// A waiting count is not an empty state: it says the tasks exist and are
		// not due, which an absent list does not say.
		expect(screen.getByText('2 waiting on a schedule')).toBeInTheDocument();
	});

	it('renders no body at all when there is nothing to say', () => {
		const { container } = render(TasksWidget, { href: '/home/tasks', tasks: tasks() });

		// The header still stands; the body is gone, collapsed by the class
		// SectionWidget puts on the card. "Nothing to do right now." told a
		// reader only what the missing list already had.
		expect(screen.getByRole('heading', { level: 2, name: 'Tasks' })).toBeInTheDocument();
		expect(container.querySelector('wa-card')).toHaveClass('bodyless');
		expect(container.querySelector('wa-card')?.textContent?.trim()).toBe('Tasks');
	});

	it('shows the managing side a count instead of somebody else’s to-do list', () => {
		render(TasksWidget, {
			href: '/partner/p1/tasks',
			tasks: tasks({ viewerActs: false, activeCount: 1 })
		});

		expect(screen.getByText(/1\s+active task you manage/)).toBeInTheDocument();
		expect(screen.queryByRole('list')).not.toBeInTheDocument();
	});
});

describe('RewardsWidget', () => {
	it('leads with the balance the costs beside it are read against', async () => {
		render(RewardsWidget, {
			href: '/home/rewards',
			rewards: rewards({
				balances: [{ id: 'self', label: null, credits: 12 }],
				claimable: [
					{
						id: 'r1',
						title: '',
						kind: 'reward',
						sealed: testSealedRef({ title: 'Long bath' }),
						note: '5',
						context: null
					}
				],
				claimableCount: 3,
				activeCount: 5
			})
		});

		expect(screen.getByText('12')).toBeInTheDocument();
		expect(screen.getByText('12').parentElement).toHaveTextContent('12 credits');
		expect(await screen.findByText('Long bath')).toBeInTheDocument();
		// Counts only the ones it did not have room for, never the ones the
		// balance does not cover.
		expect(screen.getByText('and 2 more you can claim')).toBeInTheDocument();
		expect(screen.queryByText(/out of reach/)).not.toBeInTheDocument();
	});

	it('renders no body at all on a fresh account with no rewards and no credits', () => {
		const { container } = render(RewardsWidget, {
			href: '/home/rewards',
			rewards: rewards({ activeCount: 0 })
		});

		expect(container.querySelector('wa-card')).toHaveClass('bodyless');
		expect(container.querySelector('wa-card')?.textContent?.trim()).toBe('Rewards');
	});

	it('says nothing at all about rewards the balance does not cover', () => {
		const { container } = render(RewardsWidget, {
			href: '/home/rewards',
			rewards: rewards({
				balances: [{ id: 'self', label: null, credits: 0 }],
				activeCount: 3
			})
		});

		// Three rewards exist and none can be claimed. Naming them would be a
		// reminder of what you are short of, not an offer — so the card is a
		// header alone, and the zero balance goes with them.
		expect(container.querySelector('wa-card')).toHaveClass('bodyless');
		expect(container.querySelector('wa-card')?.textContent?.trim()).toBe('Rewards');
	});

	it('shows the managing side a count instead of a claim list', () => {
		render(RewardsWidget, {
			href: '/partner/p1/rewards',
			rewards: rewards({ viewerActs: false, activeCount: 2 })
		});

		expect(screen.getByText(/2\s+active rewards you manage/)).toBeInTheDocument();
	});
});
