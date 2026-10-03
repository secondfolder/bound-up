import { dev } from '$app/environment';
import { isStandalone, shouldOfferHomeScreen } from '$lib/home-screen';
import { deviceLabel, PUSH_DEVICE_ID_KEY } from '$lib/notifications';
import { tryFetch } from '$lib/request-failure.svelte';

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
	if (
		shouldOfferHomeScreen({
			userAgent: navigator.userAgent,
			maxTouchPoints: navigator.maxTouchPoints,
			standalone: isStandalone()
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

/**
 * Whether to suggest turning notifications on: the Home Screen app, where push
 * works, and a person who has not decided yet.
 *
 * Not decided means the permission is still at "ask" and this device has no
 * subscription. Someone who said no, or who turned notifications off on the
 * settings screen, has decided, and is not asked again. Only in the Home Screen
 * app, because that is the one place iOS offers push at all; a browser tab on
 * an iPhone gets `HomeScreenHint` instead.
 */
export function shouldSuggestPush(): boolean {
	return (
		isStandalone() &&
		pushSupport() === 'available' &&
		Notification.permission === 'default' &&
		storedPushDeviceId() === null
	);
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
 * Puts this browser's subscription back in step with the signed-in account.
 *
 * A browser can change hands without the settings screen's sign-out — the
 * session ending, `/logout`, or signing in as somebody else — and its
 * subscription still belongs to the previous account. So this asks the server
 * whose it is, on every full load of the app shell:
 *
 * - **yours:** the stored id is refreshed, in case storage lost it.
 * - **released:** it was somebody else's; the server has deleted their row,
 *   and this unsubscribes, so nothing addressed to them arrives here again.
 * - **unknown:** no account has it (pruned past the device cap, say). The
 *   stored id is dropped and the subscription kept, so turning notifications
 *   back on reuses it.
 *
 * It never registers the subscription for whoever is signed in. That used to
 * be its job, and it meant opening the settings screen on a browser somebody
 * else had subscribed quietly moved their notifications to you. The
 * permission was theirs to give, so turning on is always a tap.
 *
 * Returns this device's id when it is the signed-in account's, else null.
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

	const response = await fetch('/api/push/subscriptions/check', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ endpoint: subscription.endpoint })
	});
	if (!response.ok) {
		throw new Error(`Could not check this device's notifications (${response.status})`);
	}
	const ownership = (await response.json()) as
		| { status: 'yours'; id: string }
		| { status: 'released' | 'unknown' };

	if (ownership.status === 'yours') {
		storePushDeviceId(ownership.id);
		return ownership.id;
	}
	storePushDeviceId(null);
	if (ownership.status === 'released') {
		await subscription.unsubscribe().catch(() => false);
	}
	return null;
}

/**
 * Stops this browser receiving notifications, here and on the server.
 *
 * Called before signing out, too: a notification names a partner on the lock
 * screen, and that should stop with the session. It never throws, so a
 * network hiccup cannot block a sign-out; the server also deletes a device the
 * moment a push service reports it gone, which an unsubscribed browser now is.
 *
 * Resolves false when the server could not be told, so the settings screen can
 * say so. Sign-out ignores it: the session is going either way.
 */
export async function disablePush(): Promise<boolean> {
	const id = storedPushDeviceId();
	storePushDeviceId(null);
	try {
		const existing = await navigator.serviceWorker?.getRegistration();
		const subscription = await existing?.pushManager.getSubscription();
		await subscription?.unsubscribe();
	} catch {
		// The browser refused to unsubscribe. The server row still goes below.
	}
	if (!id) {
		return true;
	}
	const response = await tryFetch(`/api/push/subscriptions/${id}`, { method: 'DELETE' });
	// A 404 means it was already gone, which is the outcome wanted.
	return response?.ok === true || response?.status === 404;
}
