import { render, waitFor } from '@testing-library/svelte';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { loginFormSchema } from '$lib/schemas/loginForm';
import { waButtonOfType, waProp, waSettled } from '$lib/testing/web-awesome';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));
// The real module kept underneath: superforms imports `afterNavigate` and
// friends from it too, and a browser refuses to link a missing named import.
vi.mock('$app/navigation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/navigation')>()),
	goto: vi.fn(),
	invalidateAll: vi.fn()
}));

const { default: LoginForm } = await import('./LoginForm.svelte');

/** The native control inside a `wa-input`, which is what real typing reaches. */
function innerInput(container: HTMLElement, selector: string): HTMLInputElement {
	const input = container.querySelector(selector)?.shadowRoot?.querySelector('input');
	if (!(input instanceof HTMLInputElement)) {
		throw new Error(`missing the input inside ${selector}`);
	}
	return input;
}

describe('LoginForm', () => {
	it('keeps Login outlined until the email is valid and a password is typed', async () => {
		const data = await superValidate(zod4(loginFormSchema));
		const { container } = render(LoginForm, { data });
		await waSettled(container);
		const login = waButtonOfType(container, 'submit');
		const email = innerInput(container, 'wa-input[name="email"]');
		const password = innerInput(container, 'wa-input[data-field="password"]');

		expect(waProp(login, 'appearance')).toBe('outlined');

		await userEvent.type(email, 'ada@example');
		await userEvent.type(password, 'hunter2');
		// A password but an email the schema refuses: still nothing to sign in with.
		await waitFor(() => expect(waProp(login, 'appearance')).toBe('outlined'));

		await userEvent.type(email, '.com');
		await waitFor(() => expect(waProp(login, 'appearance')).toBe('filled'));

		await userEvent.clear(password);
		await waitFor(() => expect(waProp(login, 'appearance')).toBe('outlined'));
	});
});
