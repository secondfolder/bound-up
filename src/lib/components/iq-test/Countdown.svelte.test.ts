import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import { defined } from '$lib/testing/defined';
import Countdown from './Countdown.svelte';

function fill(container: HTMLElement): HTMLElement {
	return defined(container.querySelector<HTMLElement>('.fill'), 'the bar');
}

describe('Countdown', () => {
	it('drains its bar over the whole time from full', () => {
		const { container } = render(Countdown, { seconds: 10, remaining: 10 });
		expect(fill(container).style.animationDuration).toBe('10s');
		expect(fill(container).style.animationDelay).toBe('0s');
	});

	it('starts its bar part way through when it mounts part way through', async () => {
		const { container, rerender } = render(Countdown, { seconds: 10, remaining: 4 });
		expect(container).toHaveTextContent('4s');
		expect(fill(container).style.animationDelay).toBe('-6s');
		// And leaves the running animation alone as the seconds go by.
		await rerender({ seconds: 10, remaining: 3 });
		expect(container).toHaveTextContent('3s');
		expect(fill(container).style.animationDelay).toBe('-6s');
	});

	it('reads a minute or more as minutes and seconds', async () => {
		const { container, rerender } = render(Countdown, { seconds: 120, remaining: 83 });
		expect(container.querySelector('.number')).toHaveTextContent('1m 23s');
		await rerender({ seconds: 120, remaining: 65 });
		expect(container.querySelector('.number')).toHaveTextContent('1m 05s');
		await rerender({ seconds: 120, remaining: 60 });
		expect(container.querySelector('.number')).toHaveTextContent('1m 00s');
		await rerender({ seconds: 120, remaining: 59 });
		expect(container.querySelector('.number')).toHaveTextContent(/^59s$/);
	});
});
