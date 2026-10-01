/**
 * Push notifications: what one says, and the rules that decide it.
 *
 * Pure and shared. The server builds payloads with it, the service worker
 * reads them with it, and the settings screen names devices with it. See
 * docs/notifications.md.
 *
 * **A notification never carries content.** The server could not include a
 * message's text even if it wanted to, because it only ever holds ciphertext.
 * What it can say is who and what kind, and the lock screen is the one place
 * this app is visible to whoever picks the phone up. So the copy is the
 * partner's name and a verb, and nothing more.
 */

/** A kind of notification a device can turn off on its own. */
export type PushCategory = 'messages' | 'reactions';

/** What happened, as far as a notification is allowed to know. */
export type PushKind = 'thread' | 'message' | 'reaction';

export const CATEGORY_OF: Record<PushKind, PushCategory> = {
	thread: 'messages',
	message: 'messages',
	reaction: 'reactions'
};

/**
 * A Declarative Web Push message (WebKit, Safari 18.4+).
 *
 * The magic `web_push: 8030` key (RFC 8030's number) is what tells Safari it
 * can show this itself, without waking a service worker, which is the most
 * reliable delivery iOS has. Every other browser hands the same JSON to our
 * service worker, which shows it the same way (`src/service-worker.ts`). One
 * format, so there is no per-browser branch on the server.
 */
export type DeclarativePush = {
	web_push: 8030;
	notification: {
		title: string;
		body?: string;
		/** Absolute URL opened on tap. Required by WebKit. */
		navigate: string;
		/** A later notification with the same tag replaces this one on screen. */
		tag?: string;
		lang?: string;
	};
};

export type PushContent = {
	payload: DeclarativePush;
	/**
	 * RFC 8030 `Topic`: a message still waiting at the push service is
	 * replaced by a newer one with the same topic, so a phone that was off
	 * during a burst of replies wakes to one notification rather than ten.
	 */
	topic?: string;
	urgency: 'high' | 'normal';
};

/**
 * The notification for one event.
 *
 * `partnerName` is what the *recipient* calls the sender, which is why the
 * caller passes it rather than this reading names off a partnership row.
 */
export function buildPushContent(input: {
	kind: PushKind;
	partnerName: string;
	threadId: string;
	/** Where a tap goes: the thread, as an absolute URL. */
	url: string;
}): PushContent {
	const { kind, partnerName, threadId, url } = input;
	if (kind === 'reaction') {
		return {
			payload: {
				web_push: 8030,
				notification: {
					title: `${partnerName} reacted to your message`,
					navigate: url,
					// Tagged apart from messages, so a reaction never hides a message
					// notification that has not been read yet.
					tag: `reaction-${threadId}`,
					lang: 'en'
				}
			},
			// No topic: one would let a reaction replace an undelivered message.
			urgency: 'normal'
		};
	}
	return {
		payload: {
			web_push: 8030,
			notification: {
				title: `New message from ${partnerName}`,
				navigate: url,
				tag: `thread-${threadId}`,
				lang: 'en'
			}
		},
		topic: pushTopic(threadId),
		urgency: 'high'
	};
}

/**
 * A thread id as an RFC 8030 topic.
 *
 * Topics are at most 32 characters from the URL-safe base64 alphabet. A UUID
 * is 36 with its hyphens and exactly 32 without, all hex.
 */
export function pushTopic(threadId: string): string {
	return threadId.replaceAll('-', '').slice(0, 32);
}

/**
 * Reads a push payload back, in the service worker.
 *
 * Defensive because it is the one place a malformed push would otherwise throw
 * — and on WebKit a push that shows nothing gets the subscription revoked, so
 * even a payload we cannot read must still produce a notification.
 */
export function parsePushPayload(data: unknown): DeclarativePush['notification'] {
	const fallback = { title: 'Something new in Bound Up', navigate: '/home' };
	if (typeof data !== 'object' || data === null) {
		return fallback;
	}
	const { notification } = data as { notification?: unknown };
	if (typeof notification !== 'object' || notification === null) {
		return fallback;
	}
	const { title, body, navigate, tag, lang } = notification as Record<string, unknown>;
	if (typeof title !== 'string' || typeof navigate !== 'string') {
		return fallback;
	}
	return {
		title,
		navigate,
		...(typeof body === 'string' && { body }),
		...(typeof tag === 'string' && { tag }),
		...(typeof lang === 'string' && { lang })
	};
}

/** First match wins, so the order matters: every Chromium says Safari and Edge says Chrome. */
const BROWSERS: [RegExp, string][] = [
	[/\bEdg(?:e|A|iOS)?\//, 'Edge'],
	[/\b(?:Firefox|FxiOS)\//, 'Firefox'],
	[/\b(?:Chrome|CriOS)\//, 'Chrome'],
	[/\bSafari\//, 'Safari']
];

const DEVICES: [RegExp, string][] = [
	[/\biPhone\b/, 'iPhone'],
	[/\biPad\b/, 'iPad'],
	[/\bAndroid\b/, 'Android'],
	[/\bMacintosh\b/, 'Mac'],
	[/\bWindows\b/, 'Windows'],
	[/\b(?:Linux|CrOS)\b/, 'Linux']
];

/**
 * A rough name for a device, so the settings list reads "Safari on iPhone"
 * rather than a push service URL.
 *
 * Only a label: nothing decides anything from it.
 */
export function deviceLabel(userAgent: string, maxTouchPoints = 0): string {
	const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
	let device = DEVICES.find(([pattern]) => pattern.test(userAgent))?.[1];
	// iPadOS asks for the desktop site and says it is a Mac; a Mac has no touch
	// screen. The same test `home-screen.ts` makes.
	if (device === 'Mac' && maxTouchPoints > 1) {
		device = 'iPad';
	}

	if (browser && device) {
		return `${browser} on ${device}`;
	}
	return device ?? browser ?? 'Unknown device';
}

/**
 * This device's push subscription id, as the server assigned it.
 *
 * Kept in `localStorage` so the live feed can tell the server which device is
 * watching (see `live.ts`). A convenience: if it is lost, the only cost is a
 * push arriving on a device that already had the board open.
 */
export const PUSH_DEVICE_ID_KEY = 'bound-up:push-device-id';

/**
 * Push services this server will send to.
 *
 * The server POSTs to whatever endpoint a browser registers, so an open list
 * would let any account point it at an arbitrary URL — on a self-hosted box,
 * possibly one on the private network. Every browser that supports Web Push
 * hands out an endpoint on one of these: Apple for Safari, FCM for Chrome and
 * everything built on it, Mozilla for Firefox, and WNS for Edge on Windows.
 */
const PUSH_SERVICE_HOSTS = [
	/^web\.push\.apple\.com$/,
	/^fcm\.googleapis\.com$/,
	/^updates\.push\.services\.mozilla\.com$/,
	/^[a-z0-9-]+\.notify\.windows\.com$/
];

export function isKnownPushService(endpoint: string): boolean {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}
	return (
		url.protocol === 'https:' &&
		url.port === '' &&
		PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname))
	);
}

/**
 * Devices one account may have.
 *
 * A message fans out to every device in one request, and on the Workers Free
 * plan an invocation gets 50 subrequests. Far more than anyone has, and far
 * below that limit. Subscribing past it replaces the oldest device.
 */
export const MAX_PUSH_DEVICES = 10;
