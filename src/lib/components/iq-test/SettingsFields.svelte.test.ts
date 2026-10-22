import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { TOGGLE_HELP, TOGGLE_LABELS } from '$lib/playroom/iq-test/copy';
import { DEFAULT_SETTINGS, type Intensity } from '$lib/playroom/iq-test/settings';
import { defined } from '$lib/testing/defined';
import SettingsFields from '$lib/testing/SettingsFieldsHarness.svelte';
import { waProp, waSettled } from '$lib/testing/web-awesome';

const { role: _role, ...initial } = DEFAULT_SETTINGS;

/** Change a Web Awesome control the way a user does: its property, then its event. */
async function set(element: Element | null, property: string, value: unknown, what: string) {
	const control = defined(element, what) as unknown as Record<string, unknown> & HTMLElement;
	control[property] = value;
	control.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
	await tick();
}

async function slideTo(container: HTMLElement, intensity: Intensity) {
	const slider = defined(
		container.querySelector<HTMLElement & { value: number }>('wa-slider'),
		'the slider'
	);
	slider.value = intensity;
	slider.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
	await tick();
}

const toggles = (container: HTMLElement) =>
	[...container.querySelectorAll('wa-checkbox')].map((box) => box.getAttribute('name'));

describe('SettingsFields', () => {
	it('shows under the slider only what its level offers, more at each step', async () => {
		const { container } = render(SettingsFields, { initial: { ...initial, vibe: 'denial' } });
		await waSettled(container);
		const shown = () => ({
			toggles: toggles(container),
			vibe: container.querySelector('[data-testid="vibe-select"]') !== null,
			more: container.querySelector('wa-details') !== null
		});
		expect(shown()).toEqual({ toggles: [], vibe: false, more: false });
		// Nothing describes the level any more: what it offers says it.
		expect(container.querySelector('[data-testid="intensity-choice"]')).toBeNull();

		await slideTo(container, 1);
		expect(shown()).toEqual({ toggles: ['humiliating'], vibe: false, more: true });

		await slideTo(container, 2);
		expect(shown()).toEqual({
			toggles: ['humiliating', 'themedLook', 'themedQuestions'],
			vibe: true,
			more: true
		});

		await slideTo(container, 3);
		expect(shown().toggles).toEqual([
			'humiliating',
			'themedLook',
			'themedQuestions',
			'hypno',
			'porn'
		]);

		await slideTo(container, 4);
		expect(shown().toggles.at(-1)).toBe('subliminals');
		expect(
			container.querySelector('[data-testid="option-subliminals"] .photosensitivity')
		).toHaveTextContent('seizures');
	});

	it('previews the page beside the options, following each change', async () => {
		const { container } = render(SettingsFields, {
			initial: { ...initial, intensity: 4, vibe: 'bambi' }
		});
		await waSettled(container);
		const preview = () =>
			defined(container.querySelector('[data-testid="settings-preview"]'), 'the preview');
		expect(preview().querySelector('.title')).toHaveTextContent('Good Girl IQ Test');
		expect(preview().querySelectorAll('.band')).toHaveLength(2);
		expect(preview().querySelector('.flash')).not.toBeNull();
		expect(preview().querySelector('.backdrop')).not.toBeNull();

		await set(
			container.querySelector('[data-testid="toggle-porn"]'),
			'checked',
			false,
			'the porn box'
		);
		expect(preview().querySelectorAll('.band')).toHaveLength(0);
		expect(preview().querySelector('.backdrop')).toBeNull();

		await set(
			container.querySelector('[data-testid="toggle-themedLook"]'),
			'checked',
			false,
			'the look box'
		);
		expect(preview().querySelector('.title')).toHaveTextContent('Cognitive Assessment');

		// Below the vibe's level the page is the plain test: no preview.
		await slideTo(container, 1);
		expect(container.querySelector('[data-testid="settings-preview"]')).toBeNull();
		await slideTo(container, 0);
		expect(container.querySelector('[data-testid="settings-preview"]')).toBeNull();
	});

	it('pictures the visual options in their info, ticked and not', async () => {
		const { container } = render(SettingsFields, {
			initial: { ...initial, intensity: 4, vibe: 'bambi' }
		});
		await waSettled(container);
		for (const toggle of ['themedLook', 'porn', 'subliminals']) {
			expect(
				container.querySelector(`[data-testid="example-${toggle}-on"]`),
				toggle
			).not.toBeNull();
			expect(
				container.querySelector(`[data-testid="example-${toggle}-off"]`),
				toggle
			).not.toBeNull();
		}
		expect(container.querySelector('[data-testid="example-porn-on"] .band')).not.toBeNull();
		expect(container.querySelector('[data-testid="example-porn-off"] .band')).toBeNull();
		expect(container.querySelector('[data-testid="example-humiliating-on"]')).toBeNull();
	});

	it('labels its options as asked, all ticked to start with', async () => {
		const { container } = render(SettingsFields, {
			initial: { ...initial, intensity: 4, vibe: 'denial' }
		});
		await waSettled(container);
		const boxes = [...container.querySelectorAll('wa-checkbox')];
		// The label alone, without the subliminals' warning beside it.
		const label = (box: Element) =>
			[...box.childNodes]
				.filter((node) => node.nodeType === Node.TEXT_NODE)
				.map((node) => node.textContent)
				.join('')
				.trim();
		expect(boxes.map(label)).toEqual([
			'Humiliating results analysis if deserved',
			'Visual style matches theme',
			'Question content matches theme',
			'Hypno playing',
			'Porn displayed at the same time',
			'Subliminal messaging'
		]);
		expect(boxes.every((box) => waProp(box, 'checked') === true)).toBe(true);
		expect(waProp(container.querySelector('wa-select'), 'label')).toBe('Theme/Vibe');
	});

	it('reports each change as it happens, with everything else as it stands', async () => {
		const onchange = vi.fn();
		const { container } = render(SettingsFields, {
			initial: { ...initial, intensity: 2, vibe: 'denial' },
			onchange
		});
		await waSettled(container);
		await set(container.querySelector('wa-select'), 'value', 'bambi', 'the vibe');
		expect(onchange).toHaveBeenLastCalledWith({
			...initial,
			intensity: 2,
			vibe: 'bambi'
		});
		await set(
			container.querySelector('[data-testid="toggle-themedLook"]'),
			'checked',
			false,
			'the look box'
		);
		expect(onchange).toHaveBeenLastCalledWith({
			...initial,
			intensity: 2,
			vibe: 'bambi',
			themedLook: false
		});
	});

	it('opens the porn options from a button beside its box, defaulting to videos only, and reports a choice', async () => {
		const onchange = vi.fn();
		const { container } = render(SettingsFields, {
			initial: { ...initial, intensity: 3, vibe: 'denial' },
			onchange
		});
		await waSettled(container);
		// Only the porn box has options of its own.
		expect(container.querySelectorAll('[data-testid^="options-"]')).toHaveLength(1);
		expect(container.querySelector('[data-testid="porn-options"]')).toBeNull();

		const open = defined(
			container.querySelector<HTMLButtonElement>(
				'[data-testid="option-porn"] [data-testid="options-porn"]'
			),
			'the porn options button'
		);
		expect(open).toHaveAccessibleName('Porn options');
		open.click();
		await tick();
		await waSettled(container);
		const dialog = defined(
			container.querySelector('[data-testid="porn-options"]'),
			'the porn options dialog'
		);
		expect(waProp(dialog, 'open')).toBe(true);
		const group = dialog.querySelector('[data-testid="porn-media"]');
		expect(waProp(group, 'value')).toBe('videos');
		expect(
			[...dialog.querySelectorAll('wa-radio')].map((radio) => radio.getAttribute('value'))
		).toEqual(['both', 'images', 'videos']);

		await set(group, 'value', 'images', 'the porn media group');
		expect(onchange).toHaveBeenLastCalledWith({
			...initial,
			intensity: 3,
			vibe: 'denial',
			pornMedia: 'images'
		});
	});

	it('drops the IQs below their level, keeps the vibe for going back up, and finds both again', async () => {
		const onchange = vi.fn();
		const { container } = render(SettingsFields, {
			initial: { ...initial, intensity: 2, vibe: 'denial' },
			onchange
		});
		await waSettled(container);
		const sober = defined(
			container.querySelector<HTMLElement & { value: string }>('wa-input[name="soberIq"]'),
			'sober IQ'
		);
		sober.value = '118';
		sober.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		expect(onchange).toHaveBeenLastCalledWith(expect.objectContaining({ soberIq: 118 }));

		await slideTo(container, 0);
		// The vibe is kept, but unused at 0 (`effectiveVibe`); the IQ box is gone.
		expect(container.querySelector('[data-testid="vibe-select"]')).toBeNull();
		expect(onchange).toHaveBeenLastCalledWith(
			expect.objectContaining({ intensity: 0, vibe: 'denial' })
		);
		await slideTo(container, 2);
		expect(onchange).toHaveBeenLastCalledWith(
			expect.objectContaining({ vibe: 'denial', soberIq: 118 })
		);
	});

	it('reverses the order when asked to, for the dock: More options, the options, then the slider', async () => {
		const settings = { ...initial, intensity: 4, vibe: 'denial' } as const;
		const top = (container: HTMLElement, selector: string) =>
			defined(container.querySelector(selector), selector).getBoundingClientRect().top;
		const dialog = render(SettingsFields, { initial: settings });
		await waSettled(dialog.container);
		expect(top(dialog.container, 'wa-slider')).toBeLessThan(top(dialog.container, '.options'));
		const dock = render(SettingsFields, { initial: settings, sliderLast: true });
		await waSettled(dock.container);
		expect(top(dock.container, 'wa-slider')).toBeGreaterThan(top(dock.container, '.options'));
		// Reversed: "More options", then the options, then the slider.
		expect(top(dock.container, 'wa-details')).toBeLessThan(top(dock.container, '.options'));
		expect(top(dialog.container, 'wa-details')).toBeGreaterThan(top(dialog.container, '.options'));
	});

	it('reverses the level’s options too, for the dock, the vibe staying with its boxes', () => {
		const settings = { ...initial, intensity: 4, vibe: 'denial' } as const;
		const order = (container: HTMLElement) =>
			[...container.querySelectorAll('.options > *')].map((element) =>
				(element.getAttribute('data-testid') ?? '').replace(/^option-|-select$/g, '')
			);
		const dialog = render(SettingsFields, { initial: settings });
		const dock = render(SettingsFields, { initial: settings, sliderLast: true });
		expect(order(dialog.container)).toEqual([
			'humiliating',
			'vibe',
			'themedLook',
			'themedQuestions',
			'hypno',
			'porn',
			'subliminals'
		]);
		expect(order(dock.container)).toEqual([...order(dialog.container)].reverse());
	});

	it('lines the photosensitivity warning up with its label, its info button right beside it', async () => {
		const { container } = render(SettingsFields, {
			initial: { ...initial, intensity: 4, vibe: 'denial' }
		});
		await waSettled(container);
		const box = defined(
			container.querySelector('[data-testid="toggle-subliminals"]'),
			'the subliminals box'
		);
		const label = defined(box.shadowRoot?.querySelector('[part~="label"]'), 'its label');
		const warning = defined(
			container.querySelector('[data-testid="option-subliminals"] .photosensitivity span'),
			'the warning'
		);
		expect(
			Math.abs(warning.getBoundingClientRect().left - label.getBoundingClientRect().left)
		).toBeLessThan(1);
		// Not pushed across the row by the warning's length.
		const info = defined(
			container.querySelector('[data-testid="info-subliminals"]'),
			'its info button'
		);
		expect(info.getBoundingClientRect().left - label.getBoundingClientRect().right).toBeLessThan(
			16
		);
	});

	it('moves freely while dragged, following the nearest level, and settles on it when let go', async () => {
		const onchange = vi.fn();
		const { container } = render(SettingsFields, { initial, onchange });
		await waSettled(container);
		const slider = defined(
			container.querySelector<HTMLElement & { value: number }>('wa-slider'),
			'the slider'
		);
		slider.value = 2.4;
		slider.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		await tick();
		// Between notches, where it was dragged, with the nearest level's options.
		expect(slider.value).toBe(2.4);
		expect(onchange).toHaveBeenLastCalledWith(expect.objectContaining({ intensity: 2 }));
		expect(container.querySelector('[data-testid="vibe-select"]')).not.toBeNull();

		slider.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
		// A spring, run frame by frame: slower than a second when the whole
		// suite is running alongside.
		await expect.poll(() => slider.value, { timeout: 5000 }).toBe(2);
	});

	it('moves a whole level at a time from the keyboard', async () => {
		const onchange = vi.fn();
		const { container } = render(SettingsFields, { initial, onchange });
		await waSettled(container);
		const slider = defined(
			container.querySelector<HTMLElement & { value: number }>('wa-slider'),
			'the slider'
		);
		slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		expect(onchange).toHaveBeenLastCalledWith(expect.objectContaining({ intensity: 1 }));
		await expect.poll(() => slider.value, { timeout: 5000 }).toBe(1);
	});

	// Lined up with the left-aligned text above it: centred, it lined up with
	// nothing.
	it('is no wider than 300px, on the fields’ left edge', async () => {
		const { container } = render(SettingsFields, { initial });
		await waSettled(container);
		const slider = defined(container.querySelector('wa-slider'), 'the slider');
		const fields = defined(container.querySelector('.settings-fields'), 'the fields');
		const box = slider.getBoundingClientRect();
		const outer = fields.getBoundingClientRect();
		expect(box.width).toBeLessThanOrEqual(300);
		expect(Math.abs(box.left - outer.left)).toBeLessThan(1);
	});

	it('has an info button beside each option, outside its label, that says what it does ticked and not', async () => {
		const { container } = render(SettingsFields, {
			initial: { ...initial, intensity: 4, vibe: 'denial' }
		});
		await waSettled(container);
		const options = Object.keys(TOGGLE_LABELS) as (keyof typeof TOGGLE_LABELS)[];
		for (const toggle of options) {
			const info = defined(
				container.querySelector<HTMLButtonElement>(`[data-testid="info-${toggle}"]`),
				`${toggle}'s info button`
			);
			expect(info).toHaveAccessibleName(`About “${TOGGLE_LABELS[toggle]}”`);
			// Beside the box: a click on it does not tick or untick it.
			expect(info.closest('wa-checkbox')).toBeNull();
			// Its `for` is a property, set by Svelte, so found beside it and checked.
			const popover = defined(
				info.closest('.option')?.querySelector('wa-popover'),
				`${toggle}'s popover`
			);
			expect(waProp(popover, 'for')).toBe(info.id);
			expect(popover).toHaveTextContent(TOGGLE_HELP[toggle].on);
			expect(popover).toHaveTextContent(TOGGLE_HELP[toggle].off);
		}

		const box = defined(
			container.querySelector('[data-testid="toggle-themedQuestions"]'),
			'the box'
		);
		const info = defined(
			container.querySelector<HTMLButtonElement>('[data-testid="info-themedQuestions"]'),
			'its info'
		);
		info.click();
		// By the option, not the button's parent: the button sits in a group of
		// its own beside the box, with the porn options' button.
		const popover = defined(info.closest('.option')?.querySelector('wa-popover'), 'its popover');
		await expect.poll(() => waProp(popover, 'open')).toBe(true);
		expect(waProp(box, 'checked')).toBe(true);
	});
});
