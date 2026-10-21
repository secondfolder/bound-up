import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import type { PageData } from './$types';

const pageState = {
	data: {
		user: { id: 'u1', name: 'Ada', email: 'ada@example.com', image: null, timezone: 'UTC' },
		isAdmin: false,
		features: [] as string[],
		debug: false
	}
};

vi.mock('$app/state', () => ({
	get page() {
		return pageState;
	}
}));

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const { default: Page } = await import('./+page.svelte');

function renderPage() {
	return render(Page, { data: { appVersion: '1.2.3' } as PageData });
}

describe('/settings/+page.svelte', () => {
	it('renders the signed-in panel, and the logout form after the list', () => {
		const { container } = renderPage();

		expect(screen.getByText('Signed in as')).toBeInTheDocument();
		expect(screen.getByText('Ada')).toBeInTheDocument();
		expect(screen.getByText('ada@example.com')).toBeInTheDocument();

		const panel = container.querySelector('.account');
		expect(panel).not.toBeNull();
		expect(panel?.querySelector('form')).toBeNull();

		// The last thing before the version: a settings screen ends with it.
		const signOut = container.querySelector('form.sign-out');
		expect(signOut).toHaveAttribute('action', '/logout');
		expect(signOut?.textContent).toContain('Log out');
		expect(container.querySelectorAll('form')).toHaveLength(1);
		expect(container.querySelector('ul')?.compareDocumentPosition(signOut as Node)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING
		);
		expect(signOut?.nextElementSibling).toBe(screen.getByText('Version 1.2.3'));
	});

	it('always shows the account, security, and partners links', () => {
		renderPage();

		expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute(
			'href',
			'/(auth-required)/(app)/settings/account'
		);
		expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute(
			'href',
			'/(auth-required)/(app)/settings/security'
		);
		expect(screen.getByRole('link', { name: 'Partners' })).toHaveAttribute(
			'href',
			'/(auth-required)/(app)/settings/partners'
		);
	});

	it('links to the admin pages only for an admin', () => {
		const { unmount } = renderPage();
		expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
		unmount();

		pageState.data.isAdmin = true;
		try {
			renderPage();
			expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute(
				'href',
				'/(auth-required)/(app)/admin'
			);
		} finally {
			pageState.data.isAdmin = false;
		}
	});

	/**
	 * There is nothing to set up or unlock any more — signing in is what unlocks
	 * — so the page that used to live here is gone, and so is its link.
	 */
	it('has no encrypted-messages settings', () => {
		renderPage();
		expect(screen.queryByRole('link', { name: 'Encrypted messages' })).not.toBeInTheDocument();
	});

	it('shows the version the app is running at the bottom', () => {
		const { container } = renderPage();
		const version = screen.getByText('Version 1.2.3');
		expect(container.querySelector('section')?.lastElementChild).toBe(version);
	});

	it('offers the debug mode switch only to an account holding it', () => {
		const { unmount } = renderPage();
		expect(screen.queryByText('Debug mode on this device')).not.toBeInTheDocument();
		unmount();

		pageState.data.features = ['debugMode'];
		try {
			const { container } = renderPage();
			expect(screen.getByText('Debug mode on this device')).toBeInTheDocument();
			expect(container.querySelector('form[action="?/debug"] input[name="on"]')).toHaveValue(
				'true'
			);
			// Off on this device: no panel yet.
			expect(screen.queryByRole('region', { name: 'Debug info' })).not.toBeInTheDocument();
		} finally {
			pageState.data.features = [];
		}
	});

	it('shows the debug info panel while debug mode is on', () => {
		pageState.data.features = ['debugMode'];
		pageState.data.debug = true;
		try {
			renderPage();
			const panel = screen.getByRole('region', { name: 'Debug info' });
			expect(panel).toHaveTextContent('u1');
			expect(panel).toHaveTextContent('1.2.3');
		} finally {
			pageState.data.features = [];
			pageState.data.debug = false;
		}
	});
});
