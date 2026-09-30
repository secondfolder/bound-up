import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';

/**
 * `$app/state` is a live store fed by the router and `resolve()` needs the
 * generated route manifest — neither exists in a bare component render. Both
 * are mocked (the AppNav test's shape) so the test is about what the landing
 * decides, not about SvelteKit.
 */
const pageState = {
	data: { user: null as { id: string } | null },
	// ShareMeta resolves its image against it.
	url: new URL('http://localhost/')
};

vi.mock('$app/state', () => ({
	get page() {
		return pageState;
	}
}));
vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const { default: Page } = await import('./+page.svelte');

describe('/+page.svelte', () => {
	it('should render h1', () => {
		render(Page);
		expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
	});

	it('logged out: a signup CTA plus a small log-in link', () => {
		pageState.data.user = null;
		render(Page);

		// The big link is named "Sign up for Bound Up" — see the aria-label
		// comment on the page.
		expect(screen.getByRole('link', { name: 'Sign up for Bound Up' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument();
	});

	it('logged in: the CTA becomes Open and points at the app', () => {
		pageState.data.user = { id: 'u-ada' };
		render(Page);

		expect(screen.getByRole('link', { name: 'Open' })).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
	});

	it('shows the feature overview, then the roadmap teaser', () => {
		pageState.data.user = null;
		render(Page);
		const features = screen.getByRole('heading', { level: 2, name: 'Features' });
		const comingUp = screen.getByRole('heading', { level: 2, name: 'Coming Up' });
		expect(features.compareDocumentPosition(comingUp)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	});

	it('shows the roadmap teaser, linking to the full roadmap', () => {
		pageState.data.user = null;
		render(Page);
		expect(screen.getByRole('heading', { level: 2, name: 'Coming Up' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'See the full roadmap' })).toHaveAttribute(
			'href',
			'/(public)/roadmap'
		);
	});
});
