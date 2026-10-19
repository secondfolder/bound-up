import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/svelte';
import { userEvent } from 'vitest/browser';
import { DeviceKinkList } from '$lib/kink-list/device-store.svelte';
import KinkListHarness from '$lib/testing/KinkListHarness.svelte';
import { waSettled } from '$lib/testing/web-awesome';

function storeWith(answers: DeviceKinkList['list']['answers'] = {}): DeviceKinkList {
	localStorage.clear();
	const store = new DeviceKinkList();
	store.open();
	store.list = { ...store.list, answers };
	return store;
}

/** The row's name, which opens the rest of it. Its flags come after the name. */
function openRow(name: string) {
	return userEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
}

describe('KinkRow', () => {
	it('answers a kink without a role pair on one scale, and clears it by choosing again', async () => {
		const store = storeWith();
		render(KinkListHarness, { store, itemKey: 'romance' });
		const scale = screen.getByRole('group', { name: 'Romance and affection' });
		await userEvent.click(within(scale).getByRole('radio', { name: 'Like' }));
		expect(store.list.answers.romance?.level).toBe('like');
		expect(within(scale).getByRole('radio', { name: 'Like' })).toBeChecked();

		await userEvent.click(within(scale).getByRole('radio', { name: 'Like' }));
		expect(store.list.answers.romance?.level).toBeUndefined();
	});

	it('shows both contexts of a role pair, each answered on its own', async () => {
		const store = storeWith();
		render(KinkListHarness, { store, itemKey: 'spanking' });
		const giving = screen.getByRole('group', { name: 'Spanking, giving' });
		const receiving = screen.getByRole('group', { name: 'Spanking, receiving' });
		await userEvent.click(within(giving).getByRole('radio', { name: 'Love' }));
		await userEvent.click(within(receiving).getByRole('radio', { name: 'Hard limit' }));
		expect(store.list.answers.spanking?.sides).toEqual({
			a: { level: 'love' },
			b: { level: 'limit' }
		});
		expect(store.list.answers.spanking?.level).toBeUndefined();
	});

	it('shows only your own context of a kink that leans, once your side is set', () => {
		const store = storeWith();
		store.setFilters({ side: 'sub' });
		render(KinkListHarness, { store, itemKey: 'spanking' });
		// A dom spanks: a sub sees being spanked only.
		expect(screen.getByRole('group', { name: 'Spanking, receiving' })).toBeInTheDocument();
		expect(screen.queryByRole('group', { name: 'Spanking, giving' })).toBeNull();
	});

	it('shows a specific its kink’s answer, outlined and named, until it has its own', async () => {
		const store = storeWith({ spanking: { sides: { a: { level: 'love' } }, at: 1 } });
		render(KinkListHarness, { store, itemKey: 'spanking' });
		await openRow('Spanking');
		const specific = screen.getByRole('group', { name: 'Spanking with an implement, giving' });
		// Inherited is not chosen: nothing in the group is checked, and its dot is dashed.
		expect(within(specific).queryByRole('radio', { checked: true })).toBeNull();
		const love = within(specific).getByRole('radio', { name: 'Love' });
		expect(love.closest('label')).toHaveClass('inherited');
		await openRow('Spanking with an implement');
		expect(screen.getByText(/Love, from Spanking/)).toBeInTheDocument();
	});

	it('opens to the description, the answer in words, and Clear', async () => {
		const store = storeWith({ romance: { level: 'curious', at: 1 } });
		const { container } = render(KinkListHarness, { store, itemKey: 'romance' });
		expect(screen.queryByText(/Showing love and affection/)).toBeNull();
		await openRow('Romance and affection');
		expect(screen.getByText(/Showing love and affection/)).toBeInTheDocument();
		expect(container.querySelector('.answers')).toHaveTextContent(/Curious/);
		await waSettled(container);
		(container.querySelector('.answers wa-button, .answers button') as HTMLElement).click();
		expect(store.list.answers.romance?.level).toBeUndefined();
	});

	it('keeps a note typed against a kink', async () => {
		const store = storeWith();
		const { container } = render(KinkListHarness, { store, itemKey: 'spanking' });
		await openRow('Spanking');
		await waSettled(container);
		const note = container.querySelector('wa-textarea') as HTMLElement & { value: string };
		note.value = 'Only over the knee';
		note.dispatchEvent(new Event('input'));
		expect(store.list.answers.spanking?.note).toBe('Only over the knee');
	});
});

describe('KinkCategory', () => {
	it('starts open, says how much is answered, and folds away', async () => {
		const store = storeWith({ romance: { level: 'like', at: 1 } });
		const { container } = render(KinkListHarness, { store, categoryId: 'intimacy' });
		await waSettled(container);
		const details = container.querySelector('wa-details') as HTMLElement & { open: boolean };
		expect(details.open).toBe(true);
		expect(screen.getByText(/^1 of \d+$/)).toBeInTheDocument();
		details.open = false;
		await waSettled(container);
		expect(details.open).toBe(false);
	});

	it('lists related kinks behind a button, sharing their answer with their own category', async () => {
		const store = storeWith();
		render(KinkListHarness, { store, categoryId: 'anal' });
		expect(screen.queryByRole('group', { name: 'Rimming, giving' })).toBeNull();
		await userEvent.click(screen.getByRole('button', { name: /related kinks/ }));
		const rimming = screen.getByRole('group', { name: 'Rimming, giving' });
		await userEvent.click(within(rimming).getByRole('radio', { name: 'Love' }));
		// One answer, under the kink's own key, wherever it was given.
		expect(store.list.answers.rimming?.sides?.a?.level).toBe('love');
	});

	it('hides kinks outside the filters, and says how many', () => {
		const store = storeWith();
		store.setFilters({ maxIntensity: 1 });
		render(KinkListHarness, { store, categoryId: 'impact' });
		expect(screen.queryByRole('group', { name: 'Caning, giving' })).toBeNull();
		expect(screen.getByText(/hidden by your filters/)).toBeInTheDocument();
	});

	it('hides kinks less common than the minimum', () => {
		const store = storeWith();
		store.setFilters({ minCommonness: 4 });
		render(KinkListHarness, { store, categoryId: 'impact' });
		expect(screen.queryByRole('group', { name: 'Spanking, giving' })).toBeNull();
	});
});

describe('the filters and your side', () => {
	it('saves the side chosen', async () => {
		const store = storeWith();
		render(KinkListHarness, { store, controls: true, itemKey: 'spanking' });
		await userEvent.click(screen.getByRole('radio', { name: 'Sub' }));
		expect(store.list.settings.side).toBe('sub');
		expect(screen.queryByRole('group', { name: 'Spanking, giving' })).toBeNull();
	});

	it('saves a slider when it is let go', async () => {
		const store = storeWith();
		const { container } = render(KinkListHarness, { store, controls: true });
		await waSettled(container);
		const sliders = container.querySelectorAll<HTMLElement & { value: number }>('wa-slider');
		const [intensity, commonness] = sliders;
		if (!(intensity && commonness)) {
			throw new Error('the two sliders');
		}
		intensity.value = 2;
		intensity.dispatchEvent(new Event('change'));
		expect(store.list.settings.maxIntensity).toBe(2);
		// Its position runs from very common to rare: the minimum turned round.
		commonness.value = 4;
		commonness.dispatchEvent(new Event('change'));
		expect(store.list.settings.minCommonness).toBe(0);
	});
});
