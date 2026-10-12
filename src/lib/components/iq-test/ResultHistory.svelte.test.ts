import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { defined } from '$lib/testing/defined';
import { waSettled } from '$lib/testing/web-awesome';
import type { IqTestResultView } from '$lib/types';
import ResultHistory from './ResultHistory.svelte';

const result = (id: string, iq: number): IqTestResultView => ({
	id,
	role: 'dom',
	intensity: 2,
	vibe: 'bambi',
	iq,
	correct: 5,
	attempted: 12,
	skipped: 0,
	humiliating: true,
	themedLook: true,
	soberIq: null,
	targetIq: null,
	createdAt: new Date('2026-10-10T10:00:00Z')
});

function waButton(container: HTMLElement, text: string): HTMLElement {
	return defined(
		[...container.querySelectorAll<HTMLElement>('wa-button')].find(
			(button) => button.textContent?.trim() === text
		),
		`the "${text}" button`
	);
}

describe('ResultHistory', () => {
	it('shows each score as "IQ n", with how it was taken but not who took it', () => {
		const { container } = render(ResultHistory, {
			results: [result('a', 72)],
			ondelete: vi.fn()
		});
		const row = defined(container.querySelector('li'), 'the row');
		expect(row).toHaveTextContent('IQ 72');
		expect(row).toHaveTextContent('Mood lighting · Bambi & bimbo');
		expect(row).not.toHaveTextContent(/\b(?:Dom|Sub)\b/);
	});

	it('offers no "clear" for an account history', () => {
		const { container } = render(ResultHistory, {
			results: [result('a', 72)],
			ondelete: vi.fn()
		});
		expect(container).not.toHaveTextContent('Clear history');
	});

	it('clears a device history only after asking, and can be talked out of it', async () => {
		const onclear = vi.fn();
		const { container } = render(ResultHistory, {
			results: [result('a', 72), result('b', 90)],
			ondelete: vi.fn(),
			onclear
		});
		await waSettled(container);

		waButton(container, 'Clear history on this device').click();
		await tick();
		expect(container).toHaveTextContent('Clear all 2 from this device?');
		waButton(container, 'Keep them').click();
		await tick();
		expect(onclear).not.toHaveBeenCalled();

		waButton(container, 'Clear history on this device').click();
		await tick();
		await waSettled(container);
		waButton(container, 'Clear history').click();
		expect(onclear).toHaveBeenCalledTimes(1);
	});
});
