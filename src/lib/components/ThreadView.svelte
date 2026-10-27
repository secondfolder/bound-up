<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { invalidate } from '$app/navigation';
	import type { MessageMetadataPayload } from '$lib/crypto/messages';
	import { unlockedIdentity } from '$lib/crypto/session.svelte';
	import { writeGrantFor } from '$lib/crypto/trust.svelte';
	import { partnershipVault } from '$lib/crypto/vaults.svelte';
	import { timelineMarks } from '$lib/message-timeline';
	import {
		buildReaction,
		type ComposedMessage,
		fillMissingMessageMetadata,
		type MessageWriteKeys,
		openedMessage,
		openedMessageMetadata,
		openedReaction,
		refreshMessageMetadata,
		sendMessage
	} from '$lib/messaging/client';
	import { openDraft } from '$lib/messaging/drafts';
	import { reportRequestFailure, tryFetch } from '$lib/request-failure.svelte';
	import { followEnd } from '$lib/scroll-parent';
	import type { MessageView, TagView, ThreadView } from '$lib/types';
	import MessageBubble from './MessageBubble.svelte';
	import MessageComposer from './MessageComposer.svelte';
	import TagPicker from './TagPicker.svelte';

	let {
		thread,
		partnershipId,
		/** For the read receipt's avatar. */
		partner,
		tags = [],
		/**
		 * False while this device distrusts one of the two keys.
		 *
		 * The reply box is removed rather than disabled: the reason is a callout
		 * on the board, and an inert textarea with no explanation next to it
		 * reads as a bug. Passed in rather than derived here so the board and
		 * the thread cannot disagree about it.
		 */
		canSend = true,
		/** Display only: offers "Never" in the composer. The server enforces it. */
		permanentMedia = false,
		/** Display only: offers a choice of quality. The server enforces a byte budget. */
		highQualityMedia = false,
		/**
		 * The oldest message the viewer had not read when the page loaded, which
		 * the thread opens with at the top. Only its value on opening counts:
		 * every load after, on a live event, has just moved the read mark.
		 */
		firstUnreadId = null
	}: {
		thread: ThreadView;
		partnershipId: string;
		partner: { name: string; image: string | null };
		tags?: TagView[];
		canSend?: boolean;
		permanentMedia?: boolean;
		highQualityMedia?: boolean;
		firstUnreadId?: string | null;
	} = $props();

	// `undefined` until vaults are worked out; writes wait for it.
	const vault = $derived(partnershipVault(partnershipId));
	// Selection is the live control state; re-deriving it on every thread refresh
	// would undo a tag click while the assignment request is in flight.
	// svelte-ignore state_referenced_locally
	let selectedTagIds = $state(thread.tags?.map((tag) => tag.id) ?? []);

	/**
	 * Embed details this view has looked up or refreshed itself, by message id.
	 * They are stored on the message as well, but a reader would otherwise
	 * show the old sidecar until the next load brought the new one back.
	 */
	let metadataUpdates: Record<string, MessageMetadataPayload> = $state({});
	const attemptedMetadataBackfill = new SvelteSet<string>();

	/**
	 * Each message's body, sidecar and reactions, opened through
	 * `sealedReader`. A body is `undefined` while its vault is not open yet,
	 * null when this device cannot open it — a real state, not an error, for
	 * a message sealed to a vault the user lost — and `MessageBubble` renders
	 * the three cases differently. Opened once per page load however often
	 * `invalidate()` hands the thread over again.
	 */
	const opened = $derived(
		thread.messages.map((message) => ({
			body: openedMessage(message),
			metadata: metadataUpdates[message.id] ?? openedMessageMetadata(message),
			reactions: message.reactions.map((reaction) => ({
				emoji: openedReaction(reaction),
				mine: reaction.mine
			}))
		}))
	);

	/**
	 * Which thread's reactions have all been opened once. Until they have, a
	 * reaction appearing is one that was already there, opening, and does not
	 * pop; after, it is one that has just been added.
	 */
	let reactionsOpenedFor: string | null = $state(null);
	const reactionsOpened = $derived(
		opened.every((message) => message.reactions.every((reaction) => reaction.emoji !== undefined))
	);
	$effect(() => {
		if (reactionsOpened) {
			reactionsOpenedFor = threadId;
		}
	});

	/**
	 * The reply box's draft, one per thread.
	 *
	 * Keyed on a `$derived` string, never on `thread`: the page component is
	 * reused across threads, and `invalidate()` reassigns `thread` on every
	 * reply that arrives. Depending on the prop would re-open the draft and
	 * remount the composer under someone mid-sentence; depending on the id
	 * re-opens it only when the thread really changes, which is also exactly
	 * when one thread's words must stop being saved under the other's key.
	 *
	 * The identity is read untracked so a lock elsewhere does not remount it
	 * either — the page swaps this whole view out for the unlock panel anyway.
	 */
	const threadId = $derived(thread.id);

	/**
	 * The message following the end stops at (`followEnd`'s `holdAt`): the
	 * thread opens on the newest, but no further down than puts the oldest
	 * unread at the top, so a reader coming back to several messages starts at
	 * the first of them rather than below it. Let go as soon as anything newer
	 * arrives — a reply, or one sent from here — which is followed as usual.
	 */
	// svelte-ignore state_referenced_locally
	let heldId: string | null = $state(firstUnreadId);
	const newestId = $derived(thread.messages.at(-1)?.id ?? null);
	// svelte-ignore state_referenced_locally
	let openedOn = { thread: threadId, newest: newestId };
	$effect(() => {
		const now = { thread: threadId, newest: newestId };
		if (now.thread !== openedOn.thread) {
			// The page component is reused across threads: another thread is
			// another opening, at its own oldest unread.
			heldId = untrack(() => firstUnreadId);
		} else if (now.newest !== openedOn.newest) {
			heldId = null;
		}
		openedOn = now;
	});
	/**
	 * Untracked: `followEnd` asks for it as it attaches, and reading `heldId`
	 * there would make the attachment depend on it, tearing following down
	 * and starting it afresh (at the end, jumping) every time the hold lets go.
	 */
	function heldElement(list: HTMLElement): Element | null {
		const id = untrack(() => heldId);
		return id ? list.querySelector(`[data-message-id="${CSS.escape(id)}"]`) : null;
	}
	function draftFor(id: string) {
		return openDraft({ kind: 'thread', threadId: id }, untrack(unlockedIdentity));
	}

	/**
	 * What a write needs right now: the vault, and the trust check's permission
	 * to write into it. Null while either is missing — the vault still opening,
	 * or a key this device has been warned about — and every write below
	 * refuses rather than going ahead without it.
	 */
	function writeKeys(): MessageWriteKeys | null {
		if (!vault) {
			return null;
		}
		const grant = writeGrantFor(partnershipId, vault.id);
		return grant ? { vault, grant } : null;
	}

	/**
	 * The messages the thread opened with, by id. Anything not in it arrived
	 * while the thread was on screen, a reply sent from here or one from the
	 * partner, and animates in. Recomputed only when the thread itself changes:
	 * the page component is reused across threads.
	 */
	const loadedIds = $derived.by(() => {
		void threadId;
		return untrack(() => new Set(thread.messages.map((message) => message.id)));
	});

	/** Which messages show their time, and where each day starts (`message-timeline.ts`). */
	const marks = $derived(timelineMarks(thread.messages, new Date()));

	function formatWhen(date: Date): string {
		return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
	}

	async function send(message: ComposedMessage): Promise<string | null> {
		const keys = writeKeys();
		if (!keys) {
			return 'Still getting ready to send. Try again in a moment.';
		}
		const outcome = await sendMessage(
			{ kind: 'reply', partnershipId, threadId: thread.id },
			message,
			keys
		);
		if (!outcome.ok) {
			return outcome.message;
		}
		await invalidate(`messages:thread:${thread.id}`);
		return null;
	}

	async function react(message: MessageView, emoji: string) {
		const keys = writeKeys();
		if (!keys) {
			// A reaction is a write like a send, and goes nowhere while this
			// device distrusts the keys. The callout above says why.
			reportRequestFailure(null, 'Reactions are paused until the key warning above is resolved.');
			return;
		}
		const reaction = await buildReaction(emoji, keys);
		const response = await tryFetch(
			`/api/partnerships/${partnershipId}/messages/${message.id}/reaction`,
			{
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(reaction)
			}
		);
		if (!response?.ok) {
			reportRequestFailure(response);
			return;
		}
		await invalidate(`messages:thread:${thread.id}`);
	}

	async function clearReaction(message: MessageView) {
		const response = await tryFetch(
			`/api/partnerships/${partnershipId}/messages/${message.id}/reaction`,
			{ method: 'DELETE' }
		);
		if (!response?.ok) {
			reportRequestFailure(response);
			return;
		}
		await invalidate(`messages:thread:${thread.id}`);
	}

	/**
	 * Caches an embed's details on the message the first time one is loaded.
	 *
	 * Fired by the embed itself, once it is on screen and has nothing cached.
	 * The next reader on either side then draws it without a lookup — which is
	 * the whole point of the encrypted metadata sidecar. Attempts are counted
	 * per message and URL so a provider that has nothing to say is asked once,
	 * not once per re-render.
	 */
	async function cacheEmbedDetails(message: MessageView, href: string) {
		const keys = writeKeys();
		if (!keys) {
			return;
		}
		const key = `${message.id}:${href}`;
		if (attemptedMetadataBackfill.has(key)) {
			return;
		}
		attemptedMetadataBackfill.add(key);
		const next = await fillMissingMessageMetadata(
			partnershipId,
			message,
			href,
			currentMetadata(message),
			keys
		);
		if (next) {
			metadataUpdates[message.id] = next;
		}
	}

	async function refreshEmbed(message: MessageView, href: string) {
		const keys = writeKeys();
		if (!keys) {
			reportRequestFailure(null, "Couldn't refresh this preview. Please try again.");
			return;
		}
		const next = await refreshMessageMetadata(
			partnershipId,
			message,
			href,
			currentMetadata(message),
			keys
		);
		if (!next) {
			// Pressed and waited on, unlike the backfill above, which is
			// opportunistic and simply tries again on the next view.
			reportRequestFailure(null, "Couldn't refresh this preview. Please try again.");
			return;
		}
		metadataUpdates[message.id] = next;
	}

	/** The sidecar as it stands, or null while it is not open (or there is none). */
	function currentMetadata(message: MessageView): MessageMetadataPayload | null {
		return metadataUpdates[message.id] ?? openedMessageMetadata(message) ?? null;
	}
</script>

<div class="thread">
	<div class="thread-tags">
		<TagPicker {partnershipId} {tags} threadId={thread.id} bind:selectedIds={selectedTagIds} />
	</div>
	<!-- Opens on the newest message, or with the oldest unread at the top
	     (`heldId`), and follows new ones only for a reader already at the
	     end: one who has scrolled up to read is left there. -->
	<ul class="messages" {@attach (list) => followEnd(list, { holdAt: () => heldElement(list) })}>
		{#each thread.messages as message, index (message.id)}
			<MessageBubble
				{message}
				payload={opened[index]?.body}
				metadata={opened[index]?.metadata}
				onEmbedActivated={(href) => cacheEmbedDetails(message, href)}
				onRefreshEmbed={(href) => refreshEmbed(message, href)}
				{partnershipId}
				when={formatWhen(message.createdAt)}
				reactions={opened[index]?.reactions.flatMap(({ emoji, mine }) =>
					emoji ? [{ emoji, mine }] : []
				) ?? []}
				onReact={(emoji) => react(message, emoji)}
				onClearReaction={() => clearReaction(message)}
				seenBy={message.id === thread.seenMessageId ? partner : null}
				showTime={marks[index]?.showTime ?? true}
				continuesRun={marks[index]?.continuesRun ?? false}
				day={marks[index]?.day ?? null}
				arrived={!loadedIds.has(message.id)}
				animateReactions={reactionsOpenedFor === thread.id}
			/>
		{/each}
	</ul>

	<!--
		`position: sticky; bottom: 0` INSIDE the scrolling <main> pins this to the
		bottom of the scrollport, directly above AppNav. Sticky against the
		viewport does not work in this shell and teleporting to <body> does not
		either, because <body> does not scroll — EdgeTask.svelte's footer is the
		working precedent, gradient fade included.
	-->
	{#if canSend}
		<footer>
			{#key threadId}
				<!-- Nothing until the draft is read: an editor shown empty and then
				     filled would take whatever was typed in between and drop it. -->
				{#await draftFor(threadId) then draft}
					<MessageComposer
						{send}
						{permanentMedia}
						{highQualityMedia}
						placeholder="Reply…"
						initialText={draft.initial?.text ?? ''}
						onTextChange={(text) => draft.save({ text, tagIds: [] })}
					/>
				{/await}
			{/key}
		</footer>
	{/if}
</div>

<style>
	.thread {
		display: flex;
		flex-direction: column;
		/* flex, not min-height: 100% — the shell only sets min-height on the page
		   wrapper, so a percentage height has no specified ancestor to resolve
		   against. */
		flex: 1 1 auto;
		min-block-size: 0;
	}

	.messages {
		list-style: none;
		margin: 0;
		padding: var(--wa-space-m) var(--page-gutter);
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		flex: 1 1 auto;
	}

	.thread-tags {
		padding: var(--wa-space-s) var(--page-gutter) 0;
	}

	footer {
		position: sticky;
		inset-block-end: 0;
		padding: var(--wa-space-s) var(--page-gutter) var(--wa-space-m);
		/* So bubbles scrolling under the composer stay legible on the way past.
		   A border image rather than a background, for its outset: the thread is
		   a centred column, and a background would stop at the column's edges,
		   leaving a dark box floating over the wash on a wide screen. The outset
		   paints the band across the whole pane, and as ink overflow it never
		   makes anything scroll sideways. */
		border-image:
			linear-gradient(to bottom, transparent, var(--wa-color-surface-default, white) 0.75rem) fill
			0 / 0 / 0 100vmax;
	}
</style>
