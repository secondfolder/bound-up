import { render, screen } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testNamesSource } from '$lib/testing/names';
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

const pageState = {
	data: {
		user: {
			id: 'u1',
			name: 'Ada',
			email: 'ada@example.com',
			image: null,
			timezone: 'Europe/London'
		}
	}
};

vi.mock('$app/state', () => ({
	get page() {
		return pageState;
	}
}));

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const { default: Page } = await import('./+page.svelte');

function data(timezone: string | null): PageData {
	return {
		// Layout data the page itself never reads, but `PageData` includes — so
		// the cast below stays a narrowing rather than a lie.
		user: {
			id: 'u1',
			name: 'Ada',
			email: 'ada@example.com',
			image: null,
			timezone: 'Europe/London'
		},
		partners: [],
		helpRequests: [],
		features: [],
		isAdmin: false,
		pushAvailable: false,
		debug: false,
		contextSpaces: [],
		context: { kind: 'all' },
		// The cards are exercised on their own and through the load; here they
		// only need to be present, because the page renders them unconditionally
		// and a missing prop would fail for the wrong reason.
		messages: { unreadThreads: 0, totalThreads: 0, newestAt: null },
		tasks: { viewerActs: true, ready: [], readyCount: 0, waitingCount: 0, activeCount: 0 },
		rewards: {
			viewerActs: true,
			balances: [{ id: 'p1', label: null, credits: 0 }],
			claimable: [],
			claimableCount: 0,
			activeCount: 0
		},
		notebook: [],
		partner: {
			id: 'p1',
			// Sealed, and opened by record id by the mocks above: a component
			// test has no vault of its own.
			names: testNamesSource('p1', {
				partnerName: 'Jun',
				yourName: 'Ada',
				partnerRole: 'sub',
				yourRole: 'dom'
			}),
			image: null,
			timezone,
			canEdit: true
		}
	} as PageData;
}

describe('/partner/[id]/+page.svelte', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("shows the partner role as the current user's name plus role", async () => {
		render(Page, { data: data('America/New_York') });
		// The names are sealed, so they show once they have opened.
		await vi.waitFor(() => expect(screen.getByText("Ada's sub")).toBeInTheDocument());
		expect(screen.queryByText(/dom \/ sub|sub \/ dom/)).not.toBeInTheDocument();
	});

	it('shows partner local time when their timezone differs from the viewer', () => {
		render(Page, { data: data('America/New_York') });

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

	it('shows the date before the time when their local day differs from the viewer', () => {
		vi.setSystemTime(new Date('2026-01-15T23:30:00Z'));
		render(Page, { data: data('Asia/Tokyo') });

		const dateText = new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeZone: 'Asia/Tokyo'
		}).format(new Date('2026-01-15T23:30:00Z'));
		const timeText = new Intl.DateTimeFormat(undefined, {
			timeStyle: 'short',
			timeZone: 'Asia/Tokyo'
		}).format(new Date('2026-01-15T23:30:00Z'));

		expect(
			screen.getByText(
				new RegExp(
					`${dateText.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')} ${timeText.replace(':', '\\:')} Tokyo time \\(9 hours ahead of you\\)`
				)
			)
		).toBeInTheDocument();
	});

	it('hides partner local time when both accounts share the same timezone', () => {
		render(Page, { data: data('Europe/London') });
		expect(screen.queryByText(/time - /)).not.toBeInTheDocument();
	});
});
