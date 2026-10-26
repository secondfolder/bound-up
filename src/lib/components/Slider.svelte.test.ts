import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/svelte';
import { defined } from '$lib/testing/defined';
import { waSettled } from '$lib/testing/web-awesome';
import Slider from './Slider.svelte';

type WaSlider = HTMLElement & { value: number };

async function slider(props: Partial<Parameters<typeof render<typeof Slider>>[1]> = {}) {
	const oninput = vi.fn();
	const onchange = vi.fn();
	const { container } = render(Slider, {
		label: 'Level',
		value: 1,
		max: 4,
		oninput,
		onchange,
		...props
	});
	await waSettled(container);
	const node = defined(container.querySelector<WaSlider>('wa-slider'), 'the slider');
	return { node, oninput, onchange };
}

describe('Slider', () => {
	it('moves freely while dragged, telling of each notch it passes once', async () => {
		const { node, oninput, onchange } = await slider();
		for (const at of [1.2, 1.4, 1.6, 1.8, 2.3]) {
			node.value = at;
			node.dispatchEvent(new Event('input'));
		}
		expect(node.value).toBeCloseTo(2.3);
		expect(oninput.mock.calls).toEqual([[1], [2]]);
		expect(onchange).not.toHaveBeenCalled();
	});

	it('springs onto the nearest notch when let go', async () => {
		const { node, onchange } = await slider();
		node.value = 2.3;
		node.dispatchEvent(new Event('input'));
		node.dispatchEvent(new Event('change'));
		expect(onchange).toHaveBeenCalledWith(2);
		await waitFor(() => expect(node.value).toBe(2));
	});

	it('moves a whole notch from the keyboard', async () => {
		const { node, onchange } = await slider({ value: 2 });
		node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		expect(onchange).toHaveBeenCalledWith(3);
		await waitFor(() => expect(node.value).toBe(3));
	});

	it('sets an unset slider to where its knob rests when pressed and let go', async () => {
		const { node, onchange } = await slider({ value: null, min: 1, max: 5 });
		expect(node).toHaveClass('unset');
		node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await waitFor(() => expect(node).not.toHaveClass('unset'));
		globalThis.dispatchEvent(new PointerEvent('pointerup'));
		await waitFor(() => expect(onchange).toHaveBeenCalledWith(3));
	});

	it('is Web Awesome’s own when continuous, telling of every move', async () => {
		const { node, oninput, onchange } = await slider({ notched: false, max: 100, value: 10 });
		node.value = 37;
		node.dispatchEvent(new Event('input'));
		node.dispatchEvent(new Event('change'));
		expect(oninput).toHaveBeenCalledWith(37);
		expect(onchange).toHaveBeenCalledWith(37);
		expect(node.value).toBe(37);
	});

	it('follows a value set from outside', async () => {
		const { container, rerender } = render(Slider, { label: 'Level', value: 1, max: 4 });
		await waSettled(container);
		const node = defined(container.querySelector<WaSlider>('wa-slider'), 'the slider');
		await rerender({ label: 'Level', value: 3, max: 4 });
		await waitFor(() => expect(node.value).toBe(3));
	});

	it('offers Clear above the track while it has a value, when it can be cleared', async () => {
		const onclear = vi.fn();
		const { container, rerender } = render(Slider, {
			label: 'Heat',
			value: 3,
			max: 5,
			status: 'Hot',
			onclear
		});
		await waSettled(container);
		const clear = () => container.querySelector<HTMLElement>('.status wa-button');
		expect(container.querySelector('.status')).toHaveTextContent('Hot');
		expect(clear()).toHaveTextContent('Clear heat');
		defined(clear(), 'Clear').click();
		expect(onclear).toHaveBeenCalledOnce();

		await rerender({ value: null });
		expect(clear()).toBeNull();
	});
});
