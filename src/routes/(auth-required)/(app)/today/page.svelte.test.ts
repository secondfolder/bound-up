import { render, screen } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testNamesSource } from '$lib/testing/names';
import type { ContextSpaceView } from '$lib/types';
import type { PageData } from './$types';

// Titles and names are sealed; these open them by record id (sealed-refs.ts).
vi.mock('$lib/crypto/sealed', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/crypto/sealed')>()),
	openRecord: (await import('$lib/testing/sealed-refs')).openTestRecord
}));
vi.mock('$lib/crypto/vaults.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/crypto/vaults.svelte')>()),
	vaultById: (id: string) => ({ id })
}));

const viewer = {
	id: 'u1',
	name: 'Ada',
	email: 'ada@example.com',
	image: null,
	timezone: 'Europe/London'
};
const pageState = { data: { user: viewer } };

vi.mock('$app/state', () => ({
	get page() {
		return pageState;
	}
}));
vi.mock('$app/paths', () => import('$lib/testing/app-paths'));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/navigation', () => import('$lib/testing/navigation'));

const { default: Page } = await import('./+page.svelte');

const SOLO = '11111111-1111-4111-8111-111111111111';
const JUN = '22222222-2222-4222-8222-222222222222';

const spaces: ContextSpaceView[] = [
	{ id: SOLO, kind: 'solo', colour: 'me', names: null },
	{
		id: JUN,
		kind: 'shared',
		colour: 'purple',
		names: testNamesSource(JUN, {
			partnerName: 'Jun',
			yourName: 'Ada',
			partnerRole: 'sub',
			yourRole: 'dom'
		})
	}
];

/** Layout data the page reads beside its own, so the cast stays a narrowing. */
const layout = {
	user: viewer,
	partners: [],
	helpRequests: [],
	features: [],
	isAdmin: false,
	pushAvailable: false,
	debug: false,
	contextSpaces: spaces
};

const noTasks = { viewerActs: true, ready: [], readyCount: 0, waitingCount: 0, activeCount: 0 };
const noRewards = (id: string) => ({
	viewerActs: true,
	balances: [{ id, label: null, credits: 0 }],
	claimable: [],
	claimableCount: 0,
	activeCount: 0
});

function partnership(timezone: string | null): PageData {
	return {
		...layout,
		context: { kind: 'space', spaceId: JUN },
		today: {
			kind: 'shared',
			partner: { id: JUN, names: spaces[1]?.names, timezone, canEdit: true },
			messages: { unreadThreads: 0, totalThreads: 0, newestAt: null },
			tasks: noTasks,
			rewards: noRewards(JUN),
			notebook: []
		}
	} as PageData;
}

function me(): PageData {
	return {
		...layout,
		context: { kind: 'space', spaceId: SOLO },
		today: {
			kind: 'solo',
			spaceId: SOLO,
			tasks: noTasks,
			rewards: noRewards(SOLO),
			notebook: [],
			latestIq: null,
			guides: null
		}
	} as PageData;
}

/** The cards' titles, in order. */
function cards(): string[] {
	return [...document.querySelectorAll('wa-card h2')].map((h) => h.textContent?.trim() ?? '');
}

describe('Today', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('is titled Today, with the context switcher at its corner', () => {
		render(Page, { data: me() });
		expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /^Showing Me/ })).toBeInTheDocument();
	});

	it('in Me, shows your own cards and no partner header', () => {
		render(Page, { data: me() });
		expect(cards()).toEqual(['Tasks', 'Rewards', 'Notebook', 'Playroom']);
		expect(screen.queryByText(/Connection settings|Edit this connection/)).not.toBeInTheDocument();
	});

	describe('in a partnership’s context', () => {
		it('heads the page with the partner, and links to the partnership’s settings', async () => {
			render(Page, { data: partnership('America/New_York') });
			await vi.waitFor(() =>
				expect(screen.getByRole('heading', { level: 2, name: 'Jun' })).toBeInTheDocument()
			);
			expect(screen.getByRole('link', { name: /Edit this connection/ })).toHaveAttribute(
				'href',
				`/(auth-required)/(app)/settings/partners/${JUN}`
			);
			expect(cards()).toEqual(['Messages', 'Tasks', 'Rewards', 'Notebook', 'Kink lists']);
		});

		it("shows the partner role as the current user's name plus role", async () => {
			render(Page, { data: partnership('America/New_York') });
			await vi.waitFor(() => expect(screen.getByText("Ada's sub")).toBeInTheDocument());
			expect(screen.queryByText(/dom \/ sub|sub \/ dom/)).not.toBeInTheDocument();
		});

		it('shows partner local time when their timezone differs from the viewer', () => {
			render(Page, { data: partnership('America/New_York') });
			const localTime = new Intl.DateTimeFormat(undefined, {
				timeStyle: 'short',
				timeZone: 'America/New_York'
			}).format(new Date('2026-01-15T12:00:00Z'));
			expect(
				screen.getByText(
					new RegExp(`${localTime.replace(':', '\\:')} New York time \\(5 hours behind you\\)`)
				)
			).toBeInTheDocument();
		});

		it('hides partner local time when both accounts share the same timezone', () => {
			render(Page, { data: partnership('Europe/London') });
			expect(screen.queryByText(/time \(/)).not.toBeInTheDocument();
		});
	});
});
