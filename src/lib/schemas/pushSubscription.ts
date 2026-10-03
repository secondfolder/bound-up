import { z } from 'zod';
import { isKnownPushService } from '$lib/notifications';

/**
 * A browser's `PushSubscription.toJSON()`, plus the label it names itself by.
 *
 * Shared by the subscribe endpoint and the settings screen. Not a superforms
 * schema, because there is no form: the subscription only exists after
 * `pushManager.subscribe()` runs in the browser, so it is posted by hand, the
 * way message sends are.
 */
const endpointSchema = z
	.string()
	.max(1024, 'Malformed push endpoint')
	.refine(isKnownPushService, 'Not a push service this server sends to');

export const pushSubscribeSchema = z.object({
	endpoint: endpointSchema,
	keys: z.object({
		// A base64url P-256 point (65 bytes → 87 characters) and a 16-byte
		// secret (22). The ceilings only stop a junk row; the exact check is the
		// encryption, which fails loudly on a wrong-sized key.
		p256dh: z
			.string()
			.regex(/^[A-Za-z0-9_-]+=*$/, 'Malformed push key')
			.max(128),
		auth: z
			.string()
			.regex(/^[A-Za-z0-9_-]+=*$/, 'Malformed push key')
			.max(64)
	}),
	label: z.string().trim().min(1).max(60)
});

export type PushSubscribeInput = z.output<typeof pushSubscribeSchema>;

/** Turning one category on or off for one device. */
export const pushDeviceUpdateSchema = z
	.object({
		notifyMessages: z.boolean(),
		notifyReactions: z.boolean()
	})
	.partial()
	.refine((changes) => Object.keys(changes).length > 0, 'Nothing to change');

/** Asking whose this browser's subscription is. See `checkPushOwnership`. */
export const pushOwnershipSchema = z.object({ endpoint: endpointSchema });
