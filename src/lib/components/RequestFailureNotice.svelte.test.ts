import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import {
	dismissRequestFailure,
	NETWORK_FAILURE,
	reportRequestFailure,
	SERVER_FAILURE
} from '$lib/request-failure.svelte';
import { waSettled } from '$lib/testing/web-awesome';
import RequestFailureNotice from './RequestFailureNotice.svelte';

const navigation = vi.hoisted(() => ({ afterNavigate: vi.fn() }));
vi.mock('$app/navigation', () => navigation);

afterEach(() => {
	dismissRequestFailure();
	flushSync();
});

describe('RequestFailureNotice', () => {
	it('shows nothing until something fails', () => {
		render(RequestFailureNotice);
		expect(screen.queryByTestId('request-failure')).not.toBeInTheDocument();
	});

	it('announces a failure, and goes when dismissed', async () => {
		const { container } = render(RequestFailureNotice);
		reportRequestFailure(new Response(null, { status: 500 }));
		flushSync();

		const notice = screen.getByRole('alert');
		expect(notice).toHaveTextContent(SERVER_FAILURE);
		await waSettled(container);
		(container.querySelector('wa-button') as HTMLElement).click();
		await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
	});

	it('clears on navigation, since a failure belongs to its page', () => {
		render(RequestFailureNotice);
		reportRequestFailure(null);
		flushSync();
		const [clear] = navigation.afterNavigate.mock.lastCall ?? [];
		clear?.();
		flushSync();
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	/**
	 * The safety net. A rejection nobody handled is usually a request whose
	 * caller forgot it could fail, which is exactly the silent failure this
	 * exists to prevent.
	 */
	it('shows a rejection nothing handled', async () => {
		render(RequestFailureNotice);
		const event = new PromiseRejectionEvent('unhandledrejection', {
			promise: Promise.resolve(),
			reason: new TypeError('Failed to fetch')
		});
		dispatchEvent(event);
		await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(NETWORK_FAILURE));
	});
});
