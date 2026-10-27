<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import SpaceChip from '$lib/components/context/SpaceChip.svelte';
	import MessageToasts from '$lib/components/MessageToasts.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import PartnerKeyNotice from '$lib/components/PartnerKeyNotice.svelte';
	import ThreadView from '$lib/components/ThreadView.svelte';
	import { currentKeyring } from '$lib/crypto/session.svelte';
	import {
		acceptKeyChange,
		markVerified,
		refreshTrust,
		trustAllowsSending,
		trustFor
	} from '$lib/crypto/trust.svelte';
	import { hasFeature } from '$lib/features';
	import { watchMessages } from '$lib/messaging/live';
	import { partnerName } from '$lib/partner-names.svelte';
	import { spaceRoom } from '$lib/realtime/live';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	/** What the viewer calls them, opened in the browser (`partner-names.svelte.ts`). */
	const partnerShown = $derived(partnerName(data.partner.names));

	const user = $derived(page.data.user as { id: string; email: string });
	const keyring = $derived(currentKeyring());

	/**
	 * The same key check as the board, because a reply is a send too.
	 *
	 * Both screens go through `trust.svelte.ts`, so accepting a key change here
	 * is immediately true on the board and the other way round — the alternative
	 * was a second copy of the state that could disagree with the first.
	 */
	const trust = $derived(trustFor(data.partner.id));
	const canSend = $derived(trustAllowsSending(trust));

	$effect(() => {
		if (keyring.status !== 'unlocked') {
			return;
		}
		void refreshTrust(user.id, data.partner.id, data.recipients);
	});

	/**
	 * Live updates for this thread.
	 *
	 * Subscribed per partnership rather than per thread, because that is what a
	 * Durable Object room is keyed on — one object per partnership, not per
	 * thread. Events for a *different* thread are therefore delivered here too,
	 * and ignored: invalidating this thread's key on someone else's reply would
	 * be a wasted load on every message the couple sends.
	 *
	 * Both ids go through `$derived` strings so the effect does not depend on
	 * the `data` prop, which `invalidate()` reassigns — see the longer note on
	 * the board, and the assertion in `e2e/messaging.spec.ts` that counts
	 * `EventSource` constructions.
	 *
	 * A new message in another thread is not ignored, though: it becomes a
	 * toast, in place of the push this device is not sent while it watches.
	 */
	const partnershipId = $derived(data.partner.id);
	const threadId = $derived(data.thread.id);
	$effect(() => {
		const partnership = partnershipId;
		const thread = threadId;
		return watchMessages({
			room: spaceRoom(partnership),
			onChange: (event) => {
				if (event?.threadId && event.threadId !== thread) {
					if (event.kind === 'thread' || event.kind === 'message') {
						void toastIfNews(partnership, event.threadId);
					}
					return;
				}
				void invalidate(`messages:thread:${thread}`);
			}
		});
	});

	let toasts = $state<MessageToasts>();

	// A notice for the thread now open is stale: it is on screen.
	$effect(() => {
		toasts?.dismiss(threadId);
	});

	/**
	 * Shows a toast for another thread's new message, if it is the partner's.
	 *
	 * The event cannot say who wrote it, so the server is asked whether that
	 * thread is now unread for this viewer — which a message they sent
	 * themselves, from another device, never makes it. A plain `fetch` rather
	 * than `tryFetch`: nobody is waiting on this, and a failure costs only a
	 * toast, which is not worth an error notice.
	 */
	async function toastIfNews(partnership: string, otherThreadId: string) {
		try {
			const response = await fetch(`/api/spaces/${partnership}/threads/${otherThreadId}/unread`);
			if (!response.ok) {
				return;
			}
			const { unread } = (await response.json()) as { unread: boolean };
			if (unread) {
				toasts?.show(otherThreadId);
			}
		} catch {
			// Offline or similar. The board shows it as unread either way.
		}
	}
	const backHref = resolve('/(auth-required)/(app)/messages');
	/**
	 * Whose thread this is, as the switcher shows them: a chip at the top
	 * right, since the board behind the back link may be another context's.
	 */
	const space = $derived(data.contextSpaces.find((candidate) => candidate.id === data.partner.id));
</script>

<svelte:head><title>{partnerShown} — message</title></svelte:head>

<div class="page">
	<!-- "Messages", not the partner's name: the board behind it may show
	     Everyone, and whose thread this is is the chip's to say. -->
	<NestedPageHeader {backHref} backLabel="Back to messages" backText="Messages">
		{#snippet corner()}
			{#if space}<span data-testid="thread-space"><SpaceChip {space} /></span>{/if}
		{/snippet}
	</NestedPageHeader>
	<!-- A heading for the page without a title bar over the conversation: the
	     messages are the page, and a messenger shows none. -->
	<h1 class="wa-visually-hidden">Messages with {partnerShown}</h1>
	<MessageToasts bind:this={toasts} partnerName={partnerShown} />

	{#if keyring.status === 'unlocked'}
		{#if !canSend}
			<!-- Above the messages, not below: it explains why there is no reply box
			     at the bottom, so it has to be seen before the reader gets there. -->
			<div class="trust">
				<PartnerKeyNotice
					{trust}
					partnerName={partnerShown}
					verify={() => markVerified(user.id, data.partner.id, data.recipients)}
					accept={(which) => acceptKeyChange(user.id, data.partner.id, data.recipients, which)}
				/>
			</div>
		{/if}
		<ThreadView
			thread={data.thread}
			firstUnreadId={data.firstUnreadId}
			partnershipId={data.partner.id}
			partner={{ name: partnerShown, image: data.partner.image }}
			tags={data.tags}
			{canSend}
			permanentMedia={hasFeature(data.features, 'permanentMedia')}
			highQualityMedia={hasFeature(data.features, 'highQualityMedia')}
		/>
	{:else}
		<!-- Never the thread until the key is here: every message would render as
		     "…". `locked` looks the same, because `EncryptionGate` is already
		     sending the user to sign in again. See the note on the board. -->
		<div class="settling" aria-busy="true" data-testid="messages-settling">
			<wa-spinner></wa-spinner>
			<p>Loading your messages…</p>
		</div>
	{/if}
</div>

<style>
	/* A centred column, as every other page is. Full width, the two sides of
	   a conversation ended up a whole screen apart on a desktop. */
	.page {
		max-inline-size: var(--page-width);
		margin-inline: auto;
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-block-size: 0;
	}

	.trust {
		padding: var(--wa-space-s) var(--page-gutter) 0;
	}

	.settling {
		max-width: 26rem;
		margin: 0 auto;
		padding: var(--wa-space-xl) var(--wa-space-l);
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);

		p {
			margin: 0;
			color: var(--wa-color-text-quiet);
		}
	}
</style>
