import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { page } from 'vitest/browser';
import { defined } from '$lib/testing/defined';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import ResponsiveDialogHarness from './ResponsiveDialogHarness.svelte';

async function renderDialog(
	props: { lightDismiss?: boolean; withFooter?: boolean; body?: string } = {}
) {
	const onclose = vi.fn();
	const view = render(ResponsiveDialogHarness, { label: 'Evening walk', onclose, ...props });
	await waSettled(view.container);
	const dialog = defined(view.container.querySelector('wa-dialog'), 'the dialog');
	const panel = () =>
		defined(
			dialog.shadowRoot?.querySelector<HTMLElement>('[part~="dialog"]'),
			'the dialog panel'
		).getBoundingClientRect();
	return { ...view, onclose, dialog, panel };
}

describe('ResponsiveDialog', () => {
	afterEach(async () => {
		await page.viewport(1280, 800);
	});

	it('is open as it renders, named by its label, with the body and the footer', async () => {
		const { container, dialog } = await renderDialog();
		expect(waProp(dialog, 'open')).toBe(true);
		expect(waProp(dialog, 'label')).toBe('Evening walk');
		expect(container.querySelector('.body-text')).toHaveTextContent('The body');
		expect(container.querySelector('[slot="footer"] .footer-action')).not.toBeNull();
	});

	it('leaves the footer out when there is none', async () => {
		const { container } = await renderDialog({ withFooter: false });
		expect(container.querySelector('[slot="footer"]')).toBeNull();
	});

	it('closes on a backdrop tap by default, and can be told not to', async () => {
		const first = await renderDialog();
		expect(waProp(first.dialog, 'lightDismiss')).toBe(true);
		first.unmount();
		const second = await renderDialog({ lightDismiss: false });
		expect(waProp(second.dialog, 'lightDismiss')).toBe(false);
		expect(second.dialog.hasAttribute('light-dismiss')).toBe(false);
	});

	it('calls onclose once after close(), when it has gone', async () => {
		const { component, onclose, dialog } = await renderDialog();
		(component as unknown as { close: () => void }).close();
		await expect.poll(() => onclose.mock.calls.length).toBe(1);
		expect(waProp(dialog, 'open')).toBe(false);
	});

	it('ignores a wa-after-hide that bubbles up from something inside it', async () => {
		const { container, onclose } = await renderDialog();
		const details = defined(container.querySelector('wa-details'), 'the nested details');
		details.dispatchEvent(new CustomEvent('wa-after-hide', { bubbles: true, composed: true }));
		expect(onclose).not.toHaveBeenCalled();
	});

	it('is a dialog in the middle of a wide window', async () => {
		const { panel } = await renderDialog();
		await expect.poll(() => Math.round(panel().width)).toBe(32 * 16);
		const rect = panel();
		expect(Math.round(rect.left)).toBe(Math.round((window.innerWidth - rect.width) / 2));
		expect(rect.bottom).toBeLessThan(window.innerHeight);
	});

	it('is a sheet across the bottom of a phone, and slides down when it closes', async () => {
		await page.viewport(390, 844);
		const { component, onclose, panel } = await renderDialog();
		await expect.poll(() => Math.round(panel().width)).toBe(window.innerWidth);
		await expect.poll(() => Math.round(panel().bottom)).toBe(window.innerHeight);
		expect(Math.round(panel().left)).toBe(0);

		(component as unknown as { close: () => void }).close();
		await expect.poll(() => onclose.mock.calls.length).toBe(1);
	});

	it('keeps the footer in view while a long body scrolls', async () => {
		await page.viewport(390, 844);
		const { container, panel } = await renderDialog({ body: 'Long. '.repeat(2000) });
		await expect.poll(() => Math.round(panel().bottom)).toBe(window.innerHeight);
		const footer = defined(container.querySelector('.footer-action'), 'the footer action');
		expect(footer.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight);
		expect(panel().top).toBeGreaterThanOrEqual(0);
	});

	describe('swiped down as a sheet', () => {
		/** Drags from the header by `dy` px and lets go, as a finger would. */
		async function swipe(dialog: HTMLElement, dy: number, durationMs = 400) {
			const header = defined(
				dialog.shadowRoot?.querySelector('[part~="header"]'),
				'the dialog header'
			);
			const start = header.getBoundingClientRect();
			const y = start.top + 4;
			const init = { bubbles: true, composed: true, pointerId: 7, button: 0, clientX: 100 };
			header.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientY: y }));
			dialog.dispatchEvent(new PointerEvent('pointermove', { ...init, clientY: y + dy }));
			await new Promise((done) => setTimeout(done, durationMs));
			dialog.dispatchEvent(new PointerEvent('pointerup', { ...init, clientY: y + dy }));
		}

		it('springs back from a short drag', async () => {
			await page.viewport(390, 844);
			const { dialog, onclose, panel } = await renderDialog();
			await expect.poll(() => Math.round(panel().bottom)).toBe(window.innerHeight);
			await swipe(dialog, 20);
			await expect.poll(() => Math.round(panel().bottom)).toBe(window.innerHeight);
			expect(onclose).not.toHaveBeenCalled();
			expect(waProp(dialog, 'open')).toBe(true);
		});

		it('closes when dragged past a third of its height', async () => {
			await page.viewport(390, 844);
			const { dialog, onclose, panel } = await renderDialog();
			await expect.poll(() => Math.round(panel().bottom)).toBe(window.innerHeight);
			await swipe(dialog, Math.ceil(panel().height / 2));
			await expect.poll(() => onclose.mock.calls.length).toBe(1);
		});

		it('is not dragged as a dialog on a wide screen', async () => {
			const { dialog, onclose } = await renderDialog();
			await swipe(dialog, 400);
			await new Promise((done) => setTimeout(done, 300));
			expect(onclose).not.toHaveBeenCalled();
		});
	});
});
