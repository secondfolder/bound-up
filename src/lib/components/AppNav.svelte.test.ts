import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { waSettled } from '$lib/testing/web-awesome';

/**
 * `$app/state` is a live store fed by the router, and `resolve()` needs the
 * generated route manifest — neither exists in a bare component render. Both
 * are mocked so the test is about what the nav decides, not about SvelteKit.
 */
const pageState = {
	route: { id: '/(auth-required)/(app)/today' },
	params: {} as Record<string, string>
};

vi.mock('$app/state', () => ({
	get page() {
		return pageState;
	}
}));
vi.mock('$app/paths', () => import('$lib/testing/app-paths'));
vi.mock('$lib/navigation', () => import('$lib/testing/navigation'));

const { default: AppNav } = await import('./AppNav.svelte');

function renderNav(routeId: string, params: Record<string, string> = {}) {
	pageState.route.id = routeId;
	pageState.params = params;
	return render(AppNav, {});
}

/** The labels of the tabs that are lit: one, or none. */
function lit(): string[] {
	return screen
		.getAllByRole('link')
		.filter((link) => link.getAttribute('aria-current') === 'page')
		.map((link) => link.textContent?.trim() ?? '');
}

describe('AppNav', () => {
	it('has exactly the five places, in order, and no tab per partner', () => {
		renderNav('/(auth-required)/(app)/today');
		const labels = screen.getAllByRole('link').map((link) => link.textContent?.trim());
		expect(labels).toEqual(['Today', 'Tasks', 'Notebook', 'Messages', 'Settings']);
	});

	it('links each tab to its place', () => {
		renderNav('/(auth-required)/(app)/today');
		const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
		expect(hrefs).toEqual([
			'/(auth-required)/(app)/today',
			'/(auth-required)/(app)/tasks',
			'/(auth-required)/(app)/notebook',
			'/(auth-required)/(app)/messages',
			'/(auth-required)/(app)/settings'
		]);
	});

	it.each([
		['/(auth-required)/(app)/today', 'Today'],
		// Reached from Today's cards, with no tab of their own.
		['/(auth-required)/(app)/guides/[id]', 'Today'],
		['/(auth-required)/(app)/daydreams/[id]', 'Today'],
		['/(auth-required)/(app)/playroom/kink-list/partner/[partnershipId]', 'Today'],
		['/(auth-required)/(app)/tasks', 'Tasks'],
		['/(auth-required)/(app)/tasks/[taskId]', 'Tasks'],
		// Rewards are a tab inside Tasks.
		['/(auth-required)/(app)/rewards', 'Tasks'],
		['/(auth-required)/(app)/rewards/history', 'Tasks'],
		['/(auth-required)/(app)/notebook', 'Notebook'],
		['/(auth-required)/(app)/notebook/[entryId]', 'Notebook'],
		['/(auth-required)/(app)/messages', 'Messages'],
		['/(auth-required)/(app)/messages/[threadId]', 'Messages'],
		['/(auth-required)/(app)/settings', 'Settings'],
		['/(auth-required)/(app)/settings/partners/[id]', 'Settings'],
		// Reached from Settings, likewise.
		['/(auth-required)/(app)/admin/users/[id]', 'Settings'],
		['/(auth-required)/(app)/debug/prompts', 'Settings']
	])('lights the right tab on %s', (routeId, tab) => {
		renderNav(routeId, { id: 'x' });
		expect(lit()).toEqual([tab]);
	});

	it('bunches the tabs in the middle, at least 1em apart', async () => {
		const { container } = renderNav('/(auth-required)/(app)/today');
		await waSettled(container);
		const nav = container.querySelector('nav');
		const links = screen.getAllByRole('link');
		const navBox = nav?.getBoundingClientRect();
		const first = links[0]?.getBoundingClientRect();
		const last = links.at(-1)?.getBoundingClientRect();
		if (!(navBox && first && last)) {
			throw new Error('The nav and its tabs should have rendered');
		}
		// Centred: as much room to the left of the first tab as to the right
		// of the last, give or take a pixel of rounding.
		expect(Math.abs(first.left - navBox.left - (navBox.right - last.right))).toBeLessThanOrEqual(1);
		const fontSize = Number.parseFloat(getComputedStyle(links[0] as Element).fontSize);
		for (const [index, link] of links.slice(1).entries()) {
			const previous = links[index]?.getBoundingClientRect();
			expect(link.getBoundingClientRect().left - (previous?.right ?? 0)).toBeGreaterThanOrEqual(
				fontSize - 0.5
			);
		}
	});

	it('has no debug toggle for an account without debug mode', () => {
		renderNav('/(auth-required)/(app)/today');
		expect(screen.queryByRole('button', { name: 'Debug mode' })).not.toBeInTheDocument();
	});

	it('offers the debug toggle, hidden until hovered while off and shown while on', () => {
		pageState.route.id = '/(auth-required)/(app)/today';
		const off = render(AppNav, { debugAvailable: true, debugOn: false });
		const toggle = screen.getByRole('button', { name: 'Debug mode' });
		expect(toggle).toHaveAttribute('aria-pressed', 'false');
		expect(getComputedStyle(toggle).opacity).toBe('0');
		// Turning it on is what the hidden field asks for.
		expect(off.container.querySelector('input[name="on"]')).toHaveValue('true');
		off.unmount();

		const on = render(AppNav, { debugAvailable: true, debugOn: true });
		const shown = screen.getByRole('button', { name: 'Debug mode' });
		expect(shown).toHaveAttribute('aria-pressed', 'true');
		expect(getComputedStyle(shown).opacity).toBe('1');
		expect(on.container.querySelector('input[name="on"]')).toHaveValue('false');
		expect(on.container.querySelector('form')).toHaveAttribute(
			'action',
			'/(auth-required)/(app)/settings?/debug'
		);
	});
});
