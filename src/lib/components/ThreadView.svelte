<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { invalidate } from '$app/navigation';
	import type { MessageMetadataPayload, MessagePayload } from '$lib/crypto/messages';
	import { currentKeyring, unlockedIdentity } from '$lib/crypto/session.svelte';
	import {
		buildReaction,
		fillMissingMessageMetadata,
		openMessage,
		openMessageMetadata,
		openReaction,
		refreshMessageMetadata,
		sendMessage
	} from '$lib/messaging/client';
	import { openDraft } from '$lib/messaging/drafts';
	// LEGACY-RICHTEXT — delete with the legacy reader; see docs/temporary-code.md
	import { migrateLegacyMessages } from '$lib/richtext-legacy-migrate';
	import { scrollIntoViewWithin } from '$lib/scroll-parent';
	import type { MessageView, PartnerRecipientsView, TagView, ThreadView } from '$lib/types';
	import MessageBubble from './MessageBubble.svelte';
	import MessageComposer from './MessageComposer.svelte';
	import TagPicker from './TagPicker.svelte';

	let {
		thread,
		partnershipId,
		tags = [],
		recipients,
		/**
		 * False while this device distrusts one of the two keys.
		 *
		 * The reply box is removed rather than disabled: the reason is a callout
		 * on the board, and an inert textarea with no explanation next to it
		 * reads as a bug. Passed in rather than derived here so the board and
		 * the thread cannot disagree about it.
		 */
		canSend = true
	}: {
		thread: ThreadView;
		partnershipId: string;
		tags?: TagView[];
		recipients: PartnerRecipientsView;
		canSend?: boolean;
	} = $props();

	const keyring = $derived(currentKeyring());
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
	let listElement: HTMLElement | undefined = $state();
	const attemptedMetadataBackfill = new SvelteSet<string>();

	$effect(() => {
		const unlocked = keyring.status === 'unlocked' ? keyring.identity : null;
		if (!unlocked) {
			return;
		}

		// Captured so a run superseded by a newer one bails out rather than
		// writing stale plaintext over fresh — the same guard EdgeTask.svelte uses.
		const { messages } = thread;
		let cancelled = false;

		void (async () => {
			for (const message of messages) {
				if (cancelled) {
					return;
				}
				if (!(message.id in bodies)) {
					bodies[message.id] = await openMessage(message.ciphertext, unlocked);
				}
				if (message.metadataCiphertext !== null && !(message.id in metadata)) {
					metadata[message.id] = await openMessageMetadata(message.metadataCiphertext, unlocked);
				}
				const decoded: { emoji: string; mine: boolean }[] = [];
				for (const reaction of message.reactions) {
					const emoji = await openReaction(reaction.ciphertext, unlocked);
					if (emoji) {
						decoded.push({ emoji, mine: reaction.mine });
					}
				}
				if (cancelled) {
					return;
				}
				reactions[message.id] = decoded;
			}

			// LEGACY-RICHTEXT — once everything on screen is readable, quietly
			// convert and re-save any of the viewer's own pre-rich-text bodies.
			// Runs last and its failures are swallowed: this is housekeeping, and
			// it must never get in the way of reading a thread. See
			// docs/temporary-code.md.
			if (cancelled) {
				return;
			}
			// `bodies` and `targets` are read through `untrack` on purpose. Both
			// are reactive, and this effect already *writes* `bodies`; making it
			// depend on them as well would rebuild the whole decryption pass on
			// every change — the same class of bug AGENTS.md records for effects
			// that read the `data` prop.
			const entries = untrack(() =>
				messages
					.filter((message) => message.mine && message.bodyFormat === 'plain')
					.map((message) => ({ id: message.id, payload: bodies[message.id] }))
			);
			await migrateLegacyMessages({
				partnershipId,
				entries,
				targets: untrack(() => targets)
			});
		})();

		return () => {
			cancelled = true;
		};
	});

	// Keeps the newest message in view. Goes through the shared scroll helper
	// because `<main>` is the only scrolling element in this shell — the window
	// does not scroll, so window.scrollTo would move nothing.
	$effect(() => {
		const count = thread.messages.length;
		void tick().then(() => {
			if (!listElement || count !== thread.messages.length) {
				return;
			}
			const last = listElement.lastElementChild;
			if (last) {
				scrollIntoViewWithin(last, listElement, { behavior: 'auto', gap: 8 });
			}
		});
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

	const targets = $derived([recipients.mine, recipients.theirs]);

	function formatWhen(date: Date): string {
		return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
	}

	async function send(message: { text: string; files: File[] }): Promise<string | null> {
		const outcome = await sendMessage(
			{ kind: 'reply', partnershipId, threadId: thread.id },
			message,
			targets
		);
		if (!outcome.ok) {
			return outcome.message;
		}
		await invalidate(`messages:thread:${thread.id}`);
		return null;
	}

	async function react(message: MessageView, emoji: string) {
		const ciphertext = await buildReaction(emoji, targets);
		const response = await fetch(
			`/api/partnerships/${partnershipId}/messages/${message.id}/reaction`,
			{
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ciphertext })
			}
		);
		if (response.ok) {
			await invalidate(`messages:thread:${thread.id}`);
		}
	}

	async function clearReaction(message: MessageView) {
		const response = await fetch(
			`/api/partnerships/${partnershipId}/messages/${message.id}/reaction`,
			{ method: 'DELETE' }
		);
		if (response.ok) {
			await invalidate(`messages:thread:${thread.id}`);
		}
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
		if (targets.length === 0) {
			return;
		}
		const key = `${message.id}:${href}`;
		if (attemptedMetadataBackfill.has(key)) {
			return;
		}
		attemptedMetadataBackfill.add(key);
		const current = metadata[message.id] ?? null;
		const next = await fillMissingMessageMetadata(partnershipId, message.id, href, current, targets);
		if (next) {
			metadata[message.id] = next;
		}
	}

	async function refreshEmbed(message: MessageView, href: string) {
		if (targets.length === 0) {
			return;
		}
		const current = metadata[message.id] ?? null;
		const next = await refreshMessageMetadata(partnershipId, message.id, href, current, targets);
		if (next) {
			metadata[message.id] = next;
		}
	}
</script>

<div class="thread">
	<div class="thread-tags">
		<TagPicker {partnershipId} {tags} threadId={thread.id} bind:selectedIds={selectedTagIds} />
	</div>
	<ul bind:this={listElement} class="messages">
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
