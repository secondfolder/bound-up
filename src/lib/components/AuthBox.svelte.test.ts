import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import AuthBox from './AuthBox.svelte';

const children = createRawSnippet(() => ({ render: () => '<form><p>Fields</p></form>' }));

describe('AuthBox', () => {
	it('holds its form, with no loading bar while idle', async () => {
		const { container } = render(AuthBox, { busyLabel: 'Signing in', children });
		await waSettled(container);
		expect(container.querySelector('.auth-box form')?.textContent).toBe('Fields');
		expect(container.querySelector('wa-progress-bar')).toBeNull();
	});

	it('runs a labelled loading bar along its bottom edge while busy', async () => {
		const { container, rerender } = render(AuthBox, {
			busy: true,
			busyLabel: 'Signing in',
			children
		});
		await waSettled(container);
		const box = container.querySelector('.auth-box');
		const bar = container.querySelector('wa-progress-bar');
		if (!(box && bar)) {
			throw new Error('missing the box or its bar');
		}
		expect(waProp(bar, 'indeterminate')).toBe(true);
		expect(waProp(bar, 'label')).toBe('Signing in');
		const boxRect = box.getBoundingClientRect();
		const barRect = bar.getBoundingClientRect();
		// Inside the box's border, against its bottom edge.
		expect(boxRect.bottom - barRect.bottom).toBeLessThanOrEqual(2);
		expect(boxRect.bottom - barRect.bottom).toBeGreaterThanOrEqual(0);
		expect(barRect.width).toBeGreaterThan(boxRect.width - 4);
		expect(barRect.height).toBeLessThan(8);

		await rerender({ busy: false, busyLabel: 'Signing in', children });
		expect(container.querySelector('wa-progress-bar')).toBeNull();
	});
});
