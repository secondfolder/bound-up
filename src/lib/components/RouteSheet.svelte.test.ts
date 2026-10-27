import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { waProp, waSettled } from '$lib/testing/web-awesome';

type AfterNavigate = (navigation: { from: { url: URL } | null; type: string }) => void;
const navigation = vi.hoisted(() => ({ after: [] as AfterNavigate[] }));

vi.mock('$app/navigation', () => ({
	afterNavigate: (callback: AfterNavigate) => {
		navigation.after.push(callback);
	}
}));

const { default: RouteSheetHarness } = await import('$lib/testing/RouteSheetHarness.svelte');

/** Plays the navigation that showed the sheet, as SvelteKit would after mounting it. */
function arrived(from: string | null, type = 'link') {
	for (const callback of navigation.after) {
		callback({ from: from ? { url: new URL(from, location.href) } : null, type });
	}
}

async function renderSheet() {
	navigation.after.length = 0;
	const leave = vi.fn();
	const view = render(RouteSheetHarness, { leave });
	await waSettled(view.container);
	return { ...view, leave, dialog: view.container.querySelector('wa-dialog') };
}

describe('RouteSheet', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('is open as its page loads, named by its label, and not closed by a stray tap', async () => {
		const { dialog } = await renderSheet();
		expect(waProp(dialog, 'open')).toBe(true);
		expect(waProp(dialog, 'label')).toBe('Add a task');
		expect(waProp(dialog, 'lightDismiss')).toBe(false);
	});

	it('goes back when it was opened from its list, so Back does not reopen it', async () => {
		const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
		const { component, leave } = await renderSheet();
		arrived('/tasks');
		(component as unknown as { close: () => void }).close();
		await expect.poll(() => back.mock.calls.length).toBe(1);
		expect(leave).not.toHaveBeenCalled();
	});

	it('goes to its list in its own place when it was opened by its URL', async () => {
		const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
		const { component, leave } = await renderSheet();
		arrived(null, 'enter');
		(component as unknown as { close: () => void }).close();
		await expect.poll(() => leave.mock.calls.length).toBe(1);
		expect(back).not.toHaveBeenCalled();
	});

	it('goes to its list, too, when it was reached from somewhere else', async () => {
		const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
		const { component, leave } = await renderSheet();
		arrived('/today');
		(component as unknown as { close: () => void }).close();
		await expect.poll(() => leave.mock.calls.length).toBe(1);
		expect(back).not.toHaveBeenCalled();
	});
});
