import { render, screen } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { testNamesSource } from '$lib/testing/names';

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

const { default: UnreadMessagesWidget } = await import('./UnreadMessagesWidget.svelte');

const jun = {
	partnershipId: 'p1',
	names: testNamesSource('p1', { partnerName: 'Jun' }),
	image: null,
	unreadThreads: 2,
	newestAt: new Date('2026-09-13T12:00:00Z')
};

describe('UnreadMessagesWidget', () => {
	it('renders nothing at all when nothing is waiting', () => {
		const { container } = render(UnreadMessagesWidget, { unread: [] });

		// Not an empty card: Today is read at a glance, and a permanent
		// "Messages — nothing" card is noise on every visit.
		expect(container.querySelector('wa-card')).not.toBeInTheDocument();
	});

	it('heads the card with plain text, the rows carrying the links', () => {
		render(UnreadMessagesWidget, { unread: [jun] });

		expect(screen.getByRole('heading', { level: 2, name: 'Messages' })).toBeInTheDocument();
		// The only link in the card is the row's, to the board, which it opens
		// in that partner's context.
		const links = screen.getAllByRole('link');
		expect(links).toHaveLength(1);
		expect(links[0]).toHaveAttribute('href', '/(auth-required)/(app)/messages');
		// It switches the context first, so a preload would fetch the board in
		// the old one.
		expect(links[0]).toHaveAttribute('data-sveltekit-preload-data', 'off');
	});

	it('names each row for its partner and count, distinctly from the nav tab', () => {
		render(UnreadMessagesWidget, { unread: [jun] });

		expect(screen.getByRole('link', { name: /2 new messages from Jun/ })).toBeInTheDocument();
	});
});
