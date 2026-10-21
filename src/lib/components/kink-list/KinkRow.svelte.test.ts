import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import { userEvent } from 'vitest/browser';
import { detailOf, type KinkItem, kinkById } from '$lib/kink-list/catalog';
import { DeviceKinkList } from '$lib/kink-list/device-store.svelte';
import KinkListHarness from '$lib/testing/KinkListHarness.svelte';
import { waSettled } from '$lib/testing/web-awesome';

/** Debug mode, which only the level of detail's exact switch reads. */
const pageState = vi.hoisted(() => ({ data: { debug: false } }));
vi.mock('$app/state', () => ({
	get page() {
		return pageState;
	}
}));
afterEach(() => {
	pageState.data.debug = false;
});

function storeWith(answers: DeviceKinkList['list']['answers'] = {}): DeviceKinkList {
	localStorage.clear();
	const store = new DeviceKinkList();
	store.open();
	store.list = { ...store.list, answers };
	return store;
}

/**
 * The row's name, which opens the rest of it. Its flags come after the name,
 * and its specifics' rows after it, so the first match is the kink's own.
 */
function openRow(name: string) {
	const [button] = screen.getAllByRole('button', { name: new RegExp(`^${name}`) });
	if (!button) {
		throw new Error(`the row named ${name}`);
	}
	return userEvent.click(button);
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

	it('leaves a specific unanswered whatever its kink’s answer', () => {
		const store = storeWith({ spanking: { sides: { a: { level: 'love' } }, at: 1 } });
		render(KinkListHarness, { store, itemKey: 'spanking' });
		// Under the kink without opening it, with nothing chosen or shown as inherited.
		const specific = screen.getByRole('group', { name: 'Spanking with an implement, giving' });
		expect(within(specific).queryByRole('radio', { checked: true })).toBeNull();
		const love = within(specific).getByRole('radio', { name: 'Love' });
		expect(love.closest('label')).not.toHaveClass('inherited');
	});

	it('opens to the description and a fieldset per context', async () => {
		const store = storeWith({ spanking: { sides: { a: { level: 'curious' } }, at: 1 } });
		render(KinkListHarness, { store, itemKey: 'spanking' });
		expect(screen.queryByRole('group', { name: 'Giving' })).toBeNull();
		await openRow('Spanking');
		const giving = screen.getByRole('group', { name: 'Giving' });
		expect(screen.getByRole('group', { name: 'Receiving' })).toBeInTheDocument();
		// Fantasy and reality are the answer until they part.
		for (const name of ['into it as a fantasy', 'into actually doing it']) {
			const scale = within(giving).getByRole('group', { name: `Spanking, giving, ${name}` });
			expect(within(scale).getByRole('radio', { name: 'Curious' })).toBeChecked();
		}
		expect(within(giving).getByText('Experience')).toBeInTheDocument();
	});

	it('shows fantasy and reality apart once they differ, and one answer once they agree', async () => {
		const store = storeWith({ spanking: { sides: { a: { level: 'like' } }, at: 1 } });
		render(KinkListHarness, { store, itemKey: 'spanking' });
		await openRow('Spanking');
		const giving = screen.getByRole('group', { name: 'Giving' });
		const fantasy = within(giving).getByRole('group', {
			name: 'Spanking, giving, into it as a fantasy'
		});
		await userEvent.click(within(fantasy).getByRole('radio', { name: 'Love' }));
		expect(store.list.answers.spanking?.sides?.a).toEqual({
			level: 'like',
			detail: { fantasy: 'love', doing: 'like' }
		});
		// The line shows the two in place of the one.
		expect(screen.queryByRole('group', { name: 'Spanking, giving' })).toBeNull();
		const lineFantasy = screen.getByRole('group', { name: 'Spanking, giving, fantasy' });
		const lineReality = screen.getByRole('group', { name: 'Spanking, giving, reality' });
		expect(within(lineFantasy).getByRole('radio', { name: 'Love' })).toBeChecked();
		expect(within(lineReality).getByRole('radio', { name: 'Like' })).toBeChecked();

		await userEvent.click(within(lineReality).getByRole('radio', { name: 'Love' }));
		expect(store.list.answers.spanking?.sides?.a).toEqual({ level: 'love' });
		const line = screen.getByRole('group', { name: 'Spanking, giving' });
		expect(within(line).getByRole('radio', { name: 'Love' })).toBeChecked();
	});

	it('shows a context’s experience on the line once it is set', () => {
		const store = storeWith({
			spanking: { sides: { a: { level: 'like', detail: { experience: 3 } } }, at: 1 }
		});
		render(KinkListHarness, { store, itemKey: 'spanking' });
		// Without opening the row, and only for the context it belongs to.
		expect(screen.getAllByText('Experience: Often')).toHaveLength(1);
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
		await userEvent.click(screen.getByRole('button', { name: /related kinks?\b/ }));
		const rimming = screen.getByRole('group', { name: 'Rimming, giving' });
		await userEvent.click(within(rimming).getByRole('radio', { name: 'Love' }));
		// One answer, under the kink's own key, wherever it was given.
		expect(store.list.answers.rimming?.sides?.a?.level).toBe('love');
	});

	it('hides kinks past the level of detail, and says how many', () => {
		const store = storeWith();
		store.setFilters({ detail: 2 });
		render(KinkListHarness, { store, categoryId: 'impact' });
		expect(screen.queryByRole('group', { name: 'Caning, giving' })).toBeNull();
		expect(screen.getByText(/more kinks are hidden by your level of detail/)).toBeInTheDocument();
	});

	it('leaves out a category the level of detail empties, and counts it at the foot', async () => {
		const store = storeWith();
		store.setFilters({ detail: 1 });
		const { container } = render(KinkListHarness, { store, home: true });
		await waSettled(container);
		// Impact has nothing very common; Intimacy has kissing.
		expect(container.querySelector('#category-impact')).toBeNull();
		expect(container.querySelector('#category-intimacy')).not.toBeNull();
		expect(
			screen.getByText(
				/more categories are hidden, since your level of detail hides all \d+ of their kinks/
			)
		).toBeInTheDocument();
	});

	it('hides even common kinks at the lowest level of detail', () => {
		const store = storeWith();
		store.setFilters({ detail: 1 });
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

	it('shows and hides kinks as the level of detail is dragged, saving only when let go', async () => {
		const store = storeWith();
		const { container } = render(KinkListHarness, { store, controls: true, categoryId: 'impact' });
		await waSettled(container);
		const slider = container.querySelector('wa-slider') as HTMLElement & { value: number };
		expect(screen.getByRole('group', { name: 'Spanking, giving' })).toBeInTheDocument();
		slider.value = 1;
		slider.dispatchEvent(new Event('input'));
		await waitFor(() =>
			expect(screen.queryByRole('group', { name: 'Spanking, giving' })).toBeNull()
		);
		expect(store.list.settings.detail).toBe(4);
		slider.dispatchEvent(new Event('change'));
		expect(store.list.settings.detail).toBe(1);
		expect(store.previewDetail).toBeNull();
	});

	it('offers only one level of detail at a time in debug mode, without saving it', async () => {
		const store = storeWith();
		store.setFilters({ detail: 2 });
		const plain = render(KinkListHarness, { store, controls: true, categoryId: 'impact' });
		await waSettled(plain.container);
		expect(plain.container.querySelector('wa-switch')).toBeNull();
		plain.unmount();

		pageState.data.debug = true;
		const { container } = render(KinkListHarness, { store, controls: true, categoryId: 'impact' });
		await waSettled(container);
		const exact = container.querySelector('wa-switch') as HTMLElement & { checked: boolean };
		expect(screen.getByRole('group', { name: 'Spanking, giving' })).toBeInTheDocument();
		exact.checked = true;
		exact.dispatchEvent(new Event('change', { bubbles: true }));
		expect(store.exactDetail).toBe(true);
		expect(store.list.settings).not.toHaveProperty('exactDetail');
		// At its specific's level, spanking stays for the specific's sake, named quietly.
		store.setFilters({ detail: detailOf(kinkById('spanking-implements') as KinkItem) });
		await waitFor(() =>
			expect(screen.getByRole('group', { name: 'Spanking, giving' })).toBeInTheDocument()
		);
		expect(screen.getByText('Spanking', { selector: '.text' })).toHaveClass('context-only');
	});

	it('saves the level of detail when its slider is let go', async () => {
		const store = storeWith();
		const { container } = render(KinkListHarness, { store, controls: true });
		await waSettled(container);
		const sliders = container.querySelectorAll<HTMLElement & { value: number }>('wa-slider');
		expect(sliders).toHaveLength(1);
		const [detail] = sliders;
		if (!detail) {
			throw new Error('the slider');
		}
		detail.value = 2;
		detail.dispatchEvent(new Event('change'));
		expect(store.list.settings.detail).toBe(2);
	});
});

describe('searching the list', () => {
	type WaInput = HTMLElement & { value: string };

	async function search(container: HTMLElement, query: string) {
		await waSettled(container);
		const field = container.querySelector('wa-input[type="search"]') as WaInput;
		field.value = query;
		field.dispatchEvent(new Event('input'));
	}

	it('narrows the list in place: a match under its category, without its kink’s other specifics', async () => {
		const store = storeWith();
		const { container } = render(KinkListHarness, { store, home: true });
		await search(container, 'paddle');
		await waitFor(() =>
			expect(screen.queryByRole('group', { name: 'Kissing, giving' })).toBeNull()
		);
		expect(
			screen.getByRole('group', { name: 'Spanking with an implement, giving' })
		).toBeInTheDocument();
		// Under its kink, in its category, and nothing else.
		const impact = container.querySelector('#category-impact');
		expect(
			within(impact as HTMLElement).getByRole('group', { name: 'Spanking, giving' })
		).toBeInTheDocument();
		expect(screen.queryByRole('group', { name: 'Kissing, giving' })).toBeNull();
		expect(container.querySelectorAll('wa-details.category')).toHaveLength(1);
	});

	it('says how many matches the filters hide', async () => {
		const store = storeWith();
		store.setFilters({ detail: 3 });
		const { container } = render(KinkListHarness, { store, home: true });
		await search(container, 'paddle');
		await waitFor(() =>
			expect(
				screen.getByText(/1 kink matches but is hidden by your level of detail/)
			).toBeInTheDocument()
		);
		expect(screen.getByText(/Nothing shown matches/)).toBeInTheDocument();
	});
});
