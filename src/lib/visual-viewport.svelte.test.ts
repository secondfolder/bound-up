import { afterEach, describe, expect, it } from 'vitest';
import { fitVisualViewport, viewportFit } from './visual-viewport';

const frame = () => new Promise((done) => requestAnimationFrame(() => setTimeout(done)));

/** A stand-in for iOS's `visualViewport`, whose numbers a test moves, as the keyboard would. */
class FakeViewport extends EventTarget {
	height = 800;
	offsetTop = 0;
	scale = 1;
	move(change: Partial<Pick<FakeViewport, 'height' | 'offsetTop' | 'scale'>>, event = 'resize') {
		Object.assign(this, change);
		this.dispatchEvent(new Event(event));
	}
}

describe('viewportFit', () => {
	it('fits the visible height and how far it has panned', () => {
		expect(viewportFit({ height: 412.4, offsetTop: 87.6, scale: 1 })).toEqual({
			height: 412,
			top: 88
		});
	});

	it('leaves a pinch-zoomed viewport alone, rather than shrinking the app to it', () => {
		expect(viewportFit({ height: 300, offsetTop: 40, scale: 2 })).toBeNull();
	});
});

describe('fitVisualViewport', () => {
	let cleanup: (() => void) | undefined;
	afterEach(() => {
		cleanup?.();
		cleanup = undefined;
	});

	function shell() {
		const node = document.createElement('div');
		const viewport = new FakeViewport();
		cleanup = fitVisualViewport(node, viewport as unknown as VisualViewport);
		const vars = () => ({
			height: node.style.getPropertyValue('--viewport-height'),
			top: node.style.getPropertyValue('--viewport-top')
		});
		return { viewport, vars };
	}

	it('sizes the shell straight away', () => {
		const { vars } = shell();
		expect(vars()).toEqual({ height: '800px', top: '0px' });
	});

	it('follows the keyboard opening, panning and closing', async () => {
		const { viewport, vars } = shell();
		viewport.move({ height: 450 });
		await frame();
		expect(vars()).toEqual({ height: '450px', top: '0px' });

		viewport.move({ offsetTop: 120 }, 'scroll');
		await frame();
		expect(vars()).toEqual({ height: '450px', top: '120px' });

		viewport.move({ height: 800, offsetTop: 0 });
		await frame();
		expect(vars()).toEqual({ height: '800px', top: '0px' });
	});

	it('falls back to the CSS while pinch-zoomed', async () => {
		const { viewport, vars } = shell();
		viewport.move({ height: 400, scale: 2 });
		await frame();
		expect(vars()).toEqual({ height: '', top: '' });
	});

	it('stops following, and clears what it set, when detached', async () => {
		const { viewport, vars } = shell();
		cleanup?.();
		cleanup = undefined;
		viewport.move({ height: 450 });
		await frame();
		expect(vars()).toEqual({ height: '', top: '' });
	});

	it('does nothing without a visual viewport', () => {
		expect(fitVisualViewport(document.createElement('div'), null)).toBeUndefined();
	});
});
