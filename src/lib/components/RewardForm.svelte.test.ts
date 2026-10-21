import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import RewardForm from '$lib/components/RewardForm.svelte';
import { waButtonOfType, waProp, waSettled, waType } from '$lib/testing/web-awesome';

type Values = { title: string; description: string; cost: string | number; active: boolean };

const EMPTY: Values = { title: '', description: '', cost: '', active: true };

function renderForm(values: Values = EMPTY) {
	return render(RewardForm, { values, sealScope: { kind: 'self' }, submitLabel: 'Add reward' });
}

describe('RewardForm', () => {
	it('renders its fields as the app’s shared fields, not native inputs', async () => {
		const { container } = renderForm();
		await waSettled(container);
		expect(container.querySelector('wa-input[name="title"]')).not.toBeNull();
		expect(container.querySelector('wa-input[name="cost"]')).not.toBeNull();
		expect(container.querySelector('wa-checkbox[name="active"]')).not.toBeNull();
		expect(container.querySelector('input[name="title"], input[name="cost"]')).toBeNull();
	});

	it('starts outlined, and turns solid only once the title and cost would be accepted', async () => {
		const { container } = renderForm();
		const save = waButtonOfType(container, 'submit');
		expect(waProp(save, 'appearance')).toBe('outlined');

		await waType(container, 'title', 'Long bath');
		// A title alone is not enough: the cost is still empty.
		await waitFor(() => expect(waProp(save, 'appearance')).toBe('outlined'));

		await waType(container, 'cost', '2');
		await waitFor(() => {
			expect(waProp(save, 'appearance')).toBe('accent');
			expect(waProp(save, 'variant')).toBe('brand');
		});

		await waType(container, 'cost', '');
		await waitFor(() => expect(waProp(save, 'appearance')).toBe('outlined'));
	});

	it('stays outlined on an edit form until something changes', async () => {
		const { container } = renderForm({
			title: 'Long bath',
			description: '',
			cost: 2,
			active: true
		});
		await waSettled(container);
		const save = waButtonOfType(container, 'submit');
		expect(waProp(save, 'appearance')).toBe('outlined');

		await waType(container, 'title', 'Long bath, with a book');
		await waitFor(() => expect(waProp(save, 'appearance')).toBe('accent'));
	});
});
