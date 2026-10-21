import { render, waitFor } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { describe, expect, it, vi } from 'vitest';
import { partnerInviteFormSchema } from '$lib/schemas/partnerForm';
import { waButtonOfType, waProp, waSettled } from '$lib/testing/web-awesome';
import type { PageData } from './$types';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

vi.mock('$app/navigation', () => ({
	// Unused by the assertions, but superforms and the page import it, and a
	// real browser refuses to link a module whose named import is missing.
	goto: vi.fn(),
	afterNavigate: vi.fn(),
	beforeNavigate: vi.fn(),
	invalidateAll: vi.fn().mockResolvedValue(undefined)
}));

const { default: Page } = await import('./+page.svelte');

async function data(): Promise<PageData> {
	return {
		partnerInviteForm: await superValidate(
			{ partnerName: '', yourName: 'Ada', partnerRole: null, yourRole: null, control: 'mix' },
			zod4(partnerInviteFormSchema),
			{ errors: false }
		)
	} as PageData;
}

describe('/settings/partners/new/+page.svelte', () => {
	it('promotes "Create invite link" only once the invite could be made', async () => {
		const { container } = render(Page, { data: await data() });
		await waSettled(container);
		const create = waButtonOfType(container, 'submit');
		// Their name is still empty, so there is nothing to make yet.
		expect(waProp(create, 'appearance')).toBe('outlined');

		const theirs = container
			.querySelector('wa-input[name="partnerName"]')
			?.shadowRoot?.querySelector('input');
		if (!(theirs instanceof HTMLInputElement)) {
			throw new Error('missing partnerName input');
		}
		theirs.value = 'Jun';
		theirs.dispatchEvent(new Event('input', { bubbles: true }));

		await waitFor(() => {
			expect(waProp(create, 'appearance')).toBe('accent');
			expect(waProp(create, 'variant')).toBe('brand');
		});
	});
});
