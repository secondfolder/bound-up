/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { parsePushPayload } from '$lib/notifications';

/**
 * Shows push notifications. Nothing else, and that is deliberate.
 *
 * **No `fetch` handler and no caching.** An offline cache is a separate
 * decision with failure modes of its own — a stale build served after a
 * deploy, say — and nothing about notifications needs one. Without a `fetch`
 * listener the browser never routes a request through this file.
 *
 * On Safari 18.4+ a push in the Declarative Web Push format is shown by the
 * system without waking this at all. This is the path for every other browser
 * (and older Safari), and it reads the same JSON. See docs/notifications.md.
 */

const sw = globalThis as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => {
	// Nothing to wait for: no cache to fill. Taking over at once means the first
	// push after turning notifications on is handled by this version.
	void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(sw.clients.claim());
});

sw.addEventListener('push', (event) => {
	let data: unknown = null;
	try {
		data = event.data?.json();
	} catch {
		// Unreadable is still a notification. On WebKit a push that shows nothing
		// gets the subscription revoked, so `parsePushPayload` falls back to a
		// generic one rather than this returning early.
	}
	const { title, navigate, ...options } = parsePushPayload(data);
	event.waitUntil(sw.registration.showNotification(title, { ...options, data: { navigate } }));
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const navigate: unknown = event.notification.data?.navigate;
	const target = new URL(typeof navigate === 'string' ? navigate : '/home', sw.location.origin);
	// Never leave the app's own origin, whatever a payload says.
	const url = target.origin === sw.location.origin ? target.href : `${sw.location.origin}/home`;

	event.waitUntil(
		(async () => {
			const [open] = await sw.clients.matchAll({ type: 'window' });
			if (open) {
				try {
					await open.focus();
					// Only a window this worker controls can be navigated, and `claim()`
					// in `activate` is what makes an already-open one count.
					await open.navigate(url);
					return;
				} catch {
					// Not ours to steer after all; a new window does the job.
				}
			}
			await sw.clients.openWindow(url);
		})()
	);
});
