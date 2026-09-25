import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { GrainEffect } from '$lib/effects/grain-effect.svelte';
import { HalftoneLinesEffect } from '$lib/effects/halftone-lines-effect.svelte';
import VfxHarness from '$lib/testing/VfxHarness.svelte';

/**
 * The provider and the `attach()` attachment, against a stand-in for VFX-JS
 * that records what it is asked to do. What VFX then draws is covered by the
 * effects' own tests and the landing page's e2e specs; this is about when it
 * is asked — which is what keeps a still page from costing anything.
 */
const fake = vi.hoisted(() => {
	const state: { webgl: boolean; instances: InstanceType<typeof FakeVFX>[] } = {
		webgl: true,
		instances: []
	};
	class FakeVFX {
		canvas = document.createElement('canvas');
		add = vi.fn((_element: HTMLElement, _props: unknown) => Promise.resolve());
		remove = vi.fn((_element: HTMLElement) => undefined);
		updateEffects = vi.fn((_element: HTMLElement, _effects: unknown) => Promise.resolve());
		update = vi.fn((_element: HTMLElement) => Promise.resolve());
		render = vi.fn(() => undefined);
		play = vi.fn(() => undefined);
		stop = vi.fn(() => undefined);
		destroy = vi.fn(() => this.canvas.remove());

		constructor(options: { wrapper?: HTMLElement }) {
			// As the real one does: its canvas goes on the end of the wrapper,
			// or of <body> without one.
			(options.wrapper ?? document.body).append(this.canvas);
			state.instances.push(this);
		}

		static init(options: { wrapper?: HTMLElement }) {
			return state.webgl ? new FakeVFX(options) : null;
		}
	}
	return { state, FakeVFX };
});
vi.mock('@vfx-js/core', () => ({ VFX: fake.FakeVFX }));

const frame = () => new Promise(requestAnimationFrame);
async function frames(count: number) {
	for (let index = 0; index < count; index += 1) {
		await frame();
	}
}

/** The provider's VFX instance, once `@vfx-js/core` has loaded. */
function loaded() {
	return vi.waitFor(() => {
		const [instance, ...others] = fake.state.instances;
		if (!instance || others.length > 0) {
			throw new Error(`expected one VFX instance, found ${fake.state.instances.length}`);
		}
		return instance;
	});
}

afterEach(() => {
	fake.state.webgl = true;
	fake.state.instances = [];
});

describe('VfxProvider', () => {
	it('renders its children without WebGL, and attaches nothing', async () => {
		fake.state.webgl = false;
		render(VfxHarness, { options: () => ({ effect: new GrainEffect() }) });
		await frames(3);
		expect(screen.getByText('child content')).toBeInTheDocument();
		expect(screen.getByTestId('vfx-target')).toBeInTheDocument();
		expect(fake.state.instances).toHaveLength(0);
	});

	it('with autoplay off, draws nothing until something asks', async () => {
		render(VfxHarness, { attached: false, options: () => ({}) });
		const vfx = await loaded();
		await frames(5);
		expect(vfx.render).not.toHaveBeenCalled();
		expect(vfx.play).not.toHaveBeenCalled();
	});

	it('with autoplay on, runs the loop', async () => {
		render(VfxHarness, { autoplay: true, attached: false, options: () => ({}) });
		const vfx = await loaded();
		await vi.waitFor(() => expect(vfx.play).toHaveBeenCalled());
	});

	it('draws once when an element is added, and then holds still', async () => {
		const grain = new GrainEffect();
		render(VfxHarness, { options: () => ({ effect: grain }) });
		const vfx = await loaded();
		await vi.waitFor(() => expect(vfx.add).toHaveBeenCalledTimes(1));
		const [element, props] = vfx.add.mock.calls[0] ?? [];
		expect(element).toBe(screen.getByTestId('vfx-target'));
		expect(props).toEqual({ effect: [grain] });
		await vi.waitFor(() => expect(vfx.render).toHaveBeenCalled());
		const drawn = vfx.render.mock.calls.length;
		await frames(5);
		expect(vfx.render).toHaveBeenCalledTimes(drawn);
	});

	it('redraws once for any number of parameter changes in a frame', async () => {
		const halftone = new HalftoneLinesEffect();
		render(VfxHarness, { options: () => ({ effect: halftone }) });
		const vfx = await loaded();
		await vi.waitFor(() => expect(vfx.render).toHaveBeenCalled());
		await frames(2);
		const before = vfx.render.mock.calls.length;

		halftone.contrast = 0.1;
		halftone.cellSize = 20;
		flushSync();
		halftone.angle = 30;
		flushSync();
		await frames(3);
		expect(vfx.render).toHaveBeenCalledTimes(before + 1);
	});

	it('swaps a changed chain in place rather than re-adding the element', async () => {
		const grain = new GrainEffect();
		const halftone = new HalftoneLinesEffect();
		let chain = $state<(GrainEffect | HalftoneLinesEffect)[]>([grain]);
		render(VfxHarness, { options: () => ({ effect: chain }) });
		const vfx = await loaded();
		await vi.waitFor(() => expect(vfx.render).toHaveBeenCalled());

		chain = [halftone, grain];
		flushSync();
		await vi.waitFor(() => expect(vfx.updateEffects).toHaveBeenCalledTimes(1));
		expect(vfx.updateEffects.mock.calls[0]?.[1]).toEqual([halftone, grain]);
		expect(vfx.add).toHaveBeenCalledTimes(1);
		expect(vfx.remove).not.toHaveBeenCalled();
	});

	it('runs the loop only while an attached effect animates', async () => {
		const halftone = new HalftoneLinesEffect({ speed: 10 });
		render(VfxHarness, { options: () => ({ effect: halftone }) });
		const vfx = await loaded();
		await vi.waitFor(() => expect(vfx.play).toHaveBeenCalledTimes(1));
		expect(vfx.stop).not.toHaveBeenCalled();

		halftone.speed = 0;
		flushSync();
		expect(vfx.stop).toHaveBeenCalledTimes(1);
	});

	it('removes the element and tears VFX down when unmounted', async () => {
		const { unmount } = render(VfxHarness, { options: () => ({ effect: new GrainEffect() }) });
		const vfx = await loaded();
		await vi.waitFor(() => expect(vfx.add).toHaveBeenCalled());
		await frames(1);
		unmount();
		expect(vfx.remove).toHaveBeenCalledTimes(1);
		expect(vfx.destroy).toHaveBeenCalledTimes(1);
		expect(vfx.canvas.isConnected).toBe(false);
	});

	it('fades its layer in once an element is registered', async () => {
		const { container } = render(VfxHarness, { options: () => ({ effect: new GrainEffect() }) });
		const layer = container.querySelector<HTMLElement>('.vfx-layer');
		expect(layer?.style.opacity).toBe('0');
		const vfx = await loaded();
		await vi.waitFor(() => expect(layer?.style.opacity).toBe('1'));
		expect(layer && getComputedStyle(layer).transitionProperty).toContain('opacity');
		expect(vfx.canvas.parentElement).toBe(layer);
		expect(vfx.canvas.classList.contains('vfx-canvas')).toBe(true);
	});

	// The canvas used to sit on <body> itself, where VFX's scroll padding,
	// sized from body.scrollWidth, counted the canvas's own width: shrink the
	// window and the canvas stayed wider than it, with a scrollbar to match.
	it("keeps VFX's canvas inside a clipped layer", async () => {
		const { container } = render(VfxHarness, { options: () => ({}) });
		const vfx = await loaded();
		const layer = container.querySelector<HTMLElement>('.vfx-layer');
		expect(vfx.canvas.parentElement).toBe(layer);
		expect(layer && getComputedStyle(layer).overflow).toBe('hidden');
	});
});
