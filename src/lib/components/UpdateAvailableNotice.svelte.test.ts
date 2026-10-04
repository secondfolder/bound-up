import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { fakeUpdated } from '$lib/testing/updated.svelte';
import { waSettled } from '$lib/testing/web-awesome';

vi.mock('$app/state', async () => ({
	updated: (await import('$lib/testing/updated.svelte')).fakeUpdated
}));

const { default: UpdateAvailableNotice } = await import('./UpdateAvailableNotice.svelte');

afterEach(() => {
	fakeUpdated.current = false;
	vi.restoreAllMocks();
});

function setUpdated(value: boolean) {
	fakeUpdated.current = value;
	flushSync();
}

const toast = (container: HTMLElement) =>
	container.querySelector<HTMLElement>('[data-testid="update-available"]');

describe('UpdateAvailableNotice', () => {
	it('shows nothing while the build is current', () => {
		const { container } = render(UpdateAvailableNotice);
		expect(toast(container)).toBeNull();
	});

	it('offers a reload once a new version is out, and keeps offering it', async () => {
		const { container } = render(UpdateAvailableNotice);
		setUpdated(true);

		const item = toast(container);
		expect(item).toHaveTextContent('A new version of Bound Up is available.');
		expect((item as HTMLElement & { duration: number }).duration).toBe(0);
		await waSettled(container);
		expect(item?.querySelector('wa-button')).toHaveTextContent('Reload');
	});

	it('shows one toast however often the version is seen to change', () => {
		const { container } = render(UpdateAvailableNotice);
		setUpdated(true);
		setUpdated(false);
		setUpdated(true);
		expect(container.querySelectorAll('[data-testid="update-available"]')).toHaveLength(1);
	});

	it('checks for an update when the app comes back to the foreground', () => {
		render(UpdateAvailableNotice);
		fakeUpdated.check.mockClear();
		vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
		document.dispatchEvent(new Event('visibilitychange'));
		expect(fakeUpdated.check).not.toHaveBeenCalled();

		vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
		document.dispatchEvent(new Event('visibilitychange'));
		expect(fakeUpdated.check).toHaveBeenCalledOnce();
	});

	it('checks for an update when a lazily loaded module has gone', () => {
		render(UpdateAvailableNotice);
		fakeUpdated.check.mockClear();
		dispatchEvent(new Event('vite:preloadError'));
		expect(fakeUpdated.check).toHaveBeenCalledOnce();
	});
});
