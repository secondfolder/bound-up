import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { testPartnerView } from '$lib/testing/names';
import { waSettled } from '$lib/testing/web-awesome';
import type { PartnerView } from '$lib/types';

/**
 * `$app/state` is a live store fed by the router, and `resolve()` needs the
 * generated route manifest — neither exists in a bare component render. Both
 * are mocked so the test is about what the nav decides, not about SvelteKit.
 */
const pageState = {
	route: { id: '/(auth-required)/(app)/home' },
	params: {} as Record<string, string>
};

vi.mock('$app/state', () => ({
	get page() {
		return pageState;
	}
}));
vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const { default: AppNav } = await import('./AppNav.svelte');

const partners: PartnerView[] = [
	// Plaintext names, as a partnership from before sealing has: the only kind
	// that shows without an open vault, which a component test has none of.
	testPartnerView('p-ada', 'Ada'),
	testPartnerView('p-jun', 'Jun', '/jun.png')
];

function renderNav(routeId: string, params: Record<string, string> = {}) {
	pageState.route.id = routeId;
	pageState.params = params;
	return render(AppNav, { partners });
}

describe('AppNav', () => {
	it('renders one tab per partner, between Home and Settings', () => {
		renderNav('/(auth-required)/(app)/home');

		const labels = screen.getAllByRole('link').map((link) => link.textContent?.trim());
		expect(labels).toEqual(['Home', 'Ada', 'Jun', 'Settings']);
	});

	it('renders no partner tabs when there are none', () => {
		pageState.route.id = '/(auth-required)/(app)/home';
		render(AppNav, { partners: [] });
		expect(screen.getAllByRole('link')).toHaveLength(2);
	});

	it('links each tab by partnership id', () => {
		renderNav('/(auth-required)/(app)/home');
		expect(screen.getByRole('link', { name: /Ada/ })).toHaveAttribute(
			'href',
			'/(auth-required)/(app)/partner/p-ada'
		);
	});

	it('marks Home current on a child route, not just the index', () => {
		// Both tabs own child routes, which is why the check is a prefix match.
		renderNav('/(auth-required)/(app)/home/guides/[id]', { id: 'g1' });
		expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
	});

	it('marks Settings current inside the partners screens', () => {
		renderNav('/(auth-required)/(app)/settings/partners/[id]', { id: 'p-ada' });
		expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
		// The partner tab must NOT light up just because a partner id is in the
		// params — the settings screens are not the partner page.
		expect(screen.getByRole('link', { name: /Ada/ })).not.toHaveAttribute('aria-current');
	});

	it('marks only the partner whose page is open', () => {
		renderNav('/(auth-required)/(app)/partner/[id]', { id: 'p-jun' });
		expect(screen.getByRole('link', { name: /Jun/ })).toHaveAttribute('aria-current', 'page');
		expect(screen.getByRole('link', { name: /Ada/ })).not.toHaveAttribute('aria-current');
		expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
	});

	it('falls back to initials when a partner has no picture', async () => {
		const { container } = renderNav('/(auth-required)/(app)/home');
		await waSettled(container);
		const [ada, jun] = [...container.querySelectorAll('wa-avatar')];

		// What the avatar actually draws. An empty image="" would render as a
		// broken image, so for Ada the image is left off and the initials show.
		expect(ada.shadowRoot?.querySelector('img')).toBeNull();
		expect(ada.shadowRoot?.textContent).toContain('A');
		expect(jun.shadowRoot?.querySelector('img')?.getAttribute('src')).toBe('/jun.png');
	});

	it('bunches the tabs in the middle, at least 1em apart', async () => {
		const { container } = renderNav('/(auth-required)/(app)/home');
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
		renderNav('/(auth-required)/(app)/home');
		expect(screen.queryByRole('button', { name: 'Debug mode' })).not.toBeInTheDocument();
	});

	it('offers the debug toggle, hidden until hovered while off and shown while on', () => {
		pageState.route.id = '/(auth-required)/(app)/home';
		const off = render(AppNav, { partners, debugAvailable: true, debugOn: false });
		const toggle = screen.getByRole('button', { name: 'Debug mode' });
		expect(toggle).toHaveAttribute('aria-pressed', 'false');
		expect(getComputedStyle(toggle).opacity).toBe('0');
		// Turning it on is what the hidden field asks for.
		expect(off.container.querySelector('input[name="on"]')).toHaveValue('true');
		off.unmount();

		const on = render(AppNav, { partners, debugAvailable: true, debugOn: true });
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
