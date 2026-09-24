import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { HOME_SCREEN_HINT_DISMISSED_KEY } from '$lib/home-screen';
import { waSettled } from '$lib/testing/web-awesome';
import HomeScreenHint from './HomeScreenHint.svelte';

const IPHONE =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

function onIphone() {
	vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE);
	vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(5);
}

beforeEach(() => {
	localStorage.removeItem(HOME_SCREEN_HINT_DISMISSED_KEY);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('HomeScreenHint', () => {
	it('suggests the Home Screen on an iPhone', async () => {
		onIphone();
		render(HomeScreenHint);
		await vi.waitFor(() =>
			expect(
				screen.getByText('Add to Home Screen to stay signed in for longer')
			).toBeInTheDocument()
		);
	});

	it('says nothing on a desktop browser', async () => {
		render(HomeScreenHint);
		await new Promise((settle) => setTimeout(settle, 20));
		expect(screen.queryByTestId('home-screen-hint')).not.toBeInTheDocument();
	});

	it('stays gone once dismissed', async () => {
		onIphone();
		const { container, unmount } = render(HomeScreenHint);
		await vi.waitFor(() => expect(screen.getByTestId('home-screen-hint')).toBeInTheDocument());
		await waSettled(container);
		(container.querySelector('wa-button') as HTMLElement).click();
		await vi.waitFor(() =>
			expect(screen.queryByTestId('home-screen-hint')).not.toBeInTheDocument()
		);
		unmount();

		render(HomeScreenHint);
		await new Promise((settle) => setTimeout(settle, 20));
		expect(screen.queryByTestId('home-screen-hint')).not.toBeInTheDocument();
	});

	/** A private window can refuse storage outright; the hint still works, it just will not stick. */
	it('still shows when storage throws', async () => {
		onIphone();
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError');
		});
		render(HomeScreenHint);
		await vi.waitFor(() => expect(screen.getByTestId('home-screen-hint')).toBeInTheDocument());
	});

	it('shows the iOS share icon, named for assistive tech', async () => {
		onIphone();
		render(HomeScreenHint);
		await vi.waitFor(() => expect(screen.getByRole('img', { name: 'Share' })).toBeInTheDocument());
		expect(screen.getByText(/, then “Add to Home Screen”/)).toBeInTheDocument();
	});
});
