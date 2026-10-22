import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import WhoseTime from './WhoseTime.svelte';

describe('WhoseTime', () => {
	it('says whose time it is, on a button the tooltip belongs to', async () => {
		const { container } = render(WhoseTime, {
			name: 'Jun',
			timeZone: 'America/Anchorage',
			viewerTimeZone: 'Europe/London'
		});
		await waSettled(container);
		// Its own words first, then the tooltip's, which the tooltip adds.
		const button = screen.getByRole('button', { name: /^Jun's time Anchorage time/ });
		const tooltip = container.querySelector('wa-tooltip');
		expect(waProp(tooltip, 'for')).toBe(button.id);
		// Hover, and focus, which is what a tap gives on a phone.
		expect(waProp(tooltip, 'trigger')).toBe('hover focus');
	});

	it('gives the zone, both clocks, and how far apart they are', () => {
		const { container } = render(WhoseTime, {
			name: 'Jun',
			timeZone: 'Asia/Tokyo',
			viewerTimeZone: 'UTC'
		});
		const tooltip = container.querySelector('wa-tooltip');
		expect(tooltip).toHaveTextContent('Tokyo time (Asia/Tokyo)');
		expect(tooltip).toHaveTextContent(/It's .+ for Jun, .+ for you\./);
		expect(tooltip).toHaveTextContent('Jun is 9 hours ahead of you.');
	});

	it('does not claim a difference between zones on the same clock', () => {
		const { container } = render(WhoseTime, {
			name: 'Jun',
			timeZone: 'Africa/Abidjan',
			viewerTimeZone: 'UTC'
		});
		expect(container.querySelector('wa-tooltip')).toHaveTextContent(
			'Your clocks show the same time right now.'
		);
	});
});
