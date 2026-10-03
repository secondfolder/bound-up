import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { waSettled } from '$lib/testing/web-awesome';
import DismissibleHint from './DismissibleHint.svelte';

/** The rules every hint shares. Each hint's own test covers who it is for. */
const KEY = 'bound-up:test-hint-dismissed';
const body = createRawSnippet(() => ({ render: () => '<span>How to do it.</span>' }));

function hint(shouldShow: () => boolean) {
	return render(DismissibleHint, {
		dismissedKey: KEY,
		shouldShow,
		title: 'A suggestion',
		testid: 'test-hint',
		children: body
	});
}

beforeEach(() => {
	localStorage.removeItem(KEY);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('DismissibleHint', () => {
	it('shows its title and body on a device it is for', async () => {
		hint(() => true);
		await vi.waitFor(() => expect(screen.getByTestId('test-hint')).toBeInTheDocument());
		expect(screen.getByText('A suggestion')).toBeInTheDocument();
		expect(screen.getByText('How to do it.')).toBeInTheDocument();
	});

	it('says nothing on a device it is not for', async () => {
		hint(() => false);
		await new Promise((settle) => setTimeout(settle, 20));
		expect(screen.queryByTestId('test-hint')).not.toBeInTheDocument();
	});

	it('stays gone once dismissed, without asking again', async () => {
		const { container, unmount } = hint(() => true);
		await vi.waitFor(() => expect(screen.getByTestId('test-hint')).toBeInTheDocument());
		await waSettled(container);
		(container.querySelector('wa-button') as HTMLElement).click();
		await vi.waitFor(() => expect(screen.queryByTestId('test-hint')).not.toBeInTheDocument());
		unmount();

		const shouldShow = vi.fn(() => true);
		hint(shouldShow);
		await new Promise((settle) => setTimeout(settle, 20));
		expect(screen.queryByTestId('test-hint')).not.toBeInTheDocument();
		expect(shouldShow).not.toHaveBeenCalled();
	});

	/** A private window can refuse storage outright; the hint still works, it just will not stick. */
	it('still shows when storage throws', async () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError');
		});
		hint(() => true);
		await vi.waitFor(() => expect(screen.getByTestId('test-hint')).toBeInTheDocument());
	});
});
