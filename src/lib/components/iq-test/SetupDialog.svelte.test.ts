import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { ROLE_BUTTONS } from '$lib/playroom/iq-test/copy';
import { watchFullscreen } from '$lib/playroom/iq-test/fullscreen.svelte';
import { DEFAULT_SETTINGS, effectiveVibe, type Settings } from '$lib/playroom/iq-test/settings';
import { defined } from '$lib/testing/defined';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import SetupDialog from './SetupDialog.svelte';

async function renderDialog(initial: Settings = DEFAULT_SETTINGS, closable = false) {
	const onstart = vi.fn();
	const onclose = vi.fn();
	const view = render(SetupDialog, { initial, closable, onstart, onclose });
	await waSettled(view.container);
	return { ...view, onstart, onclose };
}

function waButton(container: HTMLElement, text: string): HTMLElement {
	return defined(
		[...container.querySelectorAll<HTMLElement>('wa-button')].find(
			(button) => button.textContent?.trim() === text
		),
		`the "${text}" button`
	);
}

/** Move the intensity slider the way a user does: its value, then its `input` event. */
async function slideTo(container: HTMLElement, intensity: number) {
	const slider = defined(
		container.querySelector<HTMLElement & { value: number }>('wa-slider'),
		'the intensity slider'
	);
	slider.value = intensity;
	slider.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
	await tick();
}

/** Pick a vibe from the dropdown, the way a user does: its value, then its event. */
async function chooseVibe(container: HTMLElement, value: string) {
	const select = defined(
		container.querySelector<HTMLElement & { value: string }>('wa-select'),
		'the vibe dropdown'
	);
	select.value = value;
	select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
	await tick();
}

describe('SetupDialog', () => {
	it('names each level of the slider to a screen reader, rather than a bare 0–4', async () => {
		const { container } = await renderDialog();
		const slider = container.querySelector('wa-slider') as unknown as {
			valueFormatter: (value: number) => string;
		};
		expect(slider.valueFormatter(1)).toBe('Standard assessment, honest debrief');
		expect(waProp(container.querySelector('wa-slider'), 'label')).toBe('Stimulation intensity');
	});

	it('takes up remembered settings that arrive after it has rendered', async () => {
		const { container, rerender } = await renderDialog();
		await rerender({
			initial: { ...DEFAULT_SETTINGS, intensity: 2, vibe: 'denial' }
		});
		await waSettled(container);
		expect(waProp(container.querySelector('wa-slider'), 'value')).toBe(2);
		expect(waProp(container.querySelector('wa-select'), 'value')).toBe('denial');
	});

	it('is open as soon as it renders, with the disclaimer', async () => {
		const { container } = await renderDialog();
		expect(waProp(container.querySelector('wa-dialog'), 'open')).toBe(true);
		expect(container).toHaveTextContent('kink toy for consenting adults');
	});

	it('is the window’s full height whatever it holds, so the slider never moves', async () => {
		const { container } = await renderDialog();
		const panel = () =>
			defined(
				container.querySelector('wa-dialog')?.shadowRoot?.querySelector('[part~="dialog"]'),
				'the dialog panel'
			).getBoundingClientRect().height;
		await expect.poll(panel).toBe(window.innerHeight - 32);
		await slideTo(container, 4);
		await waSettled(container);
		expect(panel()).toBe(window.innerHeight - 32);
	});

	it('keeps the role buttons at its foot while everything fits, and after the rest when not', async () => {
		const { container } = await renderDialog();
		const body = defined(
			container
				.querySelector('wa-dialog')
				?.shadowRoot?.querySelector<HTMLElement>('[part~="body"]'),
			'the body'
		);
		const roles = defined(container.querySelector('.roles'), 'the role buttons');
		const gapBelow = () =>
			body.getBoundingClientRect().bottom - roles.getBoundingClientRect().bottom;
		// Level 0 is short: the buttons sit at the bottom, not under the slider.
		await expect.poll(() => body.scrollHeight <= body.clientHeight).toBe(true);
		expect(gapBelow()).toBeLessThan(40);

		// More than fits: the buttons go below the fold, after the rest.
		const tall = document.createElement('div');
		// Not shrinkable, as real content is not: an empty box in a flex column is.
		tall.style.blockSize = '2000px';
		tall.style.flex = 'none';
		roles.before(tall);
		await expect.poll(() => body.scrollHeight > body.clientHeight).toBe(true);
		expect(roles.getBoundingClientRect().top).toBeGreaterThan(body.getBoundingClientRect().bottom);
	});

	it('asks for a vibe only from level 2', async () => {
		const { container } = await renderDialog();
		expect(container.querySelector('wa-select')).toBeNull();
		await slideTo(container, 1);
		expect(container.querySelector('wa-select')).toBeNull();
		await slideTo(container, 2);
		expect(container.querySelector('wa-select')).not.toBeNull();
	});

	it('starts on the gooner vibe, and says nothing about a hypno', async () => {
		const { container } = await renderDialog();
		await slideTo(container, 2);
		await waSettled(container);
		expect(waProp(container.querySelector('wa-select'), 'value')).toBe('gooner');
		await chooseVibe(container, 'bambi');
		expect(container).not.toHaveTextContent('bambicloud');
	});

	it('offers no fullscreen, even where the browser has it: the intro and the dock do', async () => {
		const enabled = vi.spyOn(document, 'fullscreenEnabled', 'get').mockReturnValue(true);
		const stop = watchFullscreen();
		try {
			const { container } = await renderDialog();
			expect(container).not.toHaveTextContent(/full ?screen/i);
		} finally {
			stop();
			enabled.mockReturnValue(false);
			watchFullscreen()();
			enabled.mockRestore();
		}
	});

	it('warns about flashing beside the subliminals, and only once they are offered', async () => {
		const { container } = await renderDialog();
		await slideTo(container, 3);
		expect(container.querySelector('.photosensitivity')).toBeNull();
		await slideTo(container, 4);
		expect(
			container.querySelector('[data-testid="option-subliminals"] .photosensitivity')
		).toHaveTextContent('seizures');
	});

	it('starts the test as whichever role was chosen, with the settings picked', async () => {
		const { container, onstart } = await renderDialog();
		await slideTo(container, 3);
		await waSettled(container);
		await chooseVibe(container, 'feminisation');
		const sober = defined(
			container.querySelector<HTMLElement & { value: string }>('wa-input[name="soberIq"]'),
			'sober IQ'
		);
		// No event: read from the box as the dialog closes, as an autofilled
		// value has to be.
		sober.value = '118';
		await waSettled(container);

		waButton(container, ROLE_BUTTONS.dom).click();
		expect(onstart).toHaveBeenCalledWith({
			...DEFAULT_SETTINGS,
			role: 'dom',
			intensity: 3,
			vibe: 'feminisation',
			soberIq: 118,
			targetIq: null
		});
	});

	it('keeps a remembered vibe through a clinical start, unused there', async () => {
		const { container, onstart } = await renderDialog({ ...DEFAULT_SETTINGS, vibe: 'denial' });
		waButton(container, ROLE_BUTTONS.sub).click();
		// Kept for going back up a level; a clinical run is not themed by it.
		expect(onstart).toHaveBeenCalledWith(expect.objectContaining({ role: 'sub', vibe: 'denial' }));
		expect(effectiveVibe(onstart.mock.calls[0]?.[0])).toBeNull();
	});

	it('cannot be closed until a role has been chosen before', async () => {
		const { container } = await renderDialog();
		const dialog = defined(container.querySelector('wa-dialog'), 'the dialog');
		const hide = new CustomEvent('wa-hide', { cancelable: true });
		dialog.dispatchEvent(hide);
		expect(hide.defaultPrevented).toBe(true);
		expect(dialog.hasAttribute('light-dismiss')).toBe(false);
		expect(dialog.classList.contains('closable')).toBe(false);
	});

	it('can be closed, by the backdrop too, once a role has been chosen before', async () => {
		const { container } = await renderDialog(DEFAULT_SETTINGS, true);
		const dialog = defined(container.querySelector('wa-dialog'), 'the dialog');
		const hide = new CustomEvent('wa-hide', { cancelable: true });
		dialog.dispatchEvent(hide);
		expect(hide.defaultPrevented).toBe(false);
		expect(waProp(dialog, 'lightDismiss')).toBe(true);
	});

	it('offers both roles alike, in the body rather than a pinned footer', async () => {
		const { container } = await renderDialog();
		const buttons = [ROLE_BUTTONS.dom, ROLE_BUTTONS.sub].map((text) => waButton(container, text));
		for (const button of buttons) {
			expect(button.getAttribute('slot')).toBeNull();
			expect(waProp(button, 'variant')).toBe('brand');
			expect(waProp(button, 'appearance')).toBe(waProp(buttons[0], 'appearance'));
		}
	});

	it('closing it starts nothing, and keeps the role from last time', async () => {
		const { container, onstart, onclose } = await renderDialog(
			{ ...DEFAULT_SETTINGS, role: 'dom' },
			true
		);
		defined(container.querySelector('wa-dialog'), 'the dialog').dispatchEvent(
			new CustomEvent('wa-after-hide')
		);
		expect(onstart).not.toHaveBeenCalled();
		expect(onclose).toHaveBeenCalledWith(expect.objectContaining({ role: 'dom' }));
	});

	it('is not closed by the "More options" section collapsing', async () => {
		const { container, onclose } = await renderDialog({
			...DEFAULT_SETTINGS,
			intensity: 1
		});
		defined(container.querySelector('wa-details'), 'more options').dispatchEvent(
			new CustomEvent('wa-after-hide', { bubbles: true })
		);
		expect(onclose).not.toHaveBeenCalled();
		expect(waProp(container.querySelector('wa-dialog'), 'open')).toBe(true);
	});
});
