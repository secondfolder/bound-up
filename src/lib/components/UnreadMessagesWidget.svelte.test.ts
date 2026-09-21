import { render, screen } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { describe, expect, test, vi } from 'vitest';

vi.mock('$app/paths', () => ({
	resolve: (id: string, params?: Record<string, string>) =>
		params ? id.replace(/\[(\w+)\]/g, (_, key) => params[key]) : id
}));

const { default: UnreadMessagesWidget } = await import('./UnreadMessagesWidget.svelte');

const jun = {
	partnershipId: 'p1',
	name: 'Jun',
	image: null,
	unreadThreads: 2,
	newestAt: new Date('2026-09-13T12:00:00Z')
};

describe('UnreadMessagesWidget', () => {
	test('renders nothing at all when nothing is waiting', () => {
		const { container } = render(UnreadMessagesWidget, { unread: [] });

		// Not an empty card: /home is read at a glance, and a permanent
		// "Messages — nothing" card is noise on every visit.
		expect(container.querySelector('wa-card')).not.toBeInTheDocument();
	});

	test('heads the card with plain text, because there is no single messages page', () => {
		render(UnreadMessagesWidget, { unread: [jun] });

		expect(screen.getByRole('heading', { level: 2, name: 'Messages' })).toBeInTheDocument();
		// The only link in the card is the row's, which goes to one partner's
		// board. A header link would have nowhere to point.
		const links = screen.getAllByRole('link');
		expect(links).toHaveLength(1);
		expect(links[0]).toHaveAttribute('href', '/(auth-required)/(app)/partner/p1/messages');
	});

	test('names each row for its partner and count, distinctly from the nav tab', () => {
		render(UnreadMessagesWidget, { unread: [jun] });

		expect(screen.getByRole('link', { name: /2 new messages from Jun/ })).toBeInTheDocument();
	});
});
