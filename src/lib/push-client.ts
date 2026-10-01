import { dev } from '$app/environment';
import { shouldOfferHomeScreen } from '$lib/home-screen';
import { deviceLabel, PUSH_DEVICE_ID_KEY } from '$lib/notifications';

/**
 * Turning push notifications on and off for this browser.
 *
 * BROWSER ONLY: every function here touches `navigator`, `Notification` or
 * `localStorage`. The settings screen is the only caller apart from sign-out,
 * which forgets the device first. See docs/notifications.md.
 */

/**
 * What this browser can do, in the order the settings screen has to explain it.
 *
 * - `unsupported`: no Push API at all.
 * - `needs-install`: an iPhone or iPad in a browser tab. iOS only offers push
 *   to a site added to the Home Screen, and even exposes no `PushManager`
 *   until it is, so this is checked before `unsupported`.
 * - `denied`: the person said no, and only the system settings can undo that.
 * - `available`: a switch will work.
 */
export type PushSupport = 'unsupported' | 'needs-install' | 'denied' | 'available';

export function pushSupport(): PushSupport {
	const standalone =
		(navigator as Navigator & { standalone?: boolean }).standalone === true ||
		matchMedia('(display-mode: standalone)').matches;
	if (
		shouldOfferHomeScreen({
			userAgent: navigator.userAgent,
			maxTouchPoints: navigator.maxTouchPoints,
			standalone
		})
	) {
		return 'needs-install';
	}
	if (
		!('serviceWorker' in navigator && 'PushManager' in globalThis && 'Notification' in globalThis)
	) {
		return 'unsupported';
	}
	if (Notification.permission === 'denied') {
		return 'denied';
	}
	return 'available';
}

/** The id the server knows this browser by, if it is subscribed. */
export function storedPushDeviceId(): string | null {
	try {
		return globalThis.localStorage?.getItem(PUSH_DEVICE_ID_KEY) ?? null;
	} catch {
		// Storage refused. The only cost is the live feed not saying which
		// device is watching, so a push may arrive alongside an open board.
		return null;
	}
}

function storePushDeviceId(id: string | null): void {
	try {
		if (id) {
			globalThis.localStorage?.setItem(PUSH_DEVICE_ID_KEY, id);
		} else {
			globalThis.localStorage?.removeItem(PUSH_DEVICE_ID_KEY);
		}
	} catch {
		// See `storedPushDeviceId`.
	}
}

async function registration(): Promise<ServiceWorkerRegistration> {
	// Registered here rather than on every page load — see `serviceWorker` in
	// svelte.config.js. Re-registering an existing worker is a no-op that also
	// checks for an update. Under `vite dev` the file is served as an ES module.
	await navigator.serviceWorker.register('/service-worker.js', {
		type: dev ? 'module' : 'classic'
	});
	return await navigator.serviceWorker.ready;
}

/** The base64url VAPID key as the bytes `subscribe()` wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
	const base64 = base64url.replaceAll('-', '+').replaceAll('_', '/');
	const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function register(subscription: PushSubscription): Promise<string> {
	const response = await fetch('/api/push/subscriptions', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			...subscription.toJSON(),
			label: deviceLabel(navigator.userAgent, navigator.maxTouchPoints)
		})
	});
	if (!response.ok) {
		throw new Error(`Could not turn on notifications (${response.status})`);
	}
	const { id } = (await response.json()) as { id: string };
	storePushDeviceId(id);
	return id;
}

/**
 * Asks for permission and subscribes. Must be called straight from a click.
 *
 * `requestPermission()` comes first and before any other `await`, because
 * Safari only shows the prompt inside a user gesture, and an earlier `await`
 * can use the gesture up.
 *
 * Returns the device id, or null if the person declined.
 */
export async function enablePush(vapidPublicKey: string): Promise<string | null> {
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		return null;
	}
	const { pushManager } = await registration();
	const subscription =
		(await pushManager.getSubscription()) ??
		(await pushManager.subscribe({
			// Required, and on WebKit the only value accepted: every push must
			// show a notification. See docs/notifications.md on why that rules
			// out deciding on the device whether to show one.
			userVisibleOnly: true,
			applicationServerKey: keyBytes(vapidPublicKey)
		}));
	return await register(subscription);
}

/**
 * Re-registers an existing subscription, if there is one.
 *
 * For when this browser is subscribed but the server has lost the device or
 * the browser has lost its id — after another account used it, say. The
 * upsert on the endpoint makes this safe to call on every visit to settings.
 */
export async function resyncPush(): Promise<string | null> {
	if (pushSupport() !== 'available' || Notification.permission !== 'granted') {
		return null;
	}
	const existing = await navigator.serviceWorker.getRegistration();
	const subscription = await existing?.pushManager.getSubscription();
	if (!subscription) {
		storePushDeviceId(null);
		return null;
	}
	return await register(subscription);
}

/**
 * Stops this browser receiving notifications, here and on the server.
 *
 * Called before signing out, too: a notification names a partner on the lock
 * screen, and that should stop with the session. It never throws, so a
 * network hiccup cannot block a sign-out; the server also deletes a device the
 * moment a push service reports it gone.
 */
export async function disablePush(): Promise<void> {
	const id = storedPushDeviceId();
	storePushDeviceId(null);
	try {
		const existing = await navigator.serviceWorker?.getRegistration();
		const subscription = await existing?.pushManager.getSubscription();
		await subscription?.unsubscribe();
		if (id) {
			await fetch(`/api/push/subscriptions/${id}`, { method: 'DELETE' });
		}
	} catch (error) {
		console.warn('could not fully turn off notifications', error);
	}
}
