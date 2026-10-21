<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate, goto, invalidate, pushState, replaceState } from '$app/navigation';
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
		trustFor,
		writeGrantFor
	} from '$lib/crypto/trust.svelte';
	import { partnershipVault } from '$lib/crypto/vaults.svelte';
	import { hasFeature } from '$lib/features';
	import { newlyArrived } from '$lib/messaging';
	import { type ComposedMessage, sendMessage } from '$lib/messaging/client';
	import { watchPartnership } from '$lib/messaging/live';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	/** What the viewer calls them, opened in the browser (`partner-names.svelte.ts`). */
	const partnerShown = $derived(partnerName(data.partner.names));

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
	 *
	 * A partner's message arriving here rings its sticker, the same ring a
	 * notification's tap gives, in place of the push this device is not sent
	 * while it watches. Which thread is worked out by comparing the board either
	 * side of the reload (`newlyArrived`), because the event cannot say.
	 *
	 * A `read` event is skipped: it is for a thread page's read receipt, which
	 * the board does not show, and reloading for it would cost a board load
	 * every time either partner opens a thread.
	 */
	const partnershipId = $derived(data.partner.id);
	$effect(() => {
		const id = partnershipId;
		// Whether the board is still here when a refresh it started finishes.
		// Writing a thread sends its writer on to the thread's page, and the
		// writer's own board hears that message too: the refresh resolved after
		// the board had gone, read `data.threads` from a destroyed component,
		// found it undefined, and threw "after is not iterable".
		let mounted = true;
		const stop = watchPartnership({
			partnershipId: id,
			onChange: (event) => {
				if (event?.kind === 'read') {
					return;
				}
				const before = data.threads;
				void invalidate(`messages:board:${id}`).then(() => {
					if (mounted) {
						void highlight(newlyArrived(before, data.threads));
					}
				});
			}
		});
		return () => {
			mounted = false;
			stop();
		};
	});
	const backHref = $derived(resolve('/(auth-required)/(app)/partner/[id]', { id: data.partner.id }));

	/**
	 * The thread a push notification's tap was about, if it has never been
	 * opened — the load sends an opened one straight to its own page — or,
	 * later, the one a partner's message has just arrived in.
	 *
	 * Captured once, not derived: a realtime refresh re-runs the load without
	 * `?thread=` (it is dropped from the URL below), and deriving would cut the
	 * fade short. Forgotten when the sticker's fade ends.
	 */
	// svelte-ignore state_referenced_locally
	let highlightThreadId = $state(data.highlightThreadId);

	/** Rings a sticker, starting the fade again if it is already ringing. */
	async function highlight(threadId: string | null) {
		if (!threadId) {
			return;
		}
		if (highlightThreadId === threadId) {
			// Off for a frame, so the class comes back and the animation restarts:
			// removing and re-adding it within one frame restarts nothing.
			highlightThreadId = null;
			await tick();
			await new Promise((frame) => requestAnimationFrame(frame));
		}
		highlightThreadId = threadId;
	}

	// So a reload, or coming Back to the board, does not highlight it again.
	//
	// Deferred a microtask, because on a full page load (which a tap on a
	// notification is) SvelteKit runs `afterNavigate` callbacks and only then
	// marks its router started, and `replaceState` throws in dev until it is.
	// `onMount` is earlier still. The rest of that startup is synchronous, so
	// one microtask is enough.
	afterNavigate(({ to }) => {
		if (to?.url.searchParams.has('thread')) {
			queueMicrotask(() => {
				replaceState(
					resolve('/(auth-required)/(app)/partner/[id]/messages', { id: partnershipId }),
					{}
				);
			});
		}
	});

	/**
	 * The new-message dialog is open while the URL ends in `/new`, so a reload
	 * keeps it open. Opening it from here is shallow routing (`pushState`), so
	 * the board stays mounted under it and Back closes it; loading `/new`
	 * outright is a route of its own (`new/+page.svelte`) that renders this
	 * same board, open from the start.
	 *
	 * Kept in this component's state, not read from `page.state`: an
	 * `invalidate()` resets `page.state`, and the dialog invalidates the board
	 * itself (a tag made in it), which closed it mid-compose. Back and Forward
	 * between the board and `/new` are the browser's own, so `popstate` says
	 * which one it is now.
	 */
	let composing = $state(page.route.id === '/(auth-required)/(app)/partner/[id]/messages/new');
	/** Whether the board's own entry is behind `/new`, which it is only when this pushed it. */
	let pushed = false;

	$effect(() => {
		const sync = () => {
			composing = location.pathname.endsWith('/messages/new');
			pushed = composing;
		};
		addEventListener('popstate', sync);
		return () => removeEventListener('popstate', sync);
	});

	/**
	 * Where the dialog grows from: the centre of the button that opened it, so
	 * the composer visibly comes out of that button rather than appearing in
	 * the middle of the screen. Null when the dialog opens with the page
	 * (`/new` loaded outright), which has no button to come from.
	 */
	let composeOrigin: { x: number; y: number } | null = $state(null);

	function startComposing(event: MouseEvent) {
		const button = event.currentTarget;
		if (button instanceof Element) {
			const rect = button.getBoundingClientRect();
			composeOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
		}
		composing = true;
		pushed = true;
		pushState(resolve('/(auth-required)/(app)/partner/[id]/messages/new', { id: partnershipId }), {});
	}

	/** Closes the dialog and takes the URL back off `/new`, settled once the history has moved. */
	async function stopComposing(): Promise<void> {
		// Asked twice by one close (the button, then the dialog's own hide):
		// a second Back would leave the board too.
		if (!composing) {
			return;
		}
		composing = false;
		if (pushed) {
			pushed = false;
			// Back to the board's own entry, so Back afterwards leaves the board
			// rather than reopening the dialog.
			const landed = new Promise((done) => addEventListener('popstate', done, { once: true }));
			history.back();
			await landed;
		} else {
			// Landed on `/new` by a full load: there is no board entry behind it.
			replaceState(
				resolve('/(auth-required)/(app)/partner/[id]/messages', { id: partnershipId }),
				{}
			);
		}
	}

	const vault = $derived(partnershipVault(data.partner.id));

	async function send(message: ComposedMessage, tagIds: string[] = []): Promise<string | null> {
		// The vault, and the trust check's permission to write into it. The
		// composer is hidden while trust says no, so missing either here means
		// the vault is still opening.
		const grant = vault ? writeGrantFor(data.partner.id, vault.id) : null;
		if (!(vault && grant)) {
			return 'Still getting ready to send. Try again in a moment.';
		}
		const outcome = await sendMessage(
			{ kind: 'new-thread', partnershipId: data.partner.id, tagIds },
			message,
			{ vault, grant }
		);
		if (!outcome.ok) {
			return outcome.message;
		}

		// Off `/new` first, so Back from the thread goes to the board rather
		// than to the dialog, empty again. Not `goto`'s `replaceState` over
		// the `/new` entry instead: a shallow entry shares the board's
		// navigation index, and so would the thread put in its place, so Back
		// from the thread was taken as shallow and went nowhere.
		await stopComposing();
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

<svelte:head><title>{partnerShown} — messages</title></svelte:head>

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
			backText={partnerShown}
			title="Messages"
		/>

		<div class="board">
			<header>
				<PartnerKeyNotice
					{trust}
					partnerName={partnerShown}
					verify={() => markVerified(user.id, data.partner.id, data.recipients)}
					accept={(which) => acceptKeyChange(user.id, data.partner.id, data.recipients, which)}
				/>
				<RestoreRequests
					requests={data.restoreRequests}
					partnershipId={data.partner.id}
					partnerName={partnerShown}
					userId={user.id}
				/>
			</header>

			<StickerBoard
				threads={data.threads}
				partnershipId={data.partner.id}
				{highlightThreadId}
				onHighlightEnd={() => {
					highlightThreadId = null;
				}}
			/>

			{#if canSend}
				<div class="new">
					<!-- "Write something" rather than "New message": /home already has
					     a "new messages from …" link, and two controls must not share an
					     accessible name. Named by its icon's label, which is what reaches
					     the inner <button>. A pen, not the paper plane it used to be: a
					     paper plane is the composer's own Send, and this starts writing. -->
					<wa-button
						variant="brand"
						appearance="filled"
						size="xl"
						pill
						class="fab"
						onclick={startComposing}
					>
						<wa-icon name="pen-to-square" variant="solid" label="Write something"></wa-icon>
					</wa-button>
				</div>
			{/if}

			{#if canSend && composing}
				<NewMessageDialog
					partnerName={partnerShown}
					partnershipId={data.partner.id}
					tags={data.tags}
					origin={composeOrigin}
					{send}
					permanentMedia={hasFeature(data.features, 'permanentMedia')}
					highQualityMedia={hasFeature(data.features, 'highQualityMedia')}
					close={stopComposing}
				/>
			{/if}
		</div>
	</section>
{/if}

<style>
	/* A centred column, as every other page is. Full width, a single sticker
	   sat in the top-left corner of a desktop with the write button in the
	   opposite one. */
	.page {
		max-inline-size: var(--page-width);
		margin-inline: auto;
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
		/* Darker than a light theme's shadow would be: with no band behind the
		   button any more, this is what separates it from a sticker under it,
		   on a background that is already dark. */
		box-shadow: 0 0.6rem 1.4rem rgb(0 0 0 / 45%);
	}

	wa-button.fab::part(label) {
		display: grid;
		place-items: center;
		inline-size: 100%;
		block-size: 100%;
		/* No optical nudge: the paper plane this used to show leaned up and to
		   the right and needed one, and the pen sits square in its box. */

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
			padding: 0 var(--page-gutter);
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
		padding: var(--wa-space-s) var(--page-gutter) var(--wa-space-m);
		/* No band behind it. The thread's composer has one because text
		   scrolls under it; this is one round button, and its shadow is enough
		   to lift it off a sticker passing underneath. As a band it read as an
		   empty footer across the whole board. */
		pointer-events: none;

		wa-button {
			pointer-events: auto;
		}
	}
</style>
