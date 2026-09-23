import { fireEvent, render, screen } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';

const { default: Toggle } = await import('./TaskTimeZoneOwnerToggle.svelte');

describe('TaskTimeZoneOwnerToggle', () => {
	it('shows the partner-relative toggle text when timezones differ', () => {
		render(Toggle, {
			viewerUserId: 'u1',
			viewerTimezone: 'Europe/London',
			counterpartUserId: 'u2',
			counterpartTimezone: 'America/New_York',
			counterpartName: 'Jun',
			value: 'u2'
		});

		expect(screen.getByText("Jun's time (5 hours behind you)")).toBeInTheDocument();
	});

	it('hides itself when both sides share the same timezone', () => {
		const { container } = render(Toggle, {
			viewerUserId: 'u1',
			viewerTimezone: 'Europe/London',
			counterpartUserId: 'u2',
			counterpartTimezone: 'Europe/London',
			counterpartName: 'Jun',
			value: 'u2'
		});

		expect(container.textContent).toBe('');
	});

	it('switches the selection when a button is clicked', async () => {
		const { container } = render(Toggle, {
			viewerUserId: 'u1',
			viewerTimezone: 'Europe/London',
			counterpartUserId: 'u2',
			counterpartTimezone: 'America/New_York',
			counterpartName: 'Jun',
			value: 'u2'
		});

		const yourTime = screen.getByText('Your time');
		await fireEvent.click(yourTime);
		expect(container.querySelector('wa-button.selected')?.textContent).toContain('Your time');
	});
});
