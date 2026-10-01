import { buildPushPayload, type VapidKeys } from '@block65/webcrypto-web-push';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { env as privateEnv } from '$env/dynamic/private';
import {
	buildPushContent,
	CATEGORY_OF,
	MAX_PUSH_DEVICES,
	type PushCategory,
	type PushKind
} from '$lib/notifications';
import type { PartnershipView } from '$lib/partnership';
import type { Db } from './db';
import { pushSubscriptions } from './db/schema';
import type { Watcher } from './realtime';

/**
 * Web Push: storing devices and sending to them. See docs/notifications.md.
 *
 * Standard Web Push (RFC 8030), with payloads encrypted to each device
 * (RFC 8291) and signed with this server's VAPID key (RFC 8292). That one
 * protocol reaches Apple, Google and Mozilla alike, and it needs nothing beyond
 * an outbound `fetch`: no APNs certificate, no Apple developer account, and on
 * Workers nothing outside the Free plan. A push is a subrequest, which does not
 * count against the daily request allowance.
 */

/** Our VAPID key pair, and who to contact about it. */
export type VapidConfig = {
	/** Uncompressed P-256 point, base64url. Also what browsers subscribe with. */
	publicKey: string;
	/** The private scalar `d`, base64url. */
	privateKey: string;
	/** `mailto:` or `https:`, sent to push services in the signed token. */
	subject: string;
};

/**
 * The server's VAPID keys, or null when push is not set up here.
 *
 * Optional rather than a startup failure like `BETTER_AUTH_SECRET`, because a
 * self-hosted instance upgraded from before push existed would otherwise stop
 * starting. Without them the settings screen says notifications are not
 * available on this server, and nothing is sent.
 */
export function readVapidConfig(platform: App.Platform | undefined): VapidConfig | null {
	const publicKey = platform?.env?.VAPID_PUBLIC_KEY ?? privateEnv.VAPID_PUBLIC_KEY;
	const privateKey = platform?.env?.VAPID_PRIVATE_KEY ?? privateEnv.VAPID_PRIVATE_KEY;
	const subject = platform?.env?.VAPID_SUBJECT ?? privateEnv.VAPID_SUBJECT;
	if (!(publicKey && privateKey && subject)) {
		return null;
	}
	return { publicKey, privateKey, subject };
}

// ── devices ──────────────────────────────────────────────────────────────────

/** A device as the settings screen sees it. Never the endpoint: it is a capability. */
export type PushDevice = {
	id: string;
	label: string;
	notifyMessages: boolean;
	notifyReactions: boolean;
	createdAt: Date;
	lastSuccessAt: Date | null;
};

const deviceColumns = {
	id: pushSubscriptions.id,
	label: pushSubscriptions.label,
	notifyMessages: pushSubscriptions.notifyMessages,
	notifyReactions: pushSubscriptions.notifyReactions,
	createdAt: pushSubscriptions.createdAt,
	lastSuccessAt: pushSubscriptions.lastSuccessAt
} as const;

export async function listPushDevices(db: Db, userId: string): Promise<PushDevice[]> {
	return await db
		.select(deviceColumns)
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.userId, userId))
		.orderBy(pushSubscriptions.createdAt, pushSubscriptions.id);
}

/**
 * Records a browser's subscription for `userId`, and returns its id.
 *
 * Keyed on the endpoint, so a browser subscribing again is an update rather
 * than a second row that would show every notification twice. That includes a
 * *different* account subscribing on the same browser: the device moves to
 * them, which is right, because a browser shows notifications to whoever is
 * holding it and the previous account has signed out of it.
 */
export async function savePushSubscription(
	db: Db,
	userId: string,
	input: { endpoint: string; p256dh: string; auth: string; label: string }
): Promise<string> {
	const [row] = await db
		.insert(pushSubscriptions)
		.values({ userId, ...input })
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: {
				userId,
				p256dh: input.p256dh,
				auth: input.auth,
				label: input.label,
				updatedAt: new Date()
			}
		})
		.returning({ id: pushSubscriptions.id });
	if (!row) {
		throw new Error('Saving a push subscription returned no row');
	}

	// Past the cap, the oldest devices go. Most likely they are browsers that
	// were cleared or uninstalled without the push service saying so yet.
	// Sliced here rather than with OFFSET: it is never more than one row past
	// the cap, and SQLite only accepts OFFSET after a LIMIT.
	const others = await db
		.select({ id: pushSubscriptions.id })
		.from(pushSubscriptions)
		.where(and(eq(pushSubscriptions.userId, userId), ne(pushSubscriptions.id, row.id)))
		.orderBy(desc(pushSubscriptions.createdAt), desc(pushSubscriptions.id));
	const overflow = others.slice(MAX_PUSH_DEVICES - 1);
	if (overflow.length > 0) {
		await db.delete(pushSubscriptions).where(
			inArray(
				pushSubscriptions.id,
				overflow.map((device) => device.id)
			)
		);
	}
	return row.id;
}

/** Turns one category on or off for one of the user's own devices. */
export async function updatePushDevice(
	db: Db,
	userId: string,
	id: string,
	changes: Partial<Pick<PushDevice, 'notifyMessages' | 'notifyReactions'>>
): Promise<boolean> {
	const rows = await db
		.update(pushSubscriptions)
		.set(changes)
		.where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)))
		.returning({ id: pushSubscriptions.id });
	return rows.length > 0;
}

/** Forgets one of the user's own devices. False if it was not theirs. */
export async function deletePushDevice(db: Db, userId: string, id: string): Promise<boolean> {
	const rows = await db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)))
		.returning({ id: pushSubscriptions.id });
	return rows.length > 0;
}

// ── sending ──────────────────────────────────────────────────────────────────

const categoryColumn = {
	messages: pushSubscriptions.notifyMessages,
	reactions: pushSubscriptions.notifyReactions
} satisfies Record<PushCategory, unknown>;

/**
 * How long a push service keeps trying to deliver to a device that is off.
 *
 * A day: long enough for a phone left off overnight, short enough that nobody
 * gets a pile of stale "new message" banners after a week away.
 */
const PUSH_TTL_SECONDS = 24 * 60 * 60;

export type PushOutcome = { sent: number; removed: number; failed: number };

/**
 * Sends one event's notification to every device of `userId` that wants it.
 *
 * Never throws, for the reason `Notifier.publish` never does: the write it
 * follows has already committed. A device the push service says is gone (404
 * or 410, which is what an uninstalled app or revoked permission looks like) is
 * deleted, since nothing will ever reach it again.
 *
 * `fetch` is a parameter so the tests can stand in for the push service.
 */
export async function sendPush(
	db: Db,
	vapid: VapidConfig,
	input: {
		userId: string;
		kind: PushKind;
		partnerName: string;
		threadId: string;
		url: string;
		/** Devices already watching the board, which do not need telling. */
		skipDeviceIds?: readonly string[];
	},
	fetchImpl: typeof fetch = fetch
): Promise<PushOutcome> {
	const outcome: PushOutcome = { sent: 0, removed: 0, failed: 0 };
	try {
		const devices = await db
			.select({
				id: pushSubscriptions.id,
				endpoint: pushSubscriptions.endpoint,
				p256dh: pushSubscriptions.p256dh,
				auth: pushSubscriptions.auth
			})
			.from(pushSubscriptions)
			.where(
				and(
					eq(pushSubscriptions.userId, input.userId),
					eq(categoryColumn[CATEGORY_OF[input.kind]], true)
				)
			);

		const skip = new Set(input.skipDeviceIds);
		const targets = devices.filter((device) => !skip.has(device.id));
		if (targets.length === 0) {
			return outcome;
		}

		const content = buildPushContent(input);
		const keys: VapidKeys = vapid;
		const gone: string[] = [];
		const delivered: string[] = [];

		await Promise.all(
			targets.map(async (device) => {
				try {
					const request = await buildPushPayload(
						{
							data: content.payload,
							options: {
								ttl: PUSH_TTL_SECONDS,
								urgency: content.urgency,
								...(content.topic && { topic: content.topic })
							}
						},
						{
							endpoint: device.endpoint,
							expirationTime: null,
							keys: { p256dh: device.p256dh, auth: device.auth }
						},
						keys
					);
					const response = await fetchImpl(device.endpoint, request);
					if (response.status === 404 || response.status === 410) {
						gone.push(device.id);
					} else if (response.ok) {
						delivered.push(device.id);
					} else {
						// Logged with the status only. The endpoint is a capability, and
						// the response body can echo it back.
						console.error(`push service refused a notification: ${response.status}`);
						outcome.failed += 1;
					}
				} catch (error) {
					console.error('could not send a push notification', error);
					outcome.failed += 1;
				}
			})
		);

		// Two statements at most, whatever the device count. D1 bills per query.
		if (gone.length > 0) {
			await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
		}
		if (delivered.length > 0) {
			await db
				.update(pushSubscriptions)
				.set({ lastSuccessAt: new Date() })
				.where(inArray(pushSubscriptions.id, delivered));
		}
		outcome.removed = gone.length;
		outcome.sent = delivered.length;
	} catch (error) {
		console.error('could not send push notifications', error);
	}
	return outcome;
}

/**
 * The devices to leave out because they are watching already.
 *
 * Only `recipientId`'s own: the user id on a watcher comes from the session,
 * so this cannot be steered by anything the other member sends.
 *
 * Deliberately per device rather than per person. Someone with the board open
 * on a laptop is not looking at their phone, so the phone still gets told.
 */
export function watchingDevices(watching: readonly Watcher[], recipientId: string): string[] {
	return watching.flatMap((watcher) =>
		watcher.userId === recipientId && watcher.deviceId ? [watcher.deviceId] : []
	);
}

/**
 * Lets a push finish after the response has gone.
 *
 * On Workers that is `ctx.waitUntil`, which keeps the invocation alive for up
 * to 30 seconds without holding the sender's request open on a round trip to
 * Apple. The Node builds have no such limit: the promise simply runs.
 * `sendPush` never rejects, so a floating promise here cannot become an
 * unhandled rejection.
 */
export function inBackground(platform: App.Platform | undefined, task: Promise<unknown>): void {
	platform?.ctx?.waitUntil(task);
}

/**
 * Tells the other member of a partnership that something happened, by push,
 * unless push is off here or they are already watching on that device.
 *
 * Called by the send and reaction endpoints right after `notifier.publish`,
 * whose return value is `watching`. Returns at once: the sending is handed to
 * `inBackground`.
 *
 * The name comes from the *sender's* view of the partnership, and that is
 * correct rather than backwards: `yourName` is "what the other person calls
 * the viewer", and the other person is exactly who is being notified. It still
 * goes through `viewPartnership()` like every other name, never the raw
 * columns.
 */
export function notifyPartner(
	event: { locals: App.Locals; platform?: App.Platform | undefined; url: URL },
	input: {
		partnership: PartnershipView;
		kind: PushKind;
		threadId: string;
		watching: readonly Watcher[];
	}
): void {
	const vapid = readVapidConfig(event.platform);
	const recipientId = input.partnership.counterpart?.userId;
	if (!(vapid && recipientId)) {
		return;
	}
	// Absolute, because a tap can open it from outside any page. The app has no
	// `paths.base`, and `resolve()` can return a path relative to the page being
	// rendered, which is meaningless to a notification.
	const url = new URL(
		`/partner/${input.partnership.id}/messages/${input.threadId}`,
		event.url.origin
	).href;
	inBackground(
		event.platform,
		sendPush(event.locals.db, vapid, {
			userId: recipientId,
			kind: input.kind,
			partnerName: input.partnership.yourName,
			threadId: input.threadId,
			url,
			skipDeviceIds: watchingDevices(input.watching, recipientId)
		})
	);
}
