import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { userEvent } from 'vitest/browser';
import { waProp, waSettled } from '$lib/testing/web-awesome';

/**
 * The page reads the fragment from `$app/state` to pick the drawer's item,
 * and closes it through `goto` — both mocked, so the test is about what the
 * page decides from the URL rather than about the router.
 */
const pageState = {
	url: new URL('http://localhost/roadmap'),
	data: { user: null as { id: string } | null }
};

vi.mock('$app/state', () => ({
	get page() {
		return pageState;
	}
}));
vi.mock('$app/paths', () => import('$lib/testing/app-paths'));
const goto = vi.fn();
vi.mock('$app/navigation', () => ({ goto }));

const { default: Page } = await import('./+page.svelte');

beforeEach(() => {
	pageState.url = new URL('http://localhost/roadmap');
	pageState.data.user = null;
	goto.mockClear();
});

describe('/roadmap', () => {
	it('has no drawer without a fragment', () => {
		const { container } = render(Page);
		expect(container.querySelector('wa-drawer')).toBeNull();
	});

	it('opens the drawer on the item the fragment names', async () => {
		pageState.url = new URL('http://localhost/roadmap#kink-list');
		const { container } = render(Page);
		const drawer = container.ownerDocument.querySelector('wa-drawer');
		expect(drawer).not.toBeNull();
		await waSettled(container.ownerDocument.body);
		expect(waProp(drawer, 'label')).toBe('Kink list');
		// Both directions of the prerequisite trail.
		expect(screen.getByRole('link', { name: 'End-to-end encryption everywhere' })).toHaveAttribute(
			'href',
			'#expand-encryption'
		);
		expect(screen.getByRole('link', { name: 'Compare kink lists' })).toBeInTheDocument();
	});

	it('ignores a fragment that is not an item', () => {
		pageState.url = new URL('http://localhost/roadmap#notebook');
		const { container } = render(Page);
		expect(container.ownerDocument.querySelector('wa-drawer')).toBeNull();
	});

	it('the legend toggles a status off and on, dimming its nodes', async () => {
		const { container } = render(Page);
		const planned = screen.getByRole('button', { name: /^Planned/ });
		expect(planned).toHaveAttribute('aria-pressed', 'true');

		await userEvent.click(planned);
		expect(planned).toHaveAttribute('aria-pressed', 'false');
		expect(container.querySelector('a[id="kink-list"]')).toHaveClass('dimmed');
		expect(container.querySelector('a[id="edging"]')).not.toHaveClass('dimmed');

		await userEvent.click(planned);
		expect(planned).toHaveAttribute('aria-pressed', 'true');
		expect(container.querySelector('a[id="kink-list"]')).not.toHaveClass('dimmed');
	});

	it('offers sign-up only when signed out', () => {
		render(Page);
		expect(screen.getByRole('link', { name: 'Sign up to Bound Up' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Back to Bound Up' })).toBeInTheDocument();
	});

	it('does not offer sign-up to someone signed in', () => {
		pageState.data.user = { id: 'u-ada' };
		render(Page);
		expect(screen.queryByRole('link', { name: 'Sign up to Bound Up' })).not.toBeInTheDocument();
	});
});
