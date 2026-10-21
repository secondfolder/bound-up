import { render, waitFor } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { describe, expect, it, vi } from 'vitest';
import { changePasswordSchema } from '$lib/schemas/encryptionForms';
import { waButtonOfType, waProp, waSettled } from '$lib/testing/web-awesome';
import type { PageData } from './$types';

const pageState = {
	data: { user: { id: 'u1', name: 'Ada', email: 'ada@example.com' } }
};

vi.mock('$app/state', () => ({
	get page() {
		return pageState;
	}
}));

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

vi.mock('$app/navigation', () => ({
	// Unused by the assertions, but superforms imports it, and a real browser
	// refuses to link a module whose named import is missing.
	goto: vi.fn(),
	afterNavigate: vi.fn(),
	beforeNavigate: vi.fn(),
	invalidateAll: vi.fn().mockResolvedValue(undefined)
}));

const { default: Page } = await import('./+page.svelte');

async function data(): Promise<PageData> {
	return {
		bundle: { recipient: 'age1example', wraps: [] },
		passkeys: [],
		changeForm: await superValidate(zod4(changePasswordSchema))
	} as unknown as PageData;
}

/** The native control inside a `PasswordField`, which is what it reads. */
function passwordInput(container: HTMLElement, name: string): HTMLInputElement {
	const input = container
		.querySelector(`wa-input[data-field="${name}"]`)
		?.shadowRoot?.querySelector('input');
	if (!(input instanceof HTMLInputElement)) {
		throw new Error(`missing ${name} input`);
	}
	return input;
}

function type(input: HTMLInputElement, value: string) {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('/settings/security/+page.svelte', () => {
	it('keeps "Change password" outlined until the form could go through', async () => {
		const { container } = render(Page, { data: await data() });
		await waSettled(container);
		// The field attaches its listeners a task after the upgrade.
		await new Promise((resolve) => setTimeout(resolve));
		const change = waButtonOfType(container, 'submit');
		expect(waProp(change, 'appearance')).toBe('outlined');

		type(passwordInput(container, 'oldPassword'), 'the old one, long enough');
		type(passwordInput(container, 'newPassword'), 'correct horse battery staple');
		// Not confirmed yet: still not something that would be accepted.
		await waitFor(() => expect(waProp(change, 'appearance')).toBe('outlined'));

		type(passwordInput(container, 'newConfirm'), 'correct horse battery staple');
		await waitFor(() => {
			expect(waProp(change, 'appearance')).toBe('accent');
			expect(waProp(change, 'variant')).toBe('brand');
		});

		type(passwordInput(container, 'newConfirm'), 'correct horse battery stable');
		await waitFor(() => expect(waProp(change, 'appearance')).toBe('outlined'));
	});

	it('groups each subject under its heading', async () => {
		const { container } = render(Page, { data: await data() });
		const headings = [...container.querySelectorAll('.group > h2')].map((h) => h.textContent);
		expect(headings).toEqual(['Passkeys', 'Password', 'This device']);
	});
});
