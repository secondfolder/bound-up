import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { waButtonOfType, waSettled } from '$lib/testing/web-awesome';
import DebugInfo from './DebugInfo.svelte';

const props = {
	version: '1.2.3',
	userId: 'user-1',
	accountTimezone: 'Australia/Melbourne',
	features: ['debugMode', 'daydreams'] as const
};

describe('DebugInfo', () => {
	it('lists what the account and this device say about themselves', () => {
		render(DebugInfo, props);
		const panel = screen.getByRole('region', { name: 'Debug info' });
		expect(panel).toHaveTextContent('Version 1.2.3');
		expect(panel).toHaveTextContent('User id user-1');
		expect(panel).toHaveTextContent('Account timezone Australia/Melbourne');
		expect(panel).toHaveTextContent('Features debugMode, daydreams');
		expect(panel).toHaveTextContent('Keyring unknown');
		expect(panel).toHaveTextContent(
			`Device timezone ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
		);
		expect(panel).toHaveTextContent(`User agent ${navigator.userAgent}`);
	});

	it('copies every line as plain text', async () => {
		const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
		try {
			const { container } = render(DebugInfo, props);
			await waSettled(container);
			waButtonOfType(container, 'button').click();
			await expect.poll(() => writeText.mock.calls.length).toBe(1);
			const text = writeText.mock.calls[0]?.[0] ?? '';
			expect(text).toContain('Version: 1.2.3');
			expect(text).toContain('User id: user-1');
			expect(text).toContain('Keyring: unknown');
			expect(await screen.findByRole('status')).toHaveTextContent('Copied.');
		} finally {
			writeText.mockRestore();
		}
	});
});
