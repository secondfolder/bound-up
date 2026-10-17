<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { invalidate } from '$app/navigation';
	import type { MessageMetadataPayload, MessagePayload } from '$lib/crypto/messages';
	import { currentKeyring, unlockedIdentity } from '$lib/crypto/session.svelte';
	import { writeGrantFor } from '$lib/crypto/trust.svelte';
	import { partnershipVault } from '$lib/crypto/vaults.svelte';
	import {
		buildReaction,
		type ComposedMessage,
		fillMissingMessageMetadata,
		type MessageWriteKeys,
		openMessage,
		openMessageMetadata,
		openReaction,
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
		highQualityMedia = false
	}: {
		thread: ThreadView;
		partnershipId: string;
		partner: { name: string; image: string | null };
		tags?: TagView[];
		canSend?: boolean;
		permanentMedia?: boolean;
		highQualityMedia?: boolean;
	} = $props();

	const keyring = $derived(currentKeyring());
	// `undefined` until vaults are worked out; sealed rows wait for it, and the
	// effect below runs again when it arrives.
	const vault = $derived(partnershipVault(partnershipId));
	// Selection is the live control state; re-deriving it on every thread refresh
	// would undo a tag click while the assignment request is in flight.
	// svelte-ignore state_referenced_locally
	let selectedTagIds = $state(thread.tags?.map((tag) => tag.id) ?? []);

	/**
	 * Decrypted bodies, by message id.
	 *
	 * `undefined` means "still working", `null` means "this identity cannot open
	 * it" — a real state, not an error, for a message sent to a key the user
	 * replaced. `MessageBubble` renders the three cases differently.
	 */
	let bodies: Record<string, MessagePayload | null> = $state({});
	let metadata: Record<string, MessageMetadataPayload | null> = $state({});
	let reactions: Record<string, { emoji: string; mine: boolean }[]> = $state({});
	const attemptedMetadataBackfill = new SvelteSet<string>();

	$effect(() => {
		const unlocked = keyring.status === 'unlocked' ? keyring.identity : null;
		if (!unlocked) {
			return;
		}
		const keys = { identity: unlocked, vault };

		// Captured so a run superseded by a newer one bails out rather than
		// writing stale plaintext over fresh — the same guard EdgeTask.svelte uses.
		const { messages } = thread;
		let cancelled = false;

		void (async () => {
			for (const message of messages) {
				if (cancelled) {
					return;
				}
				// `undefined` is a sealed row whose vault is not open yet: left unset,
				// so it reads as still working, and filled in when this runs again.
				// `untrack`, because this effect writes these records and must not
				// also depend on them.
				if (!untrack(() => message.id in bodies)) {
					const body = await openMessage(message, keys);
					if (body !== undefined) {
						bodies[message.id] = body;
					}
				}
				if (message.metadataCiphertext !== null && !untrack(() => message.id in metadata)) {
					const opened = await openMessageMetadata(message, keys);
					if (opened !== undefined) {
						metadata[message.id] = opened;
					}
				}
				const decoded: { emoji: string; mine: boolean }[] = [];
				for (const reaction of message.reactions) {
					const emoji = await openReaction(reaction, keys);
					if (emoji) {
						decoded.push({ emoji, mine: reaction.mine });
					}
				}
				if (cancelled) {
					return;
				}
				reactions[message.id] = decoded;
			}
		})();

		return () => {
			cancelled = true;
		};
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
		const current = metadata[message.id] ?? null;
		const next = await fillMissingMessageMetadata(partnershipId, message, href, current, keys);
		if (next) {
			metadata[message.id] = next;
		}
	}

	async function refreshEmbed(message: MessageView, href: string) {
		const keys = writeKeys();
		if (!keys) {
			reportRequestFailure(null, "Couldn't refresh this preview. Please try again.");
			return;
		}
		const current = metadata[message.id] ?? null;
		const next = await refreshMessageMetadata(partnershipId, message, href, current, keys);
		if (!next) {
			// Pressed and waited on, unlike the backfill above, which is
			// opportunistic and simply tries again on the next view.
			reportRequestFailure(null, "Couldn't refresh this preview. Please try again.");
			return;
		}
		metadata[message.id] = next;
	}
</script>

<div class="thread">
	<div class="thread-tags">
		<TagPicker {partnershipId} {tags} threadId={thread.id} bind:selectedIds={selectedTagIds} />
	</div>
	<!-- Opens on the newest message, and follows new ones only for a reader
	     already at the end: one who has scrolled up to read is left there. -->
	<ul class="messages" {@attach followEnd}>
		{#each thread.messages as message (message.id)}
			<MessageBubble
				{message}
				payload={message.id in bodies ? bodies[message.id] : undefined}
				metadata={message.id in metadata ? metadata[message.id] : undefined}
				onEmbedActivated={(href) => cacheEmbedDetails(message, href)}
				onRefreshEmbed={(href) => refreshEmbed(message, href)}
				{partnershipId}
				when={formatWhen(message.createdAt)}
				reactions={reactions[message.id] ?? []}
				onReact={(emoji) => react(message, emoji)}
				onClearReaction={() => clearReaction(message)}
				seenBy={message.id === thread.seenMessageId ? partner : null}
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
		padding: var(--wa-space-m);
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		flex: 1 1 auto;
	}

	.thread-tags {
		padding: var(--wa-space-s) var(--wa-space-m) 0;
	}

	footer {
		position: sticky;
		inset-block-end: 0;
		padding: var(--wa-space-s) var(--wa-space-m) var(--wa-space-m);
		/* So bubbles scrolling under the composer stay legible on the way past. */
		background: linear-gradient(
			to bottom,
			transparent,
			var(--wa-color-surface-default, white) 0.75rem
		);
	}
</style>
