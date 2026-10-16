/**
 * The sealed kinds a partnership's messages are made of: the body, its
 * metadata sidecar, and a reaction. See `../sealed.ts` for what a kind is and
 * the rules every version follows.
 *
 * The server reads the size caps and known versions from here.
 */

import { z } from 'zod';
import { type CachedEmbedDetails, withSafeUrls } from '../embeds';
import {
	MAX_ATTACHMENTS_PER_MESSAGE,
	MAX_CIPHERTEXT_BYTES,
	MAX_REACTION_CIPHERTEXT_BYTES
} from '../messaging';
import { defineSealedKind } from '../sealed';

/**
 * One attachment's entry in a message body. `key` is the ephemeral age
 * identity the file in the object store was encrypted under — the
 * indirection that lets a key change touch only bodies, never the files.
 */
const attachmentInfo = z.object({
	id: z.string().min(1).max(100),
	key: z.string().startsWith('AGE-SECRET-KEY-1').max(200),
	kind: z.enum(['image', 'video']),
	mimeType: z.string().max(255),
	fileName: z.string().max(255)
});

/**
 * A message body: the rich-text document, as its stored JSON string, and the
 * attachment manifest. The document is parsed where it is drawn
 * (`parseStoredRichText`), which validates it then; here it is only bounded.
 */
export const messageBodyKind = defineSealedKind({
	name: 'message',
	maxCiphertextLength: MAX_CIPHERTEXT_BYTES,
	versions: [
		{
			version: 1,
			schema: z.object({
				text: z.string().max(MAX_CIPHERTEXT_BYTES),
				attachments: z.array(attachmentInfo).max(MAX_ATTACHMENTS_PER_MESSAGE)
			})
		}
	]
});

export type MessageBody = z.output<typeof messageBodyKind.latest>;
export type MessageAttachment = z.output<typeof attachmentInfo>;

const url = z.string().max(2048).nullable();

/**
 * One cached embed. Every URL field goes through `withSafeUrls` on the way
 * out: the sender's client wrote these, not this app's server, so an
 * `iframeSrc` of `javascript:…` has to be dropped here, by every reader.
 */
const cachedEmbed = z
	.object({
		href: z.string().max(2048),
		fetchedAt: z.number(),
		kind: z.enum(['image', 'iframe', 'card']),
		providerName: z.string().max(200).nullable(),
		title: z.string().max(1000).nullable(),
		description: z.string().max(4000).nullable(),
		thumbnailUrl: url,
		canonicalUrl: url,
		imageUrl: url,
		iframeSrc: url,
		iframeHeight: z.number().nullable(),
		faviconUrl: url,
		themeColor: z.string().max(64).nullable()
	})
	.transform((details): CachedEmbedDetails => withSafeUrls(details));

/** The sidecar: details resolved from the body's links, cached so readers need not look them up. */
export const messageMetadataKind = defineSealedKind({
	name: 'message-metadata',
	maxCiphertextLength: MAX_CIPHERTEXT_BYTES,
	versions: [{ version: 1, schema: z.object({ embeds: z.array(cachedEmbed).max(50) }) }]
});

export type MessageMetadata = z.output<typeof messageMetadataKind.latest>;

/** A tapback: one emoji. */
export const messageReactionKind = defineSealedKind({
	name: 'message-reaction',
	maxCiphertextLength: MAX_REACTION_CIPHERTEXT_BYTES,
	versions: [{ version: 1, schema: z.object({ emoji: z.string().min(1).max(64) }) }]
});

export type MessageReaction = z.output<typeof messageReactionKind.latest>;
