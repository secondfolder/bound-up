import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { defined } from '$lib/testing/defined';
import { waProp, waSettled } from '$lib/testing/web-awesome';

/**
 * A level remembered from an earlier visit, in place before the sound module
 * loads — which is when it reads storage.
 */
beforeEach(() => {
	localStorage.setItem('playroom.iq-test.volume', '0.8');
	vi.resetModules();
});

afterEach(() => localStorage.removeItem('playroom.iq-test.volume'));

async function renderControl() {
	const { default: SoundControl } = await import('./SoundControl.svelte');
	const view = render(SoundControl);
	await waSettled(view.container);
	const toggle = defined(
		view.container.querySelector<HTMLButtonElement>('button.mute'),
		'the mute toggle'
	);
	const slider = view.container.querySelector('wa-slider');
	return { ...view, toggle, slider };
}

describe('SoundControl', () => {
	it('starts muted, with the slider at zero, even with a level remembered', async () => {
		const { toggle, slider } = await renderControl();
		expect(toggle).toHaveAttribute('aria-pressed', 'true');
		expect(waProp(slider, 'value')).toBe(0);
	});

	it('unmutes to the remembered level from the toggle, and mutes again', async () => {
		const { toggle, slider, container } = await renderControl();
		toggle.click();
		await tick();
		await waSettled(container);
		expect(toggle).toHaveAttribute('aria-pressed', 'false');
		expect(waProp(slider, 'value')).toBe(80);

		toggle.click();
		await tick();
		await waSettled(container);
		expect(toggle).toHaveAttribute('aria-pressed', 'true');
		expect(waProp(slider, 'value')).toBe(0);
	});

	it('is named "Mute sound", so its pressed state reads as muted', async () => {
		const { toggle } = await renderControl();
		expect(toggle).toHaveAccessibleName('Mute sound');
	});
});
