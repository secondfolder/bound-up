import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { NOTIFICATIONS_HINT_DISMISSED_KEY, PUSH_DEVICE_ID_KEY } from '$lib/notifications';
import NotificationsHint from './NotificationsHint.svelte';

vi.mock('$app/paths', () => import('$lib/testing/app-paths'));

/**
 * Who is asked to turn notifications on, decided by the real
 * `shouldSuggestPush` against this browser, with only what the test browser
 * cannot be faked: running from the Home Screen, and the permission.
 */
function asHomeScreenApp(standalone = true) {
	Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => standalone });
}

function permission(value: NotificationPermission) {
	vi.spyOn(Notification, 'permission', 'get').mockReturnValue(value);
}

async function settled() {
	await new Promise((settle) => setTimeout(settle, 20));
}

beforeEach(() => {
	localStorage.removeItem(NOTIFICATIONS_HINT_DISMISSED_KEY);
	localStorage.removeItem(PUSH_DEVICE_ID_KEY);
	asHomeScreenApp();
	permission('default');
});

afterEach(() => {
	vi.restoreAllMocks();
	Reflect.deleteProperty(navigator, 'standalone');
});

describe('NotificationsHint', () => {
	it('suggests notifications in the Home Screen app, linking to their settings', async () => {
		render(NotificationsHint);
		await vi.waitFor(() => expect(screen.getByTestId('notifications-hint')).toBeInTheDocument());
		// The mocked `resolve` hands back the route id itself, groups and all.
		expect(screen.getByRole('link', { name: 'Turn on notifications' })).toHaveAttribute(
			'href',
			'/(auth-required)/(app)/settings/notifications'
		);
	});

	/** A tab gets `HomeScreenHint` instead: push only works from the Home Screen on iOS. */
	it('says nothing in a browser tab', async () => {
		asHomeScreenApp(false);
		render(NotificationsHint);
		await settled();
		expect(screen.queryByTestId('notifications-hint')).not.toBeInTheDocument();
	});

	it.each([
		['granted', 'they turned them on, or on and off again'],
		['denied', 'they said no']
	] as const)('does not ask again once the permission is %s: %s', async (value, _why) => {
		permission(value);
		render(NotificationsHint);
		await settled();
		expect(screen.queryByTestId('notifications-hint')).not.toBeInTheDocument();
	});

	it('does not ask a device that is already subscribed', async () => {
		localStorage.setItem(PUSH_DEVICE_ID_KEY, 'd-1');
		render(NotificationsHint);
		await settled();
		expect(screen.queryByTestId('notifications-hint')).not.toBeInTheDocument();
	});
});
