import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { waProp, waSettled } from '$lib/testing/web-awesome';
import NotificationSettings from './NotificationSettings.svelte';

/**
 * Which state the screen shows comes from `$lib/push-client`, which reads the
 * real browser — so it is mocked here, and each test says what kind of browser
 * it is. The real detection is pinned by `home-screen.test.ts` and the e2e
 * suite.
 */
const client = vi.hoisted(() => ({
	pushSupport: vi.fn(),
	enablePush: vi.fn(),
	disablePush: vi.fn(),
	resyncPush: vi.fn(),
	storedPushDeviceId: vi.fn()
}));
vi.mock('$lib/push-client', () => client);

const KEY = 'BPublicKey';
const phone = {
	id: 'd-phone',
	label: 'Safari on iPhone',
	notifyMessages: true,
	notifyReactions: false
};
const laptop = {
	id: 'd-laptop',
	label: 'Chrome on Mac',
	notifyMessages: true,
	notifyReactions: true
};

beforeEach(() => {
	client.pushSupport.mockReturnValue('available');
	client.storedPushDeviceId.mockReturnValue(null);
	client.resyncPush.mockResolvedValue(null);
	client.enablePush.mockResolvedValue('d-phone');
	client.disablePush.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('NotificationSettings', () => {
	it('says so when the server has no keys, and offers nothing', async () => {
		render(NotificationSettings, { vapidPublicKey: null, devices: [], onchange: vi.fn() });
		expect(await screen.findByTestId('push-unconfigured')).toBeInTheDocument();
		expect(screen.queryByTestId('push-turn-on')).not.toBeInTheDocument();
	});

	it.each([
		['needs-install', 'push-needs-install'],
		['unsupported', 'push-unsupported'],
		['denied', 'push-denied']
	])('explains a browser that is %s instead of offering the switch', async (support, testId) => {
		client.pushSupport.mockReturnValue(support);
		render(NotificationSettings, { vapidPublicKey: KEY, devices: [], onchange: vi.fn() });
		expect(await screen.findByTestId(testId)).toBeInTheDocument();
		expect(screen.queryByTestId('push-turn-on')).not.toBeInTheDocument();
	});

	it('turns notifications on from a click, then reloads the device list', async () => {
		const onchange = vi.fn();
		const { container } = render(NotificationSettings, {
			vapidPublicKey: KEY,
			devices: [],
			onchange
		});
		const button = await screen.findByTestId('push-turn-on');
		await waSettled(container);
		button.click();

		await vi.waitFor(() => expect(onchange).toHaveBeenCalled());
		expect(client.enablePush).toHaveBeenCalledWith(KEY);
	});

	it('marks this device, and turns it off rather than merely removing the row', async () => {
		client.storedPushDeviceId.mockReturnValue('d-phone');
		client.resyncPush.mockResolvedValue('d-phone');
		const onchange = vi.fn();
		const { container } = render(NotificationSettings, {
			vapidPublicKey: KEY,
			devices: [phone, laptop],
			onchange
		});
		await vi.waitFor(() => expect(screen.getByText('This device')).toBeInTheDocument());
		expect(screen.queryByTestId('push-turn-on')).not.toBeInTheDocument();
		await waSettled(container);

		const [phoneRow] = screen.getAllByTestId('push-device');
		const turnOff = phoneRow?.querySelector('wa-button') as HTMLElement;
		expect(turnOff).toHaveTextContent('Turn off');
		turnOff.click();

		await vi.waitFor(() => expect(client.disablePush).toHaveBeenCalled());
		await vi.waitFor(() => expect(onchange).toHaveBeenCalled());
	});

	/** The browser has no subscription any more, whatever the stored id says. */
	it('offers the switch again when the browser is no longer subscribed', async () => {
		client.storedPushDeviceId.mockReturnValue('d-phone');
		client.resyncPush.mockResolvedValue(null);
		render(NotificationSettings, { vapidPublicKey: KEY, devices: [phone], onchange: vi.fn() });
		expect(await screen.findByTestId('push-turn-on')).toBeInTheDocument();
		expect(screen.queryByText('This device')).not.toBeInTheDocument();
	});

	it('shows each device’s categories and saves a change', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
		vi.stubGlobal('fetch', fetchMock);
		const { container } = render(NotificationSettings, {
			vapidPublicKey: KEY,
			devices: [phone],
			onchange: vi.fn()
		});
		await waSettled(container);

		const [messages, reactions] = container.querySelectorAll('wa-switch');
		expect(waProp(messages, 'checked')).toBe(true);
		expect(waProp(reactions, 'checked')).toBe(false);

		(reactions as HTMLElement & { checked: boolean }).checked = true;
		reactions?.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

		await vi.waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/api/push/subscriptions/d-phone', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ notifyReactions: true })
			})
		);
	});
});
