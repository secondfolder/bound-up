import { and, asc, desc, eq, gt, inArray, lt, ne, or, sql } from 'drizzle-orm';
import { attachmentBudget } from '../media-quality';
import {
	BOARD_LIMIT,
	isThreadIcon,
	isUnreadFor,
	MAX_ATTACHMENT_TOTAL_BYTES,
	MAX_ATTACHMENTS_PER_MESSAGE,
	MAX_CIPHERTEXT_BYTES,
	MAX_REACTION_CIPHERTEXT_BYTES,
	MEDIA_TTL_MAX_MS,
	MEDIA_TTL_MIN_MS,
	MEDIA_TTL_NEVER,
	type MediaTtl,
	RESTORE_PAGE_SIZE,
	seenMessageId,
	type ThreadIcon,
	UNSEEN_MEDIA_MESSAGE_LIMIT
} from '../messaging';
import type { PartnershipView } from '../partnership';
import {
	messageBodyKind,
	messageMetadataKind,
	messageReactionKind
} from '../sealed-kinds/messages';
import { tagKind } from '../sealed-kinds/tags';
import type {
	MessageBodyRef,
	MessageView,
	PartnerMessagesWidgetView,
	PartnerView,
	RestoreRequestView,
	TagView,
	ThreadStickerView,
	ThreadView,
	UnreadPartnerView,
	UnseenMediaView
} from '../types';
import type { Db } from './db';
import {
	accountRecoveryRequests,
	historyRestoreRequests,
	messageAttachments,
	messageReactions,
	messages,
	messageTags,
	messageThreads,
	messageThreadTags,
	partnerships,
	threadReads,
	vaultEscrowRelays,
	vaultWraps
} from './db/schema';
import { listUserFeatures } from './features';
import { attachmentKey, MEDIA_LIFETIMES, type MediaStore, partnershipMediaPrefix } from './media';
import { getPartnershipForUser } from './partnerships';
import { partnershipVaultIdFor, sealedIsAcceptable, sealedRef } from './sealed-content';
import { escrowForRequester } from './vaults';

/**
 * Every database access for messaging.
 *
 * Membership is never re-derived in here. Every entry point goes through
 * `requireMembership`, which is a thin wrapper over `getPartnershipForUser` in
 * `server/partnerships.ts` — so there is exactly one definition of "am I in
 * this?", and a route can 404 on a null without a second check.
 *
 * The server handles ciphertext and never inspects it. The single exception is
 * `icon`, which is plaintext because the board must render before any key is
 * unlocked; every write path re-validates it against the closed list, because a
 * free-text plaintext column reachable from the network would be a covert
 * channel (AGENTS.md invariant 14).
 */

// ── column lists ─────────────────────────────────────────────────────────────

/** Only what a sticker needs. D1 bills on bytes read, and `ciphertext` is big. */
const threadStickerColumns = {
	id: messageThreads.id,
	icon: messageThreads.icon,
	lastMessageAt: messageThreads.lastMessageAt,
	lastMessageSenderId: messageThreads.lastMessageSenderId,
	lastFullyReadAt: threadReads.lastFullyReadAt,
	lastReadMessageAt: threadReads.lastReadMessageAt
} as const;

/** Everything needed to open a body under either scheme. See `MessageBodyRef`. */
const bodyRefColumns = {
	id: messages.id,
	ciphertext: messages.ciphertext,
	vaultId: messages.vaultId,
	payloadVersion: messages.payloadVersion,
	metadataCiphertext: messages.metadataCiphertext,
	metadataVersion: messages.metadataVersion
} as const;

const messageColumns = {
	...bodyRefColumns,
	senderId: messages.senderId,
	createdAt: messages.createdAt
} as const;

type BodyRefRow = {
	id: string;
	ciphertext: string;
	vaultId: string | null;
	payloadVersion: number | null;
	metadataCiphertext: string | null;
	metadataVersion: number | null;
};

function toBodyRef(row: BodyRefRow): MessageBodyRef {
	return {
		id: row.id,
		ciphertext: row.ciphertext,
		vaultId: row.vaultId ?? null,
		payloadVersion: row.payloadVersion ?? null,
		metadataCiphertext: row.metadataCiphertext ?? null,
		metadataVersion: row.metadataVersion ?? null
	};
}

/** The id of a thread's first message, for the board preview. */
const previewMessageId = sql<string>`(
	select ${messages.id}
	from ${messages}
	where ${messages.threadId} = ${messageThreads.id}
	order by ${messages.createdAt} asc, ${messages.id} asc
	limit 1
)`;

// ── membership ───────────────────────────────────────────────────────────────

export type Membership = {
	partnership: PartnershipView;
	viewerId: string;
};

/**
 * The gate every public function here goes through.
 *
 * Returns null rather than throwing, so a route reads `if (!m) error(404)`.
 * 404 and not 403, matching the existing partner routes: distinguishing them
 * would confirm the id is real.
 *
 * Pending partnerships are refused — there is nobody to message yet, and no
 * second recipient to encrypt to.
 */
export async function requireMembership(
	db: Db,
	partnershipId: string,
	userId: string
): Promise<Membership | null> {
	const partnership = await getPartnershipForUser(db, partnershipId, userId);
	if (partnership?.status !== 'accepted') {
		return null;
	}
	return { partnership, viewerId: userId };
}

/**
 * As above, and also proves the thread belongs to that partnership.
 *
 * The partnership id from the URL is re-joined against the thread rather than
 * trusted. Without that, anyone who is in *any* partnership could read any
 * thread by putting their own partnership id in the path — a confused deputy,
 * and the single most likely way this feature ships with a hole.
 */
export async function requireThreadMembership(
	db: Db,
	partnershipId: string,
	threadId: string,
	userId: string
): Promise<(Membership & { threadId: string; icon: ThreadIcon }) | null> {
	const membership = await requireMembership(db, partnershipId, userId);
	if (!membership) {
		return null;
	}

	const rows = await db
		.select({ id: messageThreads.id, icon: messageThreads.icon })
		.from(messageThreads)
		.where(and(eq(messageThreads.id, threadId), eq(messageThreads.partnershipId, partnershipId)))
		.limit(1);

	const [row] = rows;
	if (!row) {
		return null;
	}
	return { ...membership, threadId: row.id, icon: row.icon };
}

/**
 * Whether one thread is unread for the viewer, by the one definition of unread
 * (`isUnreadFor`).
 *
 * For a thread page deciding whether a live event about another thread is
 * worth a toast. Events never say who sent anything, by design, and this is
 * what answers it instead: unread means the newest message is not the
 * viewer's own and they have not read up to it. So a message the viewer sent
 * from another device never toasts.
 *
 * The thread must already be proven to be in the viewer's partnership —
 * `requireThreadMembership` — which is why this takes no partnership id.
 */
export async function isThreadUnread(db: Db, threadId: string, viewerId: string): Promise<boolean> {
	const [row] = await db
		.select({
			lastMessageAt: messageThreads.lastMessageAt,
			lastMessageSenderId: messageThreads.lastMessageSenderId,
			lastReadMessageAt: threadReads.lastReadMessageAt
		})
		.from(messageThreads)
		// The user predicate in the ON, as in `listBoard`, so a thread the viewer
		// never opened still has a row.
		.leftJoin(
			threadReads,
			and(eq(threadReads.threadId, messageThreads.id), eq(threadReads.userId, viewerId))
		)
		.where(eq(messageThreads.id, threadId))
		.limit(1);
	return row ? isUnreadFor(row, viewerId) : false;
}

/** As above, for a message. Same re-join, same reason. */
export async function requireMessageMembership(
	db: Db,
	partnershipId: string,
	messageId: string,
	userId: string
): Promise<(Membership & { messageId: string; threadId: string; senderId: string }) | null> {
	const membership = await requireMembership(db, partnershipId, userId);
	if (!membership) {
		return null;
	}

	const rows = await db
		.select({
			id: messages.id,
			threadId: messages.threadId,
			senderId: messages.senderId
		})
		.from(messages)
		.innerJoin(messageThreads, eq(messageThreads.id, messages.threadId))
		.where(and(eq(messages.id, messageId), eq(messageThreads.partnershipId, partnershipId)))
		.limit(1);

	const [row] = rows;
	if (!row) {
		return null;
	}
	return { ...membership, messageId: row.id, threadId: row.threadId, senderId: row.senderId };
}

// ── reads ────────────────────────────────────────────────────────────────────

/**
 * The board: every thread in a partnership, in the order it renders.
 *
 * One statement for both halves. `unread` is defined once, as SQL, and reused
 * in the select and in both sort keys — the JS twin of it is `isUnreadFor` in
 * `src/lib/messaging.ts`, and the two must agree.
 *
 * `messages` is still not scanned to build recency or unread state; the one
 * correlated read here is only the first ciphertext for the preview tile.
 * The hot-path ordering still comes entirely from the denormalised columns on
 * `message_threads`.
 */
export async function listBoard(
	db: Db,
	partnershipId: string,
	viewerId: string,
	now: Date = new Date()
): Promise<ThreadStickerView[]> {
	const unread = sql<number>`(
		${messageThreads.lastMessageSenderId} <> ${viewerId}
		and (
			${threadReads.lastReadMessageAt} is null
			or ${messageThreads.lastMessageAt} > ${threadReads.lastReadMessageAt}
		)
	)`;

	const messageCount = sql<number>`(
		select count(*) from ${messages} where ${messages.threadId} = ${messageThreads.id}
	)`;

	const rows = await db
		.select({
			...threadStickerColumns,
			unread,
			messageCount,
			previewMessageId
		})
		.from(messageThreads)
		// The user predicate belongs in the ON, not the WHERE. In the WHERE it
		// turns this left join into an inner one and every thread the viewer has
		// never opened silently disappears from their own board.
		.leftJoin(
			threadReads,
			and(eq(threadReads.threadId, messageThreads.id), eq(threadReads.userId, viewerId))
		)
		.where(eq(messageThreads.partnershipId, partnershipId))
		.orderBy(
			// Requirement: unread first by newest message, then read by when that
			// current latest message was first read. The CASE is what lets the two
			// halves sort on different columns without a second round trip.
			desc(unread),
			desc(sql`case when ${unread} then ${messageThreads.lastMessageAt}
			              else ${threadReads.lastFullyReadAt} end`),
			asc(messageThreads.id)
		)
		.limit(BOARD_LIMIT);
	const threadIds = rows.map((row) => row.id);
	const tagRows =
		threadIds.length > 0
			? await db
					.select({
						threadId: messageThreadTags.threadId,
						...TAG_COLUMNS
					})
					.from(messageThreadTags)
					.innerJoin(messageTags, eq(messageTags.id, messageThreadTags.tagId))
					.where(inArray(messageThreadTags.threadId, threadIds))
					.orderBy(asc(messageTags.createdAt), asc(messageTags.id))
			: [];
	const tagsByThread = new Map<string, TagView[]>();
	for (const tag of tagRows) {
		const values = tagsByThread.get(tag.threadId) ?? [];
		values.push(toTagView(tag));
		tagsByThread.set(tag.threadId, values);
	}

	const [unseenMedia, previews] = await Promise.all([
		listUnseenMedia(
			db,
			rows.filter((row) => Boolean(row.unread)).map((row) => row.id),
			viewerId,
			now
		),
		bodyRefsById(
			db,
			rows.map((row) => row.previewMessageId)
		)
	]);

	return rows.map((row) => ({
		id: row.id,
		icon: row.icon,
		tags: tagsByThread.get(row.id) ?? [],
		// SQLite has no boolean, so this arrives as 0/1. Normalised here so no
		// component ever receives a number pretending to be a flag.
		unread: Boolean(row.unread),
		lastMessageAt: row.lastMessageAt,
		lastFullyReadAt: row.lastFullyReadAt ?? null,
		messageCount: Number(row.messageCount),
		// Every thread has a first message — it is created with one — so a
		// missing preview is a row deleted between the two reads.
		preview: previews.get(row.previewMessageId) ?? emptyPreview(row.previewMessageId),
		unseenMedia: unseenMedia.get(row.id) ?? null
	}));
}

function emptyPreview(id: string): MessageBodyRef {
	return {
		id,
		ciphertext: '',
		vaultId: null,
		payloadVersion: null,
		metadataCiphertext: null,
		metadataVersion: null
	};
}

/** The bodies of some messages, by id, in chunks under D1's parameter cap. */
async function bodyRefsById(db: Db, ids: string[]): Promise<Map<string, MessageBodyRef>> {
	const unique = [...new Set(ids.filter(Boolean))];
	const rows = (
		await Promise.all(
			chunked(unique).map((chunk) =>
				db.select(bodyRefColumns).from(messages).where(inArray(messages.id, chunk))
			)
		)
	).flat();
	return new Map(rows.map((row) => [row.id, toBodyRef(row)]));
}

/** Under D1's 100 bound parameters per statement, leaving room for the rest. */
const IN_CHUNK = 90;

function chunked<T>(values: T[]): T[][] {
	const chunks: T[][] = [];
	for (let at = 0; at < values.length; at += IN_CHUNK) {
		chunks.push(values.slice(at, at + IN_CHUNK));
	}
	return chunks;
}

/**
 * Self-destructing files the viewer has not seen yet, per thread.
 *
 * "Not seen" is the unread rule applied to single messages: sent by the
 * partner, after the viewer's `last_read_message_at` (or at all, for a thread
 * they have never opened). That is why only unread threads are asked about —
 * a read thread cannot have any. Permanent and already-expired files are left
 * out: neither is counting down.
 *
 * Two queries, not one: the attachment rows first, which are small, then the
 * bodies of at most `UNSEEN_MEDIA_MESSAGE_LIMIT` messages per thread — the ones
 * expiring soonest — so a thread full of unseen photos does not pull every one
 * of its 64 KB bodies onto the board.
 */
async function listUnseenMedia(
	db: Db,
	threadIds: string[],
	viewerId: string,
	now: Date
): Promise<Map<string, UnseenMediaView>> {
	const result = new Map<string, UnseenMediaView>();
	if (threadIds.length === 0) {
		return result;
	}

	const attachmentRows = (
		await Promise.all(
			chunked(threadIds).map((chunk) =>
				db
					.select({
						id: messageAttachments.id,
						messageId: messageAttachments.messageId,
						expiresAt: messageAttachments.expiresAt,
						threadId: messages.threadId
					})
					.from(messageAttachments)
					.innerJoin(messages, eq(messages.id, messageAttachments.messageId))
					// In the ON for the same reason as `listBoard`: in the WHERE it would
					// drop every thread the viewer has never opened.
					.leftJoin(
						threadReads,
						and(eq(threadReads.threadId, messages.threadId), eq(threadReads.userId, viewerId))
					)
					.where(
						and(
							inArray(messages.threadId, chunk),
							ne(messages.senderId, viewerId),
							or(
								sql`${threadReads.lastReadMessageAt} is null`,
								gt(messages.createdAt, threadReads.lastReadMessageAt)
							),
							sql`${messageAttachments.purgedAt} is null`,
							gt(messageAttachments.expiresAt, now)
						)
					)
					.orderBy(asc(messageAttachments.expiresAt), asc(messageAttachments.id))
			)
		)
	).flat();

	// Rows arrive soonest-first, so the first seen per thread is its expiry and
	// the first N messages seen are the ones worth decrypting.
	const byThread = new Map<
		string,
		{
			expiresAt: Date;
			messageIds: string[];
			attachments: Map<string, string[]>;
			truncated: boolean;
		}
	>();
	for (const row of attachmentRows) {
		if (!row.expiresAt) {
			continue;
		}
		let entry = byThread.get(row.threadId);
		if (!entry) {
			entry = {
				expiresAt: row.expiresAt,
				messageIds: [],
				attachments: new Map(),
				truncated: false
			};
			byThread.set(row.threadId, entry);
		}
		let ids = entry.attachments.get(row.messageId);
		if (!ids) {
			if (entry.messageIds.length >= UNSEEN_MEDIA_MESSAGE_LIMIT) {
				entry.truncated = true;
				continue;
			}
			ids = [];
			entry.messageIds.push(row.messageId);
			entry.attachments.set(row.messageId, ids);
		}
		ids.push(row.id);
	}

	const messageIds = [...byThread.values()].flatMap((entry) => entry.messageIds);
	const bodies = await bodyRefsById(db, messageIds);

	for (const [threadId, entry] of byThread) {
		result.set(threadId, {
			expiresAt: entry.expiresAt,
			messages: entry.messageIds.flatMap((id) => {
				const body = bodies.get(id);
				return body === undefined
					? []
					: [{ ...body, attachmentIds: entry.attachments.get(id) ?? [] }];
			}),
			truncated: entry.truncated
		});
	}
	return result;
}

/**
 * One thread with its messages, attachment metadata, reactions and read receipt.
 *
 * Never N+1: attachments and reactions are fetched for the whole
 * message set with `inArray`. The Free plan allows 50 D1 queries per Worker
 * invocation, so a per-message fetch would break production while passing
 * locally, where the limit is not enforced.
 */
export async function getThread(
	db: Db,
	threadId: string,
	icon: ThreadIcon,
	viewerId: string,
	now: Date = new Date()
): Promise<ThreadView> {
	const rows = await db
		.select(messageColumns)
		.from(messages)
		.where(eq(messages.threadId, threadId))
		// Never by id alone — ids are UUIDs (invariant 8). `id` is the tiebreak
		// for two messages inside the same millisecond.
		.orderBy(asc(messages.createdAt), asc(messages.id));

	const ids = rows.map((row) => row.id);
	const [attachments, reactions, tags, partnerReads] = await Promise.all([
		ids.length > 0
			? db
					.select({
						id: messageAttachments.id,
						messageId: messageAttachments.messageId,
						byteSize: messageAttachments.byteSize,
						expiresAt: messageAttachments.expiresAt,
						purgedAt: messageAttachments.purgedAt
					})
					.from(messageAttachments)
					.where(inArray(messageAttachments.messageId, ids))
					.orderBy(asc(messageAttachments.createdAt), asc(messageAttachments.id))
			: [],
		ids.length > 0
			? db
					.select({
						id: messageReactions.id,
						messageId: messageReactions.messageId,
						userId: messageReactions.userId,
						ciphertext: messageReactions.ciphertext,
						vaultId: messageReactions.vaultId,
						payloadVersion: messageReactions.payloadVersion
					})
					.from(messageReactions)
					.where(inArray(messageReactions.messageId, ids))
			: [],
		db
			.select(TAG_COLUMNS)
			.from(messageThreadTags)
			.innerJoin(messageTags, eq(messageTags.id, messageThreadTags.tagId))
			.where(eq(messageThreadTags.threadId, threadId))
			.orderBy(asc(messageTags.createdAt), asc(messageTags.id)),
		// The partner's read mark, for the read receipt. "Not the viewer" is
		// "the partner" because only the partnership's two members can ever
		// open the thread, which `requireThreadMembership` has already proven
		// the viewer is one of.
		db
			.select({ lastReadMessageAt: threadReads.lastReadMessageAt })
			.from(threadReads)
			.where(and(eq(threadReads.threadId, threadId), ne(threadReads.userId, viewerId)))
			.limit(1)
	]);

	const byMessage = new Map<string, MessageView>();
	const messageViews = rows.map((row) => {
		const message: MessageView = {
			...toBodyRef(row),
			// Resolved here so no component sees a user id, which keeps the
			// "never return locals.user wholesale" posture intact.
			mine: row.senderId === viewerId,
			createdAt: row.createdAt,
			attachments: [],
			reactions: []
		};
		byMessage.set(row.id, message);
		return message;
	});
	const view: ThreadView = {
		id: threadId,
		icon,
		tags: tags.map(toTagView),
		messages: messageViews,
		seenMessageId: seenMessageId(messageViews, partnerReads[0]?.lastReadMessageAt ?? null)
	};

	for (const attachment of attachments) {
		byMessage.get(attachment.messageId)?.attachments.push({
			id: attachment.id,
			byteSize: attachment.byteSize,
			expiresAt: attachment.expiresAt,
			expired: isAttachmentExpired(attachment, now)
		});
	}
	for (const reaction of reactions) {
		byMessage.get(reaction.messageId)?.reactions.push({
			id: reaction.id,
			mine: reaction.userId === viewerId,
			ciphertext: reaction.ciphertext,
			vaultId: reaction.vaultId ?? null,
			payloadVersion: reaction.payloadVersion ?? null
		});
	}

	return view;
}

/**
 * Per-partnership unread counts for `/home`.
 *
 * Takes the partnership list rather than querying it, so `/home` costs no
 * second read of `partnerships` — the app shell's layout has already loaded it.
 */
export async function listUnreadCounts(
	db: Db,
	userId: string,
	partners: PartnerView[]
): Promise<UnreadPartnerView[]> {
	// `in ()` is a syntax error in SQLite, and a user with no partners is the
	// common case on a fresh account.
	if (partners.length === 0) {
		return [];
	}

	const rows = await db
		.select({
			partnershipId: messageThreads.partnershipId,
			unreadThreads: sql<number>`count(*)`,
			newestAt: sql<number>`max(${messageThreads.lastMessageAt})`
		})
		.from(messageThreads)
		.leftJoin(
			threadReads,
			and(eq(threadReads.threadId, messageThreads.id), eq(threadReads.userId, userId))
		)
		.where(
			and(
				inArray(
					messageThreads.partnershipId,
					partners.map((partner) => partner.id)
				),
				// Not mine, and newer than my read mark. The same predicate as the
				// board's, and it has to stay that way or /home and the board would
				// disagree about what "unread" means.
				ne(messageThreads.lastMessageSenderId, userId),
				sql`(${threadReads.lastReadMessageAt} is null
				     or ${messageThreads.lastMessageAt} > ${threadReads.lastReadMessageAt})`
			)
		)
		.groupBy(messageThreads.partnershipId);

	const counts = new Map(rows.map((row) => [row.partnershipId, row]));

	// Ordered by the nav's own partner order rather than by recency, so the
	// links do not reshuffle under a thumb as messages arrive.
	return partners.flatMap((partner) => {
		const row = counts.get(partner.id);
		if (!row) {
			return [];
		}
		return [
			{
				partnershipId: partner.id,
				names: partner.names,
				image: partner.image,
				unreadThreads: Number(row.unreadThreads),
				newestAt: new Date(Number(row.newestAt))
			}
		];
	});
}

export type AttachmentDownload =
	| { expired: false; id: string; storageKey: string; byteSize: number; expiresAt: Date | null }
	| { expired: true };

/**
 * Whether an attachment has self-destructed, as of `now`.
 *
 * The expiry is compared here, at read, rather than only trusted to the sweep
 * having run: the sweep runs every quarter hour, and "self-destructs in 1
 * hour" should not mean "in up to 1 hour 15".
 */
export function isAttachmentExpired(
	row: { expiresAt: Date | null; purgedAt: Date | null },
	now: Date
): boolean {
	return row.purgedAt !== null || (row.expiresAt !== null && row.expiresAt <= now);
}

/** The row the download endpoint needs, once membership is proven. */
export async function getAttachmentForDownload(
	db: Db,
	partnershipId: string,
	attachmentId: string,
	now: Date = new Date()
): Promise<AttachmentDownload | null> {
	const rows = await db
		.select({
			id: messageAttachments.id,
			storageKey: messageAttachments.storageKey,
			byteSize: messageAttachments.byteSize,
			expiresAt: messageAttachments.expiresAt,
			purgedAt: messageAttachments.purgedAt
		})
		.from(messageAttachments)
		.innerJoin(messages, eq(messages.id, messageAttachments.messageId))
		.innerJoin(messageThreads, eq(messageThreads.id, messages.threadId))
		// The partnership id is re-joined, not trusted from the URL. Without this
		// join anyone in any partnership could read any attachment by supplying
		// their own partnership id.
		.where(
			and(eq(messageAttachments.id, attachmentId), eq(messageThreads.partnershipId, partnershipId))
		)
		.limit(1);

	const [row] = rows;
	if (!row) {
		return null;
	}
	if (isAttachmentExpired(row, now)) {
		return { expired: true };
	}
	return {
		expired: false,
		id: row.id,
		storageKey: row.storageKey,
		byteSize: row.byteSize,
		expiresAt: row.expiresAt
	};
}

// ── writes ───────────────────────────────────────────────────────────────────

export type OutgoingAttachment = {
	/**
	 * The row id, chosen by the CLIENT rather than here.
	 *
	 * It has to be, and this is the one place the reason is worth spelling out:
	 * the attachment manifest — including each file's own decryption key — lives
	 * *inside* the encrypted message body, so the ids must be known before the
	 * body is sealed. Letting the server assign them would mean either a second
	 * round trip to re-seal the body, or an unencrypted manifest.
	 *
	 * Client-chosen ids are safe here because they are only ever inserted: a
	 * duplicate collides with the primary key and the insert fails, so one
	 * cannot be used to reach or overwrite an existing row. The endpoint still
	 * checks the shape.
	 */
	id: string;
	/** Already-encrypted bytes. The server never sees a filename or a mime type. */
	body: ReadableStream<Uint8Array>;
	byteSize: number;
	/**
	 * How long this file lives, chosen by the sender per file: the composer has
	 * a self-destruct menu on every attachment, so one message can hold a photo
	 * that lasts an hour beside one that lasts a month. See `resolveMedia`.
	 */
	mediaTtl: MediaTtl;
};

export type SendFailure =
	| 'not-a-member'
	| 'no-such-thread'
	| 'no-such-tag'
	| 'bad-icon'
	| 'body-too-large'
	| 'too-many-attachments'
	| 'too-many-bytes'
	| 'duplicate-attachment'
	| 'bad-media-ttl'
	| 'needs-permanent-media'
	| 'needs-high-quality-media'
	/** Not a sealed record this build can read: a malformed body or an unknown version. */
	| 'bad-body'
	/** Sealed under a vault that is not this partnership's, or the partnership has none yet. */
	| 'wrong-vault'
	| 'duplicate-message';

export type SendResult =
	| { ok: true; threadId: string; messageId: string }
	| { ok: false; reason: SendFailure };

/** What a send carries besides its attachments: the sealed body and its sidecar. */
export type SealedMessageInput = {
	/** Chosen by the browser, because the body is sealed to it. */
	messageId: string;
	vaultId: string;
	ciphertext: string;
	payloadVersion: number;
	metadataCiphertext?: string;
	metadataVersion?: number;
};

/**
 * The checks on a sealed body that need the database: that it is sealed to
 * this partnership's vault, and that its id is new. A body sealed to any
 * other vault would be one neither partner could open.
 */
async function checkSealedMessage(
	db: Db,
	partnershipId: string,
	input: SealedMessageInput
): Promise<SendFailure | null> {
	if (input.ciphertext.length > MAX_CIPHERTEXT_BYTES) {
		return 'body-too-large';
	}
	if (!sealedIsAcceptable(messageBodyKind, input.ciphertext, input.payloadVersion)) {
		return 'bad-body';
	}
	if (
		input.metadataCiphertext !== undefined &&
		!(
			input.metadataVersion !== undefined &&
			sealedIsAcceptable(messageMetadataKind, input.metadataCiphertext, input.metadataVersion)
		)
	) {
		return 'bad-body';
	}
	if ((await partnershipVaultIdFor(db, partnershipId)) !== input.vaultId) {
		return 'wrong-vault';
	}
	const [taken] = await db
		.select({ id: messages.id })
		.from(messages)
		.where(eq(messages.id, input.messageId))
		.limit(1);
	return taken ? 'duplicate-message' : null;
}

function checkPayload(attachments: OutgoingAttachment[]): SendFailure | null {
	if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
		return 'too-many-attachments';
	}
	const total = attachments.reduce((sum, attachment) => sum + attachment.byteSize, 0);
	if (total > MAX_ATTACHMENT_TOTAL_BYTES) {
		return 'too-many-bytes';
	}
	// Caught here rather than left to the primary key, so the failure is a
	// refusal with a reason instead of a database error after objects have been
	// written to the store.
	const ids = new Set(attachments.map((attachment) => attachment.id));
	if (ids.size !== attachments.length) {
		return 'duplicate-attachment';
	}
	return null;
}

/**
 * The checks on a send's media that depend on the sender's features — each
 * file's lifetime and the message's size — resolved to the expiry each
 * attachment is stored with, in the same order, or a refusal.
 *
 * Checked here rather than only in the endpoint, for the reason the icon is:
 * a rule is only a rule if every writer applies it. Both run before a single
 * object is written, so a refused send leaves nothing behind in the store.
 *
 * One feature read serves both, rather than a `userHasFeature` apiece: D1
 * bills per query, and this is on every send with media. A send with no
 * attachments has nothing to expire or measure, and costs no read at all.
 */
async function resolveMedia(
	db: Db,
	senderId: string,
	attachments: OutgoingAttachment[],
	now: Date
): Promise<{ ok: true; expiries: (Date | null)[] } | { ok: false; reason: SendFailure }> {
	if (attachments.length === 0) {
		return { ok: true, expiries: [] };
	}
	const features = await listUserFeatures(db, senderId);

	/**
	 * Quality itself is invisible here — the server holds only ciphertext — so
	 * bytes are the part of `highQualityMedia` that can be enforced. The
	 * account-wide cap in `checkPayload` still applies to everyone.
	 */
	const total = attachments.reduce((sum, attachment) => sum + attachment.byteSize, 0);
	if (total > attachmentBudget(features.includes('highQualityMedia'))) {
		return { ok: false, reason: 'needs-high-quality-media' };
	}

	const expiries: (Date | null)[] = [];
	for (const { mediaTtl } of attachments) {
		if (mediaTtl === MEDIA_TTL_NEVER) {
			if (!features.includes('permanentMedia')) {
				return { ok: false, reason: 'needs-permanent-media' };
			}
			expiries.push(null);
			continue;
		}
		if (!Number.isInteger(mediaTtl) || mediaTtl < MEDIA_TTL_MIN_MS || mediaTtl > MEDIA_TTL_MAX_MS) {
			return { ok: false, reason: 'bad-media-ttl' };
		}
		expiries.push(new Date(now.getTime() + mediaTtl));
	}
	return { ok: true, expiries };
}

type AttachmentRow = {
	id: string;
	messageId: string;
	byteSize: number;
	storageKey: string;
	expiresAt: Date | null;
};

/**
 * Writes the attachment objects, then returns the rows to insert.
 *
 * Objects go to the store BEFORE the database batch, deliberately. A crash
 * between the two then leaves an orphaned encrypted blob rather than a row
 * pointing at an object that does not exist, which is a permanently broken
 * message in someone's history. The orphan is unreachable (no row, so the
 * download 404s) and unreadable (its key was only ever inside the body that
 * was never stored). The bucket's lifecycle rule deletes it within 31 days if
 * it self-destructs, and disconnecting deletes it by prefix if it does not —
 * see `MEDIA_LIFETIMES`.
 */

async function writeAttachments(
	store: MediaStore,
	partnershipId: string,
	messageId: string,
	attachments: OutgoingAttachment[],
	/** One per attachment, in the same order: `resolveMedia`'s answer. */
	expiries: (Date | null)[]
): Promise<AttachmentRow[]> {
	const rows: AttachmentRow[] = [];
	for (const [index, attachment] of attachments.entries()) {
		const expiresAt = expiries[index] ?? null;
		const storageKey = attachmentKey(
			expiresAt === null ? 'permanent' : 'expiring',
			partnershipId,
			messageId,
			attachment.id
		);
		await store.put(storageKey, attachment.body, attachment.byteSize);
		rows.push({
			id: attachment.id,
			messageId,
			byteSize: attachment.byteSize,
			storageKey,
			expiresAt
		});
	}
	return rows;
}

/**
 * The read mark for whoever just posted.
 *
 * This is what makes "the newest message is mine" a sound proxy for "I have
 * read this thread", which is what the whole unread definition rests on. It
 * goes in the same batch as the message insert so the two cannot come apart —
 * and it is enforced here rather than relying on the composer only being
 * reachable from an opened thread (invariant 14).
 */
function markSenderRead(db: Db, threadId: string, senderId: string, now: Date) {
	// `timestamp_ms` column mode maps a Date for the `values()` half of this
	// statement, but NOT inside a hand-written `sql` fragment — there Drizzle
	// binds whatever it is given as-is, and D1 rejects Date objects with
	// D1_TYPE_ERROR (libsql, used in dev and tests, accepts them, so only the
	// real Workers runtime catches it). Bind the epoch millis the columns
	// actually store.
	const nowMs = now.getTime();
	return db
		.insert(threadReads)
		.values({ threadId, userId: senderId, lastFullyReadAt: now, lastReadMessageAt: now })
		.onConflictDoUpdate({
			target: [threadReads.threadId, threadReads.userId],
			set: {
				lastFullyReadAt: sql`case
					when ${threadReads.lastReadMessageAt} is null
					  or ${threadReads.lastReadMessageAt} < ${nowMs}
					then ${nowMs}
					else ${threadReads.lastFullyReadAt}
				end`,
				lastReadMessageAt: now
			}
		});
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const TAG_COLORS = ['#d95f59', '#d98c3f', '#c5a33d', '#55a36b', '#3f9caa', '#5d7fc2', '#8b67b5'];

/** What a tag view is read from, wherever tags are listed. */
const TAG_COLUMNS = {
	id: messageTags.id,
	name: messageTags.name,
	color: messageTags.color,
	ciphertext: messageTags.ciphertext,
	vaultId: messageTags.vaultId,
	payloadVersion: messageTags.payloadVersion
};

function toTagView(row: {
	id: string;
	name: string;
	color: string;
	ciphertext: string | null;
	vaultId: string | null;
	payloadVersion: number | null;
}): TagView {
	return { id: row.id, name: row.name, color: row.color, sealed: sealedRef(row.id, row) };
}

function validTagColor(color: string): boolean {
	return HEX_COLOR.test(color);
}

/** A blind index as the browser computes it: a full-length base64url HMAC-SHA256. */
const NAME_INDEX = /^[A-Za-z0-9_-]{43}$/;

async function tagRowsForPartnership(db: Db, partnershipId: string, tagIds: string[]) {
	const uniqueIds = [...new Set(tagIds)];
	if (uniqueIds.length === 0) {
		return [];
	}
	const rows = await db
		.select({ id: messageTags.id })
		.from(messageTags)
		.where(and(eq(messageTags.partnershipId, partnershipId), inArray(messageTags.id, uniqueIds)));
	return rows.length === uniqueIds.length ? rows : null;
}

/**
 * The partnership's tags, in no particular order: they are sorted by name in
 * the browser, the only place a sealed name can be read.
 */
export async function listTags(
	db: Db,
	partnershipId: string,
	userId: string
): Promise<TagView[] | null> {
	if (!(await requireMembership(db, partnershipId, userId))) {
		return null;
	}
	const rows = await db
		.select(TAG_COLUMNS)
		.from(messageTags)
		.where(eq(messageTags.partnershipId, partnershipId))
		.orderBy(asc(messageTags.createdAt), asc(messageTags.id));
	return rows.map(toTagView);
}

/**
 * A tag's name as a write carries it: sealed in the partnership's vault, with
 * the blind index of its normalised form (`normaliseTagName`) beside it.
 */
export type SealedTagName = {
	vaultId: string;
	ciphertext: string;
	payloadVersion: number;
	nameIndex: string;
};

export type TagMutationResult =
	| { ok: true; tag: TagView }
	| {
			ok: false;
			reason:
				| 'not-a-member'
				| 'invalid-name'
				| 'invalid-color'
				| 'duplicate-name'
				| 'no-such-tag'
				| 'id-taken';
	  };

/** Why a sealed name is refused, or null: its envelope, and the vault it must be in. */
async function tagNameProblem(
	db: Db,
	partnershipId: string,
	name: SealedTagName
): Promise<'invalid-name' | null> {
	const vaultId = await partnershipVaultIdFor(db, partnershipId);
	return vaultId !== null &&
		name.vaultId === vaultId &&
		NAME_INDEX.test(name.nameIndex) &&
		sealedIsAcceptable(tagKind, name.ciphertext, name.payloadVersion)
		? null
		: 'invalid-name';
}

/**
 * Makes a tag. Its id is chosen by the browser, because the name is sealed to
 * it. A name already in use is refused by its blind index: the server learns
 * that two names are equal, never what either is.
 */
export async function createTag(
	db: Db,
	partnershipId: string,
	userId: string,
	input: { id: string; name: SealedTagName; color?: string }
): Promise<TagMutationResult> {
	if (!(await requireMembership(db, partnershipId, userId))) {
		return { ok: false, reason: 'not-a-member' };
	}
	const problem = await tagNameProblem(db, partnershipId, input.name);
	if (problem) {
		return { ok: false, reason: problem };
	}
	const [duplicate] = await db
		.select({ id: messageTags.id })
		.from(messageTags)
		.where(
			and(
				eq(messageTags.partnershipId, partnershipId),
				eq(messageTags.nameIndex, input.name.nameIndex)
			)
		)
		.limit(1);
	if (duplicate) {
		return { ok: false, reason: 'duplicate-name' };
	}
	// A chosen colour wins; anything malformed falls back to the random pick
	// rather than refusing, so the picker's default never blocks creation.
	const chosen = input.color !== undefined && validTagColor(input.color) ? input.color : null;
	const color =
		chosen ?? TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)] ?? TAG_COLORS[0];
	const { vaultId, ciphertext, payloadVersion, nameIndex } = input.name;
	// The unique index on the name index settles a race the check above lost.
	const inserted = await db
		.insert(messageTags)
		.values({
			id: input.id,
			partnershipId,
			name: '',
			color,
			ciphertext,
			vaultId,
			payloadVersion,
			nameIndex
		})
		.onConflictDoNothing()
		.returning({ id: messageTags.id });
	if (inserted.length === 0) {
		const [taken] = await db
			.select({ id: messageTags.id })
			.from(messageTags)
			.where(eq(messageTags.id, input.id))
			.limit(1);
		return { ok: false, reason: taken ? 'id-taken' : 'duplicate-name' };
	}
	return {
		ok: true,
		tag: {
			id: input.id,
			name: '',
			color,
			sealed: { recordId: input.id, vaultId, ciphertext, payloadVersion }
		}
	};
}

/** Renames (a new sealed name) or recolours a tag. Last write wins: a tag is a label. */
export async function updateTag(
	db: Db,
	partnershipId: string,
	userId: string,
	tagId: string,
	input: { name?: SealedTagName; color?: string }
): Promise<TagMutationResult> {
	if (!(await requireMembership(db, partnershipId, userId))) {
		return { ok: false, reason: 'not-a-member' };
	}
	const [current] = await db
		.select({ ...TAG_COLUMNS, revision: messageTags.revision })
		.from(messageTags)
		.where(and(eq(messageTags.id, tagId), eq(messageTags.partnershipId, partnershipId)))
		.limit(1);
	if (!current) {
		return { ok: false, reason: 'no-such-tag' };
	}
	const color = input.color ?? current.color;
	if (!validTagColor(color)) {
		return { ok: false, reason: 'invalid-color' };
	}
	const { name } = input;
	if (name) {
		const problem = await tagNameProblem(db, partnershipId, name);
		if (problem) {
			return { ok: false, reason: problem };
		}
		const [duplicate] = await db
			.select({ id: messageTags.id })
			.from(messageTags)
			.where(
				and(
					eq(messageTags.partnershipId, partnershipId),
					eq(messageTags.nameIndex, name.nameIndex),
					ne(messageTags.id, tagId)
				)
			)
			.limit(1);
		if (duplicate) {
			return { ok: false, reason: 'duplicate-name' };
		}
	}
	const sealed = name
		? {
				name: '',
				ciphertext: name.ciphertext,
				vaultId: name.vaultId,
				payloadVersion: name.payloadVersion,
				nameIndex: name.nameIndex,
				revision: current.revision + 1
			}
		: {};
	try {
		await db
			.update(messageTags)
			.set({ color, ...sealed })
			.where(eq(messageTags.id, tagId));
	} catch (error) {
		// The unique index on the name index, after a race the check lost.
		if (String(error).includes('UNIQUE')) {
			return { ok: false, reason: 'duplicate-name' };
		}
		throw error;
	}
	const view = name ? { ...current, ...sealed, color } : { ...current, color };
	return { ok: true, tag: toTagView(view) };
}

export async function setThreadTags(
	db: Db,
	partnershipId: string,
	userId: string,
	threadId: string,
	tagIds: string[]
): Promise<
	{ ok: true } | { ok: false; reason: 'not-a-member' | 'no-such-thread' | 'no-such-tag' }
> {
	const membership = await requireThreadMembership(db, partnershipId, threadId, userId);
	if (!membership) {
		return { ok: false, reason: 'no-such-thread' };
	}
	const tags = await tagRowsForPartnership(db, partnershipId, tagIds);
	if (!tags) {
		return { ok: false, reason: 'no-such-tag' };
	}
	await db.batch([
		db.delete(messageThreadTags).where(eq(messageThreadTags.threadId, threadId)),
		...tags.map((tag) => db.insert(messageThreadTags).values({ threadId, tagId: tag.id }))
	]);
	return { ok: true };
}

/**
 * Writes a message's encrypted metadata sidecar.
 *
 * The client owns the merge policy — for example, appending one newly revealed
 * embed to an existing metadata payload — and the server only stores opaque
 * ciphertext after proving the caller can see that message.
 */
export async function setMessageMetadataCiphertext(
	db: Db,
	input: {
		partnershipId: string;
		messageId: string;
		viewerId: string;
		metadataCiphertext: string;
		metadataVersion: number;
	}
): Promise<'ok' | 'not-found' | 'bad-body' | 'not-sealed'> {
	const membership = await requireMessageMembership(
		db,
		input.partnershipId,
		input.messageId,
		input.viewerId
	);
	if (!membership) {
		return 'not-found';
	}
	if (!sealedIsAcceptable(messageMetadataKind, input.metadataCiphertext, input.metadataVersion)) {
		return 'bad-body';
	}

	// Only beside a sealed body. A message still in the original scheme gets
	// its sidecar when it is migrated, sealed with the body; writing a sealed
	// sidecar next to an age body would leave the row half in each scheme.
	const updated = await db
		.update(messages)
		.set({ metadataCiphertext: input.metadataCiphertext, metadataVersion: input.metadataVersion })
		.where(and(eq(messages.id, membership.messageId), sql`${messages.vaultId} is not null`))
		.returning({ id: messages.id });
	return updated.length > 0 ? 'ok' : 'not-sealed';
}

/** Creates a thread and its first message in one shot. */
export async function startThread(
	db: Db,
	store: MediaStore,
	input: SealedMessageInput & {
		partnershipId: string;
		senderId: string;
		icon: ThreadIcon;
		attachments: OutgoingAttachment[];
		tagIds?: string[];
	},
	now: Date = new Date()
): Promise<SendResult> {
	const membership = await requireMembership(db, input.partnershipId, input.senderId);
	if (!membership) {
		return { ok: false, reason: 'not-a-member' };
	}

	// Re-validated here as well as in the endpoint's Zod schema. `icon` is the
	// one plaintext column in the feature, and a closed list is only closed if
	// every writer checks it.
	if (!isThreadIcon(input.icon)) {
		return { ok: false, reason: 'bad-icon' };
	}

	const problem =
		checkPayload(input.attachments) ?? (await checkSealedMessage(db, input.partnershipId, input));
	if (problem) {
		return { ok: false, reason: problem };
	}
	const tags = await tagRowsForPartnership(db, input.partnershipId, input.tagIds ?? []);
	if (!tags) {
		return { ok: false, reason: 'no-such-tag' };
	}
	const expiry = await resolveMedia(db, input.senderId, input.attachments, now);
	if (!expiry.ok) {
		return expiry;
	}

	const threadId = crypto.randomUUID();
	const { messageId } = input;
	const attachmentRows = await writeAttachments(
		store,
		input.partnershipId,
		messageId,
		input.attachments,
		expiry.expiries
	);

	await db.batch([
		db.insert(messageThreads).values({
			id: threadId,
			partnershipId: input.partnershipId,
			icon: input.icon,
			lastMessageAt: now,
			lastMessageSenderId: input.senderId
		}),
		db.insert(messages).values({
			id: messageId,
			threadId,
			senderId: input.senderId,
			ciphertext: input.ciphertext,
			// LEGACY-RICHTEXT: everything sent from now on is a rich-text document.
			bodyFormat: 'lexical',
			vaultId: input.vaultId,
			payloadVersion: input.payloadVersion,
			metadataCiphertext: input.metadataCiphertext ?? null,
			metadataVersion:
				input.metadataCiphertext === undefined ? null : (input.metadataVersion ?? null),
			createdAt: now
		}),
		...attachmentRows.map((row) => db.insert(messageAttachments).values(row)),
		...tags.map((tag) => db.insert(messageThreadTags).values({ threadId, tagId: tag.id })),
		markSenderRead(db, threadId, input.senderId, now)
	]);

	return { ok: true, threadId, messageId };
}

/** A reply to an existing thread. */
export async function sendMessage(
	db: Db,
	store: MediaStore,
	input: SealedMessageInput & {
		partnershipId: string;
		threadId: string;
		senderId: string;
		attachments: OutgoingAttachment[];
	},
	now: Date = new Date()
): Promise<SendResult> {
	const membership = await requireThreadMembership(
		db,
		input.partnershipId,
		input.threadId,
		input.senderId
	);
	if (!membership) {
		const inPartnership = await requireMembership(db, input.partnershipId, input.senderId);
		return { ok: false, reason: inPartnership ? 'no-such-thread' : 'not-a-member' };
	}

	const problem =
		checkPayload(input.attachments) ?? (await checkSealedMessage(db, input.partnershipId, input));
	if (problem) {
		return { ok: false, reason: problem };
	}
	const expiry = await resolveMedia(db, input.senderId, input.attachments, now);
	if (!expiry.ok) {
		return expiry;
	}

	const { messageId } = input;
	const attachmentRows = await writeAttachments(
		store,
		input.partnershipId,
		messageId,
		input.attachments,
		expiry.expiries
	);

	await db.batch([
		db.insert(messages).values({
			id: messageId,
			threadId: input.threadId,
			senderId: input.senderId,
			ciphertext: input.ciphertext,
			bodyFormat: 'lexical',
			vaultId: input.vaultId,
			payloadVersion: input.payloadVersion,
			metadataCiphertext: input.metadataCiphertext ?? null,
			metadataVersion:
				input.metadataCiphertext === undefined ? null : (input.metadataVersion ?? null),
			createdAt: now
		}),
		...attachmentRows.map((row) => db.insert(messageAttachments).values(row)),
		db
			.update(messageThreads)
			.set({ lastMessageAt: now, lastMessageSenderId: input.senderId })
			.where(eq(messageThreads.id, input.threadId)),
		markSenderRead(db, input.threadId, input.senderId, now)
	]);

	return { ok: true, threadId: input.threadId, messageId };
}

/**
 * Records that the viewer read the thread up to its current latest message,
 * and says whether that moved their read mark.
 *
 * `lastReadMessageAt` is set to the thread's CURRENT `last_message_at`, read
 * inside the same call — not to `now`. Using `now` would mark a message that
 * arrived in the same second as already read, and it would be silent.
 *
 * The row is only written when the mark moves forward, which is also the only
 * time `lastFullyReadAt` may advance: reopening a thread with no new messages
 * must not reshuffle the board's read section.
 *
 * The return value is what decides whether the partner is told (a `read`
 * event, for their read receipt). It must be false for a reopen, because a
 * thread page reloads on every event about its thread, including `read`: two
 * people with the same thread open would otherwise tell each other about the
 * reload the last event caused, for ever.
 */
export async function markThreadOpened(
	db: Db,
	threadId: string,
	viewerId: string,
	now: Date = new Date()
): Promise<boolean> {
	const rows = await db
		.select({ lastMessageAt: messageThreads.lastMessageAt })
		.from(messageThreads)
		.where(eq(messageThreads.id, threadId))
		.limit(1);

	const [row] = rows;
	if (!row) {
		return false;
	}

	// `returning` yields a row for an insert or an update and none when
	// `setWhere` skips the update, which is exactly "the mark moved".
	const written = await db
		.insert(threadReads)
		.values({
			threadId,
			userId: viewerId,
			lastFullyReadAt: now,
			lastReadMessageAt: row.lastMessageAt
		})
		.onConflictDoUpdate({
			target: [threadReads.threadId, threadReads.userId],
			set: { lastFullyReadAt: now, lastReadMessageAt: row.lastMessageAt },
			setWhere: lt(threadReads.lastReadMessageAt, row.lastMessageAt)
		})
		.returning({ id: threadReads.id });
	return written.length > 0;
}

export type ReactionResult =
	/**
	 * `threadId` is returned so the caller can publish a realtime event without
	 * a second lookup — `requireMessageMembership` has already resolved it, so
	 * not returning it would mean re-reading the row to name the thread that
	 * just changed. `partnership` likewise, for the push notification.
	 */
	| { ok: true; threadId: string; partnership: PartnershipView }
	| { ok: false; reason: 'not-a-member' | 'own-message' | 'too-large' | 'wrong-vault' };

/**
 * Sets or replaces the viewer's reaction to a message.
 *
 * Refuses on the viewer's own message: the requirement is reacting to messages
 * you have *received*, and a unique index cannot express "not mine" because
 * SQLite's CHECK constraints cannot see another table.
 */
export async function setReaction(
	db: Db,
	input: {
		partnershipId: string;
		messageId: string;
		viewerId: string;
		/** A fresh id per write, chosen by the browser: the reaction is sealed to it. */
		id: string;
		vaultId: string;
		ciphertext: string;
		payloadVersion: number;
	}
): Promise<ReactionResult> {
	const membership = await requireMessageMembership(
		db,
		input.partnershipId,
		input.messageId,
		input.viewerId
	);
	if (!membership) {
		return { ok: false, reason: 'not-a-member' };
	}
	if (membership.senderId === input.viewerId) {
		return { ok: false, reason: 'own-message' };
	}
	if (input.ciphertext.length > MAX_REACTION_CIPHERTEXT_BYTES) {
		return { ok: false, reason: 'too-large' };
	}
	if (!sealedIsAcceptable(messageReactionKind, input.ciphertext, input.payloadVersion)) {
		return { ok: false, reason: 'too-large' };
	}
	if ((await partnershipVaultIdFor(db, input.partnershipId)) !== input.vaultId) {
		return { ok: false, reason: 'wrong-vault' };
	}

	// The row takes the new id too: the ciphertext is sealed to it, so an old
	// id kept beside a new ciphertext would never open.
	const sealed = {
		id: input.id,
		ciphertext: input.ciphertext,
		vaultId: input.vaultId,
		payloadVersion: input.payloadVersion
	};
	await db
		.insert(messageReactions)
		.values({ ...sealed, messageId: input.messageId, userId: input.viewerId })
		.onConflictDoUpdate({
			target: [messageReactions.messageId, messageReactions.userId],
			set: { ...sealed, updatedAt: new Date() }
		});

	return { ok: true, threadId: membership.threadId, partnership: membership.partnership };
}

export async function clearReaction(
	db: Db,
	input: { partnershipId: string; messageId: string; viewerId: string }
): Promise<ReactionResult> {
	const membership = await requireMessageMembership(
		db,
		input.partnershipId,
		input.messageId,
		input.viewerId
	);
	if (!membership) {
		return { ok: false, reason: 'not-a-member' };
	}

	await db
		.delete(messageReactions)
		.where(
			and(
				eq(messageReactions.messageId, input.messageId),
				eq(messageReactions.userId, input.viewerId)
			)
		);

	return { ok: true, threadId: membership.threadId, partnership: membership.partnership };
}

// ── history restore ──────────────────────────────────────────────────────────

/**
 * Which restore requests are still live, as a SQL condition.
 *
 * A restore request belongs to a partner-assisted sign-in, and it is only
 * worth acting on while that sign-in could still happen or already has:
 * pending and in date, or approved, or completed. A request whose sign-in was
 * superseded, declined or left to expire must disappear rather than invite a
 * partner to re-encrypt the whole history to a key nobody will ever hold.
 *
 * Rows with no recovery request predate this and are treated as live, so
 * nothing that was already on someone's board vanishes.
 */
function restoreStillLive(now: Date) {
	return or(
		sql`${historyRestoreRequests.recoveryRequestId} is null`,
		inArray(accountRecoveryRequests.status, ['approved', 'completed']),
		and(eq(accountRecoveryRequests.status, 'pending'), gt(accountRecoveryRequests.expiresAt, now))
	);
}

/** Any open restore request in this partnership, from either side. */
export async function listRestoreRequests(
	db: Db,
	partnershipId: string,
	viewerId: string,
	now: Date = new Date()
): Promise<RestoreRequestView[]> {
	const rows = await db
		.select({
			id: historyRestoreRequests.id,
			requesterId: historyRestoreRequests.requesterId,
			requestedRecipient: historyRestoreRequests.requestedRecipient,
			createdAt: historyRestoreRequests.createdAt,
			recoveryStatus: accountRecoveryRequests.status
		})
		.from(historyRestoreRequests)
		.leftJoin(
			accountRecoveryRequests,
			eq(accountRecoveryRequests.id, historyRestoreRequests.recoveryRequestId)
		)
		.where(
			and(
				eq(historyRestoreRequests.partnershipId, partnershipId),
				eq(historyRestoreRequests.status, 'pending'),
				restoreStillLive(now)
			)
		)
		.orderBy(desc(historyRestoreRequests.createdAt));

	return rows.map((row) => ({
		id: row.id,
		requestedRecipient: row.requestedRecipient,
		createdAt: row.createdAt,
		mine: row.requesterId === viewerId,
		signInApproved: row.recoveryStatus === 'approved' || row.recoveryStatus === 'completed'
	}));
}

/**
 * The partnerships in which someone has asked this viewer for help signing in.
 *
 * For the callout the app shell shows on every screen — a partner who cannot
 * get into their account cannot message you to say so, so the request has to
 * find you wherever you are. Ids only; the layout already has the names.
 */
export async function listHelpRequests(
	db: Db,
	viewerId: string,
	now: Date = new Date()
): Promise<string[]> {
	const rows = await db
		.selectDistinct({ partnershipId: historyRestoreRequests.partnershipId })
		.from(historyRestoreRequests)
		.innerJoin(partnerships, eq(partnerships.id, historyRestoreRequests.partnershipId))
		.leftJoin(
			accountRecoveryRequests,
			eq(accountRecoveryRequests.id, historyRestoreRequests.recoveryRequestId)
		)
		.where(
			and(
				eq(historyRestoreRequests.status, 'pending'),
				ne(historyRestoreRequests.requesterId, viewerId),
				eq(partnerships.status, 'accepted'),
				or(eq(partnerships.inviterId, viewerId), eq(partnerships.inviteeId, viewerId)),
				restoreStillLive(now)
			)
		);
	return rows.map((row) => row.partnershipId);
}

// ── moving messages into the partnership vault ──────────────────────────────

/** One page of rows still in the original scheme, for a device to seal into the vault. */
export type LegacyMessagePage = {
	messages: { id: string; ciphertext: string; metadataCiphertext: string | null }[];
	/** Reactions still in the original scheme, whether or not their message has moved. */
	reactions: { id: string; ciphertext: string }[];
	/** Pass back for the next page; null when this was the last. */
	next: { messagesAfter: string | null; reactionsAfter: string | null } | null;
};

const inPartnership = (db: Db, partnershipId: string) =>
	db
		.select({ id: messageThreads.id })
		.from(messageThreads)
		.where(eq(messageThreads.partnershipId, partnershipId));

/**
 * Messages and reactions in a partnership that are still age-encrypted to both
 * partners rather than sealed in its vault. See docs/messaging.md, "Moving
 * into the vault".
 *
 * Either member may read these: every one is encrypted to both of them, so
 * this hands over nothing they could not already open. Paged by id on two
 * independent cursors, because a row a device cannot open (encrypted to a key
 * it no longer has) stays behind, and the next page has to move past it.
 */
export async function listLegacyMessages(
	db: Db,
	input: {
		partnershipId: string;
		actorId: string;
		messagesAfter?: string | null;
		reactionsAfter?: string | null;
	}
): Promise<LegacyMessagePage | null> {
	const membership = await requireMembership(db, input.partnershipId, input.actorId);
	if (!membership) {
		return null;
	}
	const threads = inPartnership(db, input.partnershipId);

	const [messageRows, reactionRows] = await Promise.all([
		db
			.select({
				id: messages.id,
				ciphertext: messages.ciphertext,
				metadataCiphertext: messages.metadataCiphertext
			})
			.from(messages)
			.where(
				and(
					inArray(messages.threadId, threads),
					sql`${messages.vaultId} is null`,
					input.messagesAfter ? gt(messages.id, input.messagesAfter) : undefined
				)
			)
			.orderBy(asc(messages.id))
			.limit(RESTORE_PAGE_SIZE),
		db
			.select({ id: messageReactions.id, ciphertext: messageReactions.ciphertext })
			.from(messageReactions)
			.where(
				and(
					inArray(
						messageReactions.messageId,
						db.select({ id: messages.id }).from(messages).where(inArray(messages.threadId, threads))
					),
					sql`${messageReactions.vaultId} is null`,
					input.reactionsAfter ? gt(messageReactions.id, input.reactionsAfter) : undefined
				)
			)
			.orderBy(asc(messageReactions.id))
			.limit(RESTORE_PAGE_SIZE)
	]);

	const moreMessages = messageRows.length === RESTORE_PAGE_SIZE;
	const moreReactions = reactionRows.length === RESTORE_PAGE_SIZE;
	return {
		messages: messageRows.map((row) => ({
			...row,
			metadataCiphertext: row.metadataCiphertext ?? null
		})),
		reactions: reactionRows,
		// A short page is the last page of its kind. A full one might be exactly
		// the end, which costs one empty read, versus a count on every page.
		next:
			moreMessages || moreReactions
				? {
						messagesAfter: moreMessages ? (messageRows.at(-1)?.id ?? null) : null,
						reactionsAfter: moreReactions ? (reactionRows.at(-1)?.id ?? null) : null
					}
				: null
	};
}

/**
 * Replaces rows still in the original scheme with copies sealed in the
 * partnership vault.
 *
 * Either member may do it, for any row in the partnership: both can read
 * every one, and the copy says what the original said — or the server cannot
 * tell either way, which is no new trust boundary, since a partner could
 * always write whatever they liked into the conversation. What the `where`
 * enforces is the shape of the change:
 *
 * - `vault_id IS NULL` — strictly one way, once. A row already sealed cannot
 *   be touched, so two devices migrating at once write each row at most once
 *   and neither can overwrite the other, and this can never become an "edit a
 *   sent message" endpoint.
 * - the row is in this partnership — the confused-deputy guard.
 * - the vault is this partnership's own.
 */
export async function sealLegacyMessages(
	db: Db,
	input: {
		partnershipId: string;
		actorId: string;
		vaultId: string;
		messages: {
			id: string;
			ciphertext: string;
			payloadVersion: number;
			metadataCiphertext: string | null;
			metadataVersion: number | null;
		}[];
		reactions: { id: string; ciphertext: string; payloadVersion: number }[];
	}
): Promise<{ ok: true; sealed: number } | { ok: false; reason: 'not-a-member' | 'invalid' }> {
	const membership = await requireMembership(db, input.partnershipId, input.actorId);
	if (!membership) {
		return { ok: false, reason: 'not-a-member' };
	}
	if ((await partnershipVaultIdFor(db, input.partnershipId)) !== input.vaultId) {
		return { ok: false, reason: 'invalid' };
	}
	const acceptable =
		input.messages.every(
			(message) =>
				sealedIsAcceptable(messageBodyKind, message.ciphertext, message.payloadVersion) &&
				(message.metadataCiphertext === null ||
					(message.metadataVersion !== null &&
						sealedIsAcceptable(
							messageMetadataKind,
							message.metadataCiphertext,
							message.metadataVersion
						)))
		) &&
		input.reactions.every((reaction) =>
			sealedIsAcceptable(messageReactionKind, reaction.ciphertext, reaction.payloadVersion)
		);
	if (!acceptable) {
		return { ok: false, reason: 'invalid' };
	}

	const threads = inPartnership(db, input.partnershipId);
	const updates = [
		...input.messages.map((message) =>
			db
				.update(messages)
				.set({
					ciphertext: message.ciphertext,
					// The migration converts a pre-rich-text body as it seals it, so
					// every sealed body is a document. LEGACY-RICHTEXT.
					bodyFormat: 'lexical',
					vaultId: input.vaultId,
					payloadVersion: message.payloadVersion,
					metadataCiphertext: message.metadataCiphertext,
					metadataVersion: message.metadataCiphertext === null ? null : message.metadataVersion
				})
				.where(
					and(
						eq(messages.id, message.id),
						sql`${messages.vaultId} is null`,
						inArray(messages.threadId, threads)
					)
				)
				.returning({ id: messages.id })
		),
		...input.reactions.map((reaction) =>
			db
				.update(messageReactions)
				.set({
					ciphertext: reaction.ciphertext,
					vaultId: input.vaultId,
					payloadVersion: reaction.payloadVersion
				})
				.where(
					and(
						eq(messageReactions.id, reaction.id),
						sql`${messageReactions.vaultId} is null`,
						inArray(
							messageReactions.messageId,
							db
								.select({ id: messages.id })
								.from(messages)
								.where(inArray(messages.threadId, threads))
						)
					)
				)
				.returning({ id: messageReactions.id })
		)
	];
	if (updates.length === 0) {
		return { ok: true, sealed: 0 };
	}
	const results = await db.batch(updates as [(typeof updates)[number], ...typeof updates]);
	return { ok: true, sealed: results.reduce((sum, rows) => sum + rows.length, 0) };
}

/**
 * The pending request, if `actorId` is the member who can actually act on it.
 *
 * The actor must be the OTHER member: the person who lost their key cannot
 * wrap anything for themselves, since they cannot open the vault.
 */
async function findRestorableRequest(
	db: Db,
	input: { partnershipId: string; requestId: string; actorId: string },
	now: Date = new Date()
): Promise<{
	id: string;
	requesterId: string;
	requestedRecipient: string;
	recoveryRequestId: string | null;
} | null> {
	const membership = await requireMembership(db, input.partnershipId, input.actorId);
	if (!membership) {
		return null;
	}

	const rows = await db
		.select({
			id: historyRestoreRequests.id,
			requesterId: historyRestoreRequests.requesterId,
			requestedRecipient: historyRestoreRequests.requestedRecipient,
			recoveryRequestId: historyRestoreRequests.recoveryRequestId
		})
		.from(historyRestoreRequests)
		.leftJoin(
			accountRecoveryRequests,
			eq(accountRecoveryRequests.id, historyRestoreRequests.recoveryRequestId)
		)
		.where(
			and(
				eq(historyRestoreRequests.id, input.requestId),
				eq(historyRestoreRequests.partnershipId, input.partnershipId),
				eq(historyRestoreRequests.status, 'pending'),
				restoreStillLive(now)
			)
		)
		.limit(1);

	const [request] = rows;
	if (!request || request.requesterId === input.actorId) {
		return null;
	}
	return request;
}

/**
 * The requester's own-vault escrow held in this partnership, for the partner
 * who is helping them — the same gate as the restore itself.
 */
export async function escrowForRestore(
	db: Db,
	input: { partnershipId: string; requestId: string; actorId: string }
): Promise<{ escrow: { id: string; ciphertext: string } | null } | null> {
	const request = await findRestorableRequest(db, input);
	if (!request) {
		return null;
	}
	return {
		escrow: await escrowForRequester(db, {
			requesterId: request.requesterId,
			partnershipId: input.partnershipId
		})
	};
}

/**
 * Gives a partner who lost every way in their access back: the partnership
 * vault, wrapped for the key their partner-assisted sign-in will give them.
 *
 * One wrap restores the whole history, because everything in the partnership
 * is sealed under the vault — the helping device seals any rows still in the
 * original scheme first (`sealLegacyMessages`), then calls this. Attachments
 * in the object store are never touched either way: each is encrypted under
 * its own key, carried inside its message body.
 *
 * The wrap is stored *beside* the requester's existing one, for the recipient
 * on the request rather than the one they have now. Their current wrap must
 * stay usable until the sign-in actually completes — it may be declined or
 * expire — and completing it deletes the wraps for the old key
 * (`completeAccountRecovery` in recovery.ts).
 *
 * This closes the request and, if it is the first partnership to finish,
 * approves the sign-in it belongs to. Approval is half of what completing
 * needs: the requester must also confirm a link sent to the account's address,
 * which is what stops a partner who filed a request for someone else's email
 * from approving it and taking the account over. See docs/account-recovery.md.
 *
 * The server cannot check the wrap opens with that key; nothing here can. A
 * partner could wrap anything — which is no new power, since they could
 * always write anything into the conversation.
 */
export async function restoreVaultAccess(
	db: Db,
	input: {
		partnershipId: string;
		requestId: string;
		/** The partner doing the restore, not the one who lost their key. */
		actorId: string;
		vaultWrap: string;
		/**
		 * The partner's half of the requester's own-vault escrow, passed on: their
		 * layer opened and the inside re-encrypted to the requested key. Absent
		 * when the requester has no escrow with this partner.
		 */
		escrowRelay?: { escrowId: string; ciphertext: string };
	},
	now: Date = new Date()
): Promise<
	{ ok: true } | { ok: false; reason: 'no-such-request' | 'no-vault' | 'no-such-escrow' }
> {
	const request = await findRestorableRequest(db, input, now);
	if (!request) {
		return { ok: false, reason: 'no-such-request' };
	}
	const vaultId = await partnershipVaultIdFor(db, input.partnershipId);
	if (!vaultId) {
		return { ok: false, reason: 'no-vault' };
	}
	// The relay must be for the requester's escrow held in *this* partnership:
	// a partner can only pass on their own half.
	let relay: { escrowId: string; ciphertext: string; recoveryRequestId: string } | null = null;
	if (input.escrowRelay) {
		const escrow = await escrowForRequester(db, {
			requesterId: request.requesterId,
			partnershipId: input.partnershipId
		});
		if (escrow?.id !== input.escrowRelay.escrowId || !request.recoveryRequestId) {
			return { ok: false, reason: 'no-such-escrow' };
		}
		relay = { ...input.escrowRelay, recoveryRequestId: request.recoveryRequestId };
	}

	await db.batch([
		db
			.insert(vaultWraps)
			.values({
				vaultId,
				userId: request.requesterId,
				ciphertext: input.vaultWrap,
				forRecipient: request.requestedRecipient
			})
			.onConflictDoUpdate({
				target: [vaultWraps.vaultId, vaultWraps.userId, vaultWraps.forRecipient],
				set: { ciphertext: input.vaultWrap, updatedAt: now }
			}),
		...(relay
			? [
					db
						.insert(vaultEscrowRelays)
						.values(relay)
						.onConflictDoUpdate({
							target: [vaultEscrowRelays.escrowId, vaultEscrowRelays.recoveryRequestId],
							set: { ciphertext: relay.ciphertext, updatedAt: now }
						})
				]
			: []),
		db
			.update(historyRestoreRequests)
			.set({ status: 'completed', resolvedAt: now })
			.where(eq(historyRestoreRequests.id, input.requestId)),
		...(request.recoveryRequestId
			? [
					db
						.update(accountRecoveryRequests)
						.set({ status: 'approved', approvedBy: input.actorId, resolvedAt: now })
						.where(
							and(
								eq(accountRecoveryRequests.id, request.recoveryRequestId),
								eq(accountRecoveryRequests.status, 'pending'),
								gt(accountRecoveryRequests.expiresAt, now)
							)
						)
				]
			: [])
	]);
	return { ok: true };
}

/** Marks a restore request refused, so the requester is told rather than left waiting. */
export async function declineHistoryRestore(
	db: Db,
	input: { partnershipId: string; requestId: string; actorId: string },
	now: Date = new Date()
): Promise<boolean> {
	const membership = await requireMembership(db, input.partnershipId, input.actorId);
	if (!membership) {
		return false;
	}

	const rows = await db
		.update(historyRestoreRequests)
		.set({ status: 'declined', resolvedAt: now })
		.where(
			and(
				eq(historyRestoreRequests.id, input.requestId),
				eq(historyRestoreRequests.partnershipId, input.partnershipId),
				eq(historyRestoreRequests.status, 'pending'),
				ne(historyRestoreRequests.requesterId, input.actorId)
			)
		)
		.returning({ id: historyRestoreRequests.id });

	return rows.length > 0;
}

// ── teardown ─────────────────────────────────────────────────────────────────

/**
 * Deletes every stored object for a partnership, under both lifetimes.
 *
 * Nothing cascades from D1 into the object store, so this has to be called
 * when a partnership is disconnected. It deletes by prefix rather than by
 * enumerating rows, which means it still works after the rows have gone — the
 * escape hatch if it ever fails midway — and it takes the orphans of failed
 * sends with it, which no row points at.
 *
 * Each prefix is attempted even if the other fails, so one bad call does not
 * leave the rest behind.
 *
 * Failure is reported, not thrown: leaving an unreadable blob behind is a much
 * smaller problem than refusing to let someone disconnect, which
 * docs/partners.md is explicit must never be gated.
 */
export async function purgePartnershipMedia(
	store: MediaStore,
	partnershipId: string
): Promise<{ deleted: number; failed: boolean }> {
	let deleted = 0;
	let failed = false;
	for (const lifetime of MEDIA_LIFETIMES) {
		try {
			deleted += await store.deletePrefix(partnershipMediaPrefix(lifetime, partnershipId));
		} catch {
			failed = true;
		}
	}
	return { deleted, failed };
}

/**
 * The /partner/[id] messages card.
 *
 * Counts only, and that is not a shortcut: every body is encrypted to keys the
 * server does not hold, so there is no preview text it could return. The board
 * itself decrypts in the browser — see docs/encryption.md.
 *
 * The unread predicate is `listUnreadCounts`'s, character for character. It has
 * to stay that way, or the partner card and /home would disagree about what
 * "unread" means for the same partnership.
 */
export async function getPartnerMessagesWidget(
	db: Db,
	partnershipId: string,
	userId: string
): Promise<PartnerMessagesWidgetView> {
	const rows = await db
		.select({
			totalThreads: sql<number>`count(*)`,
			unreadThreads: sql<number>`sum(
				case when ${messageThreads.lastMessageSenderId} <> ${userId}
				      and (${threadReads.lastReadMessageAt} is null
				           or ${messageThreads.lastMessageAt} > ${threadReads.lastReadMessageAt})
				     then 1 else 0 end
			)`,
			newestAt: sql<number | null>`max(${messageThreads.lastMessageAt})`
		})
		.from(messageThreads)
		.leftJoin(
			threadReads,
			and(eq(threadReads.threadId, messageThreads.id), eq(threadReads.userId, userId))
		)
		.where(eq(messageThreads.partnershipId, partnershipId));

	const [row] = rows;
	const newestAt = row?.newestAt ?? null;
	return {
		unreadThreads: Number(row?.unreadThreads ?? 0),
		totalThreads: Number(row?.totalThreads ?? 0),
		newestAt: newestAt === null ? null : new Date(Number(newestAt))
	};
}
