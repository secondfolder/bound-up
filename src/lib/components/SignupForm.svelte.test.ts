import { render, waitFor } from '@testing-library/svelte';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { signupFormSchema } from '$lib/schemas/signupForm';
import { waButtonOfType, waProp, waSettled } from '$lib/testing/web-awesome';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

const { default: SignupForm } = await import('./SignupForm.svelte');

/** The native control inside a `wa-input`, which is what real typing reaches. */
function innerInput(container: HTMLElement, selector: string): HTMLInputElement {
	const input = container.querySelector(selector)?.shadowRoot?.querySelector('input');
	if (!(input instanceof HTMLInputElement)) {
		throw new Error(`missing the input inside ${selector}`);
	}
	return input;
}

describe('SignupForm', () => {
	it('keeps Sign up outlined until every check it makes before posting would pass', async () => {
		const data = await superValidate(zod4(signupFormSchema));
		const { container } = render(SignupForm, { data });
		await waSettled(container);
		const signUp = waButtonOfType(container, 'submit');
		const name = innerInput(container, 'wa-input[name="name"]');
		const email = innerInput(container, 'wa-input[name="email"]');
		const password = innerInput(container, 'wa-input[data-field="password"]');
		const confirm = innerInput(container, 'wa-input[data-field="passwordConfirm"]');

		expect(waProp(signUp, 'appearance')).toBe('outlined');

		await userEvent.type(name, 'Ada');
		await userEvent.type(email, 'ada@example.com');
		await userEvent.type(password, 'correct-horse-battery');
		// Everything but a matching confirmation.
		await userEvent.type(confirm, 'correct-horse');
		await waitFor(() => expect(waProp(signUp, 'appearance')).toBe('outlined'));

		await userEvent.type(confirm, '-battery');
		await waitFor(() => expect(waProp(signUp, 'appearance')).toBe('accent'));

		// A password too weak to be accepted, even matched.
		await userEvent.clear(password);
		await userEvent.type(password, 'short');
		await userEvent.clear(confirm);
		await userEvent.type(confirm, 'short');
		await waitFor(() => expect(waProp(signUp, 'appearance')).toBe('outlined'));
	});

	it('marks no field as required, since every one is', async () => {
		const data = await superValidate(zod4(signupFormSchema));
		const { container } = render(SignupForm, { data });
		await waSettled(container);
		const box = container.querySelector('.auth-box');
		if (!box) {
			throw new Error('missing the box');
		}
		const marker = getComputedStyle(box).getPropertyValue('--wa-form-control-required-content');
		expect(marker.trim()).toMatch(/^(?:''|"")$/);
	});
});
