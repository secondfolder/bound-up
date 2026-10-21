import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { waButtonOfType, waProp, waSettled } from '$lib/testing/web-awesome';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));
vi.mock('$app/navigation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/navigation')>()),
	goto: vi.fn(),
	invalidateAll: vi.fn()
}));

const { default: Page } = await import('./+page.svelte');

/** The native control inside a `wa-input`, which is what real typing reaches. */
function innerInput(container: HTMLElement, selector: string): HTMLInputElement {
	const input = container.querySelector(selector)?.shadowRoot?.querySelector('input');
	if (!(input instanceof HTMLInputElement)) {
		throw new Error(`missing the input inside ${selector}`);
	}
	return input;
}

describe('/login/recover', () => {
	it('keeps "Ask my partner" outlined until the request could be sent', async () => {
		const { container } = render(Page);
		await waSettled(container);
		const ask = waButtonOfType(container, 'submit');
		const email = innerInput(container, 'wa-input[data-field="recoverEmail"]');
		const password = innerInput(container, 'wa-input[data-field="newPassword"]');
		const confirm = innerInput(container, 'wa-input[data-field="confirmPassword"]');

		expect(waProp(ask, 'appearance')).toBe('outlined');

		await userEvent.type(password, 'correct-horse-battery');
		await userEvent.type(confirm, 'correct-horse-battery');
		// Everything but an email.
		await waitFor(() => expect(waProp(ask, 'appearance')).toBe('outlined'));

		await userEvent.type(email, 'ada@example.com');
		await waitFor(() => expect(waProp(ask, 'appearance')).toBe('accent'));

		await userEvent.type(confirm, '!');
		await waitFor(() => expect(waProp(ask, 'appearance')).toBe('outlined'));
	});
});
