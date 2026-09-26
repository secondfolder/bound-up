import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';

const pageState = {
	data: {
		user: { id: 'u1', name: 'Ada', email: 'ada@example.com', image: null, timezone: 'UTC' },
		isAdmin: false
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
	return render(Page);
}

describe('/settings/+page.svelte', () => {
	it('renders the signed-in panel with the logout form inside it', () => {
		const { container } = renderPage();

		expect(screen.getByText('Signed in as')).toBeInTheDocument();
		expect(screen.getByText('Ada')).toBeInTheDocument();
		expect(screen.getByText('ada@example.com')).toBeInTheDocument();

		const panel = container.querySelector('.account');
		expect(panel).not.toBeNull();
		expect(panel?.querySelector('form[action="/logout"]')).not.toBeNull();
		expect(container.querySelectorAll('form')).toHaveLength(1);
		expect(panel?.textContent).toContain('Log out');
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
});
