<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import NewMessageDialog from '$lib/components/NewMessageDialog.svelte';
	import PartnerKeyNotice from '$lib/components/PartnerKeyNotice.svelte';
	import RestoreRequests from '$lib/components/RestoreRequests.svelte';
	import StickerBoard from '$lib/components/StickerBoard.svelte';
	import { currentKeyring } from '$lib/crypto/session.svelte';
	import {
		acceptKeyChange,
		markVerified,
		refreshTrust,
		trustAllowsSending,
		trustFor
	} from '$lib/crypto/trust.svelte';
	import { sendMessage } from '$lib/messaging/client';
	import { watchPartnership } from '$lib/messaging/live';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const user = $derived(page.data.user as { id: string; email: string });
	const keyring = $derived(currentKeyring());

	const trust = $derived(trustFor(data.partner.id));
	const canSend = $derived(trustAllowsSending(trust));

	/**
	 * Checks the served keys against what this device pinned, and pins on first
	 * sight. Runs on every load rather than once: `recipients` changes when
	 * either partner gets back in with a partner's help, which replaces their
	 * key — exactly the case that must not be missed.
	 *
	 * Gated on being unlocked only because nothing renders until then, so a
	 * warning about what to send to would have nowhere to go.
	 */
	$effect(() => {
		if (keyring.status !== 'unlocked') {
			return;
		}
		void refreshTrust(user.id, data.partner.id, data.recipients);
	});

	/**
	 * The live feed, for as long as this board is on screen.
	 *
	 * The callback is a plain `invalidate` of this board's own key, so an event
	 * re-runs the load through the same authorised path as a navigation — the
	 * event itself carries no content and is not trusted for anything beyond
	 * "something changed". It is also called speculatively on reconnect, which
	 * is why it has to be idempotent.
	 *
	 * The effect depends on `partnershipId`, a `$derived` of a **string**, and
	 * not on `data` — that detail is the difference between one long-lived
	 * stream and one per message. `invalidate()` reassigns the `data` prop, so
	 * an effect that read `data.partner.id` directly re-ran on every arriving
	 * event and tore the connection down to open a new one. It still worked,
	 * which is why nothing else noticed; on Workers each of those reconnects is
	 * a fresh billed request to the Durable Object. A derived primitive stops
	 * propagating when its value is unchanged, so the effect stays put.
	 * `e2e/messaging.spec.ts` counts `EventSource` constructions to hold this.
	 */
	const partnershipId = $derived(data.partner.id);
	$effect(() => {
		const id = partnershipId;
		return watchPartnership({
			partnershipId: id,
			onChange: () => void invalidate(`messages:board:${id}`)
		});
	});
	const backHref = $derived(resolve('/(auth-required)/(app)/partner/[id]', { id: data.partner.id }));

	let composing = $state(false);

	const targets = $derived([data.recipients.mine, data.recipients.theirs]);

	async function send(
		message: { text: string; files: File[] },
		tagIds: string[] = []
	): Promise<string | null> {
		const outcome = await sendMessage(
			{ kind: 'new-thread', partnershipId: data.partner.id, tagIds },
			message,
			targets
		);
		if (!outcome.ok) {
			return outcome.message;
		}

		composing = false;
		await invalidate(`messages:board:${data.partner.id}`);
		// Straight into the thread that was just started, which is where the
		// reply will land.
		await goto(
			resolve('/(auth-required)/(app)/partner/[id]/messages/[threadId]', {
				id: data.partner.id,
				threadId: outcome.threadId
			})
		);
		return null;
	}
</script>

<svelte:head><title>{data.partner.name} — messages</title></svelte:head>

{#if keyring.status !== 'unlocked'}
	<!--
		Never the board until the key is here.

		Falling through to it was a real bug: with the keyring unresolved the
		board rendered every thread with "…" for the preview and "…" for every
		message inside — ciphertext with nothing to open it, presented as if it
		were the content. `locked` gets the same placeholder: `EncryptionGate` is
		already sending the user to sign in again, so there is nothing to show.
	-->
	<section class="notice" aria-busy="true" data-testid="messages-settling">
		<wa-spinner></wa-spinner>
		<p>Loading your messages…</p>
	</section>
{:else}
	<section class="page">
		<NestedPageHeader
			{backHref}
			backLabel="Back to partner"
			backText={data.partner.name}
			title="Messages"
		/>

		<div class="board">
			<header>
				<PartnerKeyNotice
					{trust}
					partnerName={data.partner.name}
					verify={() => markVerified(user.id, data.partner.id, data.recipients)}
					accept={(which) => acceptKeyChange(user.id, data.partner.id, data.recipients, which)}
				/>
				<RestoreRequests
					requests={data.restoreRequests}
					partnershipId={data.partner.id}
					partnerName={data.partner.name}
					userId={user.id}
				/>
			</header>

			<StickerBoard threads={data.threads} partnershipId={data.partner.id} />

			{#if canSend}
				<div class="new">
					<!-- "Write something" rather than "New message": /home already has
					     a "new messages from …" link, and two controls must not share an
					     accessible name. -->
					<wa-button
						variant="brand"
						appearance="filled"
						size="xl"
						pill
						class="fab"
						aria-label="Write something"
						onclick={() => { composing = true; }}
					>
						<wa-icon name="paper-plane" variant="solid" label="Write something"></wa-icon>
					</wa-button>
				</div>
			{/if}

			{#if canSend && composing}
				<NewMessageDialog
					partnerName={data.partner.name}
					partnershipId={data.partner.id}
					tags={data.tags}
					{send}
					close={() => { composing = false; }}
				/>
			{/if}
		</div>
	</section>
{/if}

<style>
	.page {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-block-size: 0;
	}

	.notice {
		max-width: 26rem;
		margin: 0 auto;
		padding: var(--wa-space-xl) var(--wa-space-l);
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);

		p {
			margin: 0;
			color: var(--wa-color-text-quiet);
			font-size: 0.9375rem;
		}
	}

	/* An icon button is square at the control's height, and `pill` rounds it. */
	wa-button.fab {
		--wa-form-control-height: 3.75rem;
	}

	wa-button.fab::part(button) {
		box-shadow: 0 0.8rem 1.6rem rgb(0 0 0 / 18%);
	}

	wa-button.fab::part(label) {
		display: grid;
		place-items: center;
		inline-size: 100%;
		block-size: 100%;
		/* Visually center icon */
		margin-left: -0.1em;
		margin-bottom: -0.1em;

		wa-icon {
			display: block;
			line-height: 1;
		}
	}

	.board {
		display: flex;
		flex-direction: column;
		/* flex rather than a percentage height: the shell only sets min-height on
		   the page wrapper, so there is no specified height to resolve against. */
		flex: 1 1 auto;
		min-block-size: 0;

		header {
			padding: 0 var(--wa-space-m);
			display: flex;
			flex-direction: column;
			gap: var(--wa-space-s);
		}
	}

	.new {
		position: sticky;
		inset-block-end: 0;
		z-index: 1;
		margin-block-start: auto;
		display: flex;
		justify-content: flex-end;
		padding: var(--wa-space-s) var(--wa-space-m) var(--wa-space-m);
		background: linear-gradient(
			to bottom,
			transparent,
			var(--wa-color-surface-default, white) 0.75rem
		);
		pointer-events: none;

		wa-button {
			pointer-events: auto;
		}
	}
</style>
