import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const { default: MessageToasts } = await import('./MessageToasts.svelte');

/**
 * The notice a thread page shows for another thread's new message. Real
 * `wa-toast` elements, so the items upgrade, show and remove themselves as
 * they do in the app.
 */

function renderToasts() {
	return render(MessageToasts, { partnershipId: 'p-1', partnerName: 'Sam <b>' }).component as {
		show: (threadId: string) => void;
		dismiss: (threadId: string) => void;
	};
}

describe('MessageToasts', () => {
	it('names the partner and links where a notification’s tap goes', async () => {
		renderToasts().show('t-1');

		const link = await screen.findByTestId('message-toast');
		// Text, never HTML: the name is whatever somebody typed.
		expect(link).toHaveTextContent('New message from Sam <b>');
		expect(link.getAttribute('href')).toMatch(/\/partner\/p-1\/messages\?thread=t-1$/);
	});

	/** Two would be same-named links going to different threads. */
	it('shows one notice at a time, the newest replacing the last', async () => {
		const toasts = renderToasts();
		toasts.show('t-1');
		toasts.show('t-2');

		await vi.waitFor(() => expect(screen.getAllByTestId('message-toast')).toHaveLength(1));
		expect(screen.getByTestId('message-toast').getAttribute('href')).toMatch(/thread=t-2$/);
	});

	it('takes a thread’s notice away, and leaves another thread’s alone', async () => {
		const toasts = renderToasts();
		toasts.show('t-1');
		await screen.findByTestId('message-toast');

		toasts.dismiss('t-other');
		expect(screen.getByTestId('message-toast')).toBeInTheDocument();

		toasts.dismiss('t-1');
		await vi.waitFor(() => expect(screen.queryByTestId('message-toast')).not.toBeInTheDocument());
	});
});
