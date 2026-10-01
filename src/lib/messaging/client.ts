/**
 * Sending and reading messages from the browser.
 *
 * The seam between the encryption in `src/lib/crypto/` and the endpoints under
 * `src/routes/api/`. Everything here runs in the browser: it has to, because
 * the request body is ciphertext only the browser can produce.
 */

import {
	decryptAttachment,
	decryptMessageMetadata,
	decryptPayload,
	encryptAttachment,
	encryptMessageMetadata,
	encryptPayload,
	type MessageAttachmentInfo,
	type MessageMetadataPayload,
	type MessagePayload,
	type ReactionPayload
} from '$lib/crypto/messages';
import { fetchEmbedMetadata } from '$lib/embeds';
import { attachmentBudget } from '$lib/media-quality';
import {
	DEFAULT_THREAD_ICON,
	MAX_ATTACHMENTS_PER_MESSAGE,
	MAX_BODY_CHARS,
	MAX_VIDEO_BYTES,
	type MediaTtl
} from '$lib/messaging';
import { NETWORK_FAILURE, SERVER_FAILURE, tryFetch } from '$lib/request-failure.svelte';
import {
	documentEmbedUrls,
	documentToPlainText,
	isRichTextDocumentEmpty,
	parseStoredRichText
} from '$lib/richtext';

/** One file as it is about to be encrypted: already compressed, if it was going to be. */
export type ComposedAttachment = {
	file: File;
	/**
	 * How long this file lives. `never` needs the `permanentMedia` feature,
	 * which the server checks.
	 */
	mediaTtl: MediaTtl;
};

export type ComposedMessage = {
	text: string;
	attachments: ComposedAttachment[];
	/**
	 * Whether the sender's account holds `highQualityMedia`, which decides how
	 * many bytes the message may carry. Only that: the server applies its own
	 * byte budget regardless.
	 */
	highQualityMedia?: boolean;
};

/** A refusal the composer can render, worked out before anything is sent. */
export type ComposeProblem = {
	kind: 'empty' | 'too-long' | 'too-many' | 'too-big' | 'video-too-big';
	message: string;
};

/**
 * Checks what the composer collected, before encrypting or uploading anything.
 *
 * The same limits the endpoint enforces, checked here so a 25 MB refusal costs
 * nothing. The server's copy is the one that counts; this one is a courtesy —
 * see the note in `src/lib/schemas/messageForm.ts`.
 */
export function checkComposed(message: ComposedMessage): ComposeProblem | null {
	return (
		checkText(message.text, message.attachments.length) ??
		checkSizes(
			message.attachments.map((attachment) => attachment.file),
			message.highQualityMedia ?? false
		)
	);
}

/**
 * The checks that need only the text and how many files there are — which the
 * composer can run while its files are still compressing and their sizes are
 * not known yet.
 */
export function checkText(text: string, attachmentCount: number): ComposeProblem | null {
	/**
	 * Emptiness and length are both measured on the *visible text*, never on the
	 * stored string. The stored string is a Lexical document — JSON several
	 * times the size of the prose it carries — so counting it would call an
	 * empty editor full and cut people off after a few hundred typed
	 * characters.
	 */
	const document = parseStoredRichText(text);
	if (isRichTextDocumentEmpty(document) && attachmentCount === 0) {
		return { kind: 'empty', message: 'Write something first' };
	}
	if (documentToPlainText(document).length > MAX_BODY_CHARS) {
		// Refused rather than truncated: a document cannot be cut at a character
		// offset without corrupting it, and silently dropping the end of
		// somebody's message is worse than asking them to shorten it.
		return {
			kind: 'too-long',
			message: `That message is over the ${MAX_BODY_CHARS.toLocaleString()} character limit`
		};
	}
	if (attachmentCount > MAX_ATTACHMENTS_PER_MESSAGE) {
		return {
			kind: 'too-many',
			message: `At most ${MAX_ATTACHMENTS_PER_MESSAGE} files in one message`
		};
	}
	return null;
}

/** The byte limits, on the files exactly as they are about to be encrypted. */
export function checkSizes(files: File[], highQualityMedia: boolean): ComposeProblem | null {
	const oversizedVideo = files.find(
		(file) => file.type.startsWith('video/') && file.size > MAX_VIDEO_BYTES
	);
	if (oversizedVideo) {
		return {
			kind: 'video-too-big',
			message: `Videos have to be under ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB — they are downloaded in full before they play`
		};
	}
	const budget = attachmentBudget(highQualityMedia);
	const total = files.reduce((sum, file) => sum + file.size, 0);
	if (total > budget) {
		return {
			kind: 'too-big',
			message: `Those files add up to more than ${Math.round(budget / 1024 / 1024)} MB`
		};
	}
	return null;
}

function kindOf(file: File): 'image' | 'video' {
	return file.type.startsWith('video/') ? 'video' : 'image';
}

/**
 * Encrypts a message and its files into a body ready to post.
 *
 * Each file is sealed under its own ephemeral identity, and that identity goes
 * into the manifest *inside* the encrypted body — see `MessagePayload`.
 *
 * Which is why the ids are generated here rather than by the server: the
 * manifest has to name them before it is sealed, and asking the server first
 * would mean either a second round trip to re-seal the body or an unencrypted
 * manifest. They travel alongside as `fileIds`, in the same order as the files,
 * and the endpoint validates them.
 */
async function buildBody(message: ComposedMessage, recipients: string[]): Promise<FormData> {
	const attachments: MessageAttachmentInfo[] = [];
	const body = new FormData();
	// Already canonical: the editor serialises through the same schema the
	// reader validates with, so there is nothing left to normalise.
	const { text } = message;
	const metadataPromise = resolveMessageMetadata(text);

	for (const { file, mediaTtl } of message.attachments) {
		const sealed = await encryptAttachment(file);
		const id = crypto.randomUUID();
		attachments.push({
			id,
			key: sealed.key,
			kind: kindOf(file),
			mimeType: file.type || 'application/octet-stream',
			fileName: file.name
		});
		// A Blob, not the stream: FormData cannot carry a ReadableStream.
		body.append('files', new Blob([await new Response(sealed.body).arrayBuffer()]), file.name);
		// Appended in lockstep with the file above; order is what pairs them.
		body.append('fileIds', id);
		body.append('mediaTtlMs', String(mediaTtl));
	}

	const payload: MessagePayload = {
		version: 1,
		text,
		attachments
	};
	body.set('ciphertext', await encryptPayload(payload, recipients));
	const metadata = await metadataPromise.catch(() => null);
	if (metadata) {
		body.set('metadataCiphertext', await encryptMessageMetadata(metadata, recipients));
	}
	return body;
}

/**
 * The URLs whose embed metadata is worth caching with the message.
 *
 * Exactly the document's embed nodes. Because an embed is an explicit node
 * rather than something re-derived from the prose, the set cached here cannot
 * drift from the set the reader later draws — which is what the old
 * `findRenderableLinks` arrangement had to guarantee by convention.
 */
function embeddableUrls(text: string): string[] {
	return documentEmbedUrls(parseStoredRichText(text));
}

async function resolveMessageMetadata(text: string): Promise<MessageMetadataPayload | null> {
	const urls = embeddableUrls(text);
	const embeds = await fetchEmbedMetadata(urls);
	if (embeds.length === 0) {
		return null;
	}
	return { version: 1, embeds };
}

export type SendTarget =
	| { kind: 'new-thread'; partnershipId: string; tagIds?: string[] }
	| { kind: 'reply'; partnershipId: string; threadId: string };

export type SendOutcome =
	| { ok: true; threadId: string; messageId: string }
	| { ok: false; message: string };

function endpointFor(target: SendTarget): string {
	return target.kind === 'new-thread'
		? `/api/partnerships/${target.partnershipId}/threads`
		: `/api/partnerships/${target.partnershipId}/threads/${target.threadId}/messages`;
}

export async function sendMessage(
	target: SendTarget,
	message: ComposedMessage,
	recipients: string[]
): Promise<SendOutcome> {
	const problem = checkComposed(message);
	if (problem) {
		return { ok: false, message: problem.message };
	}
	if (recipients.length === 0) {
		return { ok: false, message: 'Your partner has not set up encrypted messaging yet' };
	}

	const body = await buildBody(message, recipients);
	if (target.kind === 'new-thread') {
		body.set('icon', DEFAULT_THREAD_ICON);
		body.set('tagIds', JSON.stringify(target.tagIds ?? []));
	}

	const response = await tryFetch(endpointFor(target), { method: 'POST', body });
	if (!response) {
		// Shown in the composer, with what was typed still in it.
		return { ok: false, message: NETWORK_FAILURE };
	}
	if (!response.ok) {
		return { ok: false, message: await describeFailure(response) };
	}

	const result = (await response.json()) as { threadId?: string; messageId: string };
	return {
		ok: true,
		threadId: target.kind === 'reply' ? target.threadId : (result.threadId ?? ''),
		messageId: result.messageId
	};
}

async function describeFailure(response: Response): Promise<string> {
	// SvelteKit's `error()` bodies are JSON with a `message`; the send
	// endpoints put the data layer's refusal reason there.
	const body = (await response.json().catch(() => null)) as { message?: string } | null;
	if (response.status === 413) {
		return body?.message === 'needs-high-quality-media'
			? `Those files add up to more than ${Math.round(attachmentBudget(false) / 1024 / 1024)} MB`
			: 'That is too large to send';
	}
	if (response.status === 404) {
		return 'That conversation is no longer there';
	}
	if (response.status === 401) {
		return 'You have been signed out';
	}
	if (response.status === 403) {
		return 'Your account cannot send media that never self-destructs';
	}
	// A 5xx body says "Internal Error" at best, which tells nobody anything.
	if (response.status >= 500) {
		return SERVER_FAILURE;
	}
	return body?.message ?? 'Could not send that';
}

// ── reading ──────────────────────────────────────────────────────────────────

export type DecryptedMessage = {
	/** Null when this identity cannot open it — see `openMessage`. */
	payload: MessagePayload | null;
};

/**
 * Opens a message body.
 *
 * A null payload is not an error: a board can hold messages encrypted to a key
 * the user no longer has, if their password was reset. The UI renders those as
 * "ask your partner to restore this" rather than as a failure.
 */
export async function openMessage(
	ciphertext: string,
	identity: CryptoKey | string
): Promise<MessagePayload | null> {
	return await decryptPayload<MessagePayload>(ciphertext, identity);
}

export async function openMessageMetadata(
	ciphertext: string,
	identity: CryptoKey | string
): Promise<MessageMetadataPayload | null> {
	return await decryptMessageMetadata(ciphertext, identity);
}

export async function openReaction(
	ciphertext: string,
	identity: CryptoKey | string
): Promise<string | null> {
	const payload = await decryptPayload<ReactionPayload>(ciphertext, identity);
	return payload?.emoji ?? null;
}

export async function buildReaction(emoji: string, recipients: string[]): Promise<string> {
	return await encryptPayload({ version: 1, emoji }, recipients);
}

export async function fillMissingMessageMetadata(
	partnershipId: string,
	messageId: string,
	href: string,
	current: MessageMetadataPayload | null,
	recipients: string[]
): Promise<MessageMetadataPayload | null> {
	if (recipients.length === 0) {
		return null;
	}
	if (current?.embeds.some((embed) => embed.href === href)) {
		return current;
	}

	return await writeMessageMetadataEntry(
		partnershipId,
		messageId,
		href,
		current,
		recipients,
		false
	);
}

export async function refreshMessageMetadata(
	partnershipId: string,
	messageId: string,
	href: string,
	current: MessageMetadataPayload | null,
	recipients: string[]
): Promise<MessageMetadataPayload | null> {
	if (recipients.length === 0) {
		return null;
	}
	return await writeMessageMetadataEntry(partnershipId, messageId, href, current, recipients, true);
}

async function writeMessageMetadataEntry(
	partnershipId: string,
	messageId: string,
	href: string,
	current: MessageMetadataPayload | null,
	recipients: string[],
	replaceExisting: boolean
): Promise<MessageMetadataPayload | null> {
	// A backfill is fired by an embed scrolling into view, so a long thread can
	// ask for many at once and they wait in the page's embed queue. A refresh
	// is someone pressing a button and waiting on it, so it goes straight out.
	const embeds = await fetchEmbedMetadata([href], { queued: !replaceExisting });
	const embed = embeds.find((entry) => entry.href === href) ?? null;
	if (!embed) {
		return null;
	}
	const existing = current?.embeds ?? [];
	const present = existing.some((entry) => entry.href === href);
	if (present && !replaceExisting) {
		return current;
	}

	const metadata: MessageMetadataPayload = {
		version: 1,
		embeds: present
			? existing.map((entry) => (entry.href === href ? embed : entry))
			: [...existing, embed]
	};

	const metadataCiphertext = await encryptMessageMetadata(metadata, recipients);
	const response = await fetch(
		`/api/partnerships/${partnershipId}/messages/${messageId}/metadata`,
		{
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ metadataCiphertext })
		}
	);
	if (!response.ok) {
		return null;
	}
	return metadata;
}

/**
 * The server's 410 for an attachment that has self-destructed. Its own class so
 * a preview can show the self-destructed placeholder rather than "Could not
 * open this file", which would read as a fault.
 */
export class MediaExpiredError extends Error {
	constructor() {
		super('This media has self-destructed');
		this.name = 'MediaExpiredError';
	}
}

/**
 * Downloads and decrypts one attachment into an object URL.
 *
 * The caller owns the URL and must revoke it — `AttachmentPreview` does that on
 * destroy. Downloaded in full before anything can be shown, because age
 * ciphertext is not seekable; that is why videos are capped lower than the
 * message budget.
 */
export async function fetchAttachment(
	partnershipId: string,
	info: MessageAttachmentInfo
): Promise<{ url: string; blob: Blob }> {
	const response = await fetch(`/api/partnerships/${partnershipId}/attachments/${info.id}`);
	if (response.status === 410) {
		throw new MediaExpiredError();
	}
	if (!response.ok) {
		throw new Error(`Could not download attachment (${response.status})`);
	}
	const blob = await decryptAttachment(await response.arrayBuffer(), info);
	return { url: URL.createObjectURL(blob), blob };
}
