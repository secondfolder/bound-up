<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate, goto, invalidate, pushState, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ContextSwitcher from '$lib/components/context/ContextSwitcher.svelte';
	import ForWhom from '$lib/components/ForWhom.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import NewMessageDialog from '$lib/components/NewMessageDialog.svelte';
	import PartnerKeyNotice from '$lib/components/PartnerKeyNotice.svelte';
	import RestoreRequests from '$lib/components/RestoreRequests.svelte';
	import StickerBoard from '$lib/components/StickerBoard.svelte';
	import { shownSpace, switchContext } from '$lib/context-client.svelte';
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
	import type { ItemTarget } from '$lib/item-target';
	import { newlyArrived } from '$lib/messaging';
	import { type ComposedMessage, sendMessage } from '$lib/messaging/client';
	import { watchPartnership } from '$lib/messaging/live';
	import { spaceColourValue } from '$lib/space-colours';
	import type { BoardPartnershipView, ContextSpaceView } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const user = $derived(page.data.user as { id: string; email: string });
	const keyring = $derived(currentKeyring());

	/** The viewer's partners, as the switcher knows them: who a Me page offers to switch to. */
	const partnerSpaces = $derived(data.contextSpaces.filter((space) => space.kind === 'shared'));

	/** The partnerships this board shows: one in a partnership's context, each in Everyone. */
	const boards = $derived(data.partnerships);
	const several = $derived(boards.length > 1);
	const only = $derived(boards.length === 1 ? (boards[0] ?? null) : null);

	function spaceOf(spaceId: string): ContextSpaceView | null {
		return data.contextSpaces.find((space) => space.id === spaceId) ?? null;
	}
	/** What the viewer calls the partner in a partnership (`partnerName()`, AGENTS.md invariant 12). */
	function nameOf(partnershipId: string): string {
		const space = spaceOf(partnershipId);
		return space ? shownSpace(space).name : '…';
	}

	/**
	 * Checks the served keys against what this device pinned, and pins on first
	 * sight, for each partnership shown. Runs on every load rather than once:
	 * `recipients` changes when either partner gets back in with a partner's
	 * help, which replaces their key — exactly the case that must not be
	 * missed.
	 *
	 * Gated on being unlocked only because nothing renders until then, so a
	 * warning about what to send to would have nowhere to go.
	 */
	$effect(() => {
		if (keyring.status !== 'unlocked') {
			return;
		}
		for (const board of boards) {
			void refreshTrust(user.id, board.id, board.recipients);
		}
	});

	/**
	 * The live feed, for as long as a board of one partnership is on screen.
	 *
	 * The callback is a plain `invalidate` of this board's own key, so an event
	 * re-runs the load through the same authorised path as a navigation — the
	 * event itself carries no content and is not trusted for anything beyond
	 * "something changed". It is also called speculatively on reconnect, which
	 * is why it has to be idempotent.
	 *
	 * The effect depends on `liveId`, a `$derived` of a **string**, and not on
	 * `data` — that detail is the difference between one long-lived stream and
	 * one per message. `invalidate()` reassigns the `data` prop, so an effect
	 * that read `data` directly re-ran on every arriving event and tore the
	 * connection down to open a new one. It still worked, which is why nothing
	 * else noticed; on Workers each of those reconnects is a fresh billed
	 * request to the Durable Object. A derived primitive stops propagating when
	 * its value is unchanged, so the effect stays put. `e2e/messaging.spec.ts`
	 * counts `EventSource` constructions to hold this.
	 *
	 * A partner's message arriving here rings its sticker, the same ring a
	 * notification's tap gives, in place of the push this device is not sent
	 * while it watches. Which thread is worked out by comparing the board either
	 * side of the reload (`newlyArrived`), because the event cannot say.
	 *
	 * A `read` event is skipped: it is for a thread page's read receipt, which
	 * the board does not show, and reloading for it would cost a board load
	 * every time either partner opens a thread.
	 *
	 * An Everyone board of several partnerships opens no stream at all: one
	 * per partnership is a Durable Object request each, and their presence
	 * leases, for a page that is mostly glanced at (docs/realtime.md). It
	 * refreshes when it is looked at again instead — below.
	 */
	const liveId = $derived(only?.id ?? null);
	$effect(() => {
		const id = liveId;
		if (!id) {
			return;
		}
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

	/**
	 * Everyone, over several partnerships: not live, but never stale for
	 * long. Coming back to the tab, or to the window, reloads the board and
	 * rings whatever arrived meanwhile. Keyed on a string of the ids, for the
	 * reason the stream above is.
	 */
	const refreshedIds = $derived(several ? boards.map((board) => board.id).join(' ') : '');
	$effect(() => {
		const ids = refreshedIds;
		if (!ids) {
			return;
		}
		let mounted = true;
		const refresh = () => {
			if (document.visibilityState !== 'visible') {
				return;
			}
			const before = data.threads;
			void Promise.all(ids.split(' ').map((id) => invalidate(`messages:board:${id}`))).then(() => {
				if (mounted) {
					void highlight(newlyArrived(before, data.threads));
				}
			});
		};
		document.addEventListener('visibilitychange', refresh);
		addEventListener('focus', refresh);
		return () => {
			mounted = false;
			document.removeEventListener('visibilitychange', refresh);
			removeEventListener('focus', refresh);
		};
	});

	/**
	 * The thread a `?thread=` link was about, if it has never been opened —
	 * the load sends an opened one straight to its own page — or, later, the
	 * one a partner's message has just arrived in.
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
	// Deferred a microtask, because on a full page load SvelteKit runs
	// `afterNavigate` callbacks and only then marks its router started, and
	// `replaceState` throws in dev until it is. `onMount` is earlier still. The
	// rest of that startup is synchronous, so one microtask is enough.
	afterNavigate(({ to }) => {
		if (to?.url.searchParams.has('thread')) {
			queueMicrotask(() => {
				replaceState(resolve('/(auth-required)/(app)/messages'), {});
			});
		}
	});

	/** The partnerships this device may write a new thread into now. */
	const sendable = $derived(boards.filter((board) => trustAllowsSending(trustFor(board.id))));

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
	let composing = $state(page.route.id === '/(auth-required)/(app)/messages/new');
	/** Whether the board's own entry is behind `/new`, which it is only when this pushed it. */
	let pushed = false;

	$effect(() => {
		const sync = () => {
			composing = location.pathname.endsWith('/messages/new');
			pushed = composing;
			if (!composing) {
				pinned = null;
			}
		};
		addEventListener('popstate', sync);
		return () => removeEventListener('popstate', sync);
	});

	/**
	 * Where the dialog could send, fixed when it opens. A thread is written to
	 * the partnership the dialog was opened for, named in the send's URL, and
	 * nothing that happens to the board meanwhile moves it: another tab
	 * switching the context reloads this board when it comes back to the
	 * front, and the words being typed must still go where they were meant to
	 * (docs/contexts.md, "Writes name their space").
	 */
	let pinned = $state<BoardPartnershipView[] | null>(null);
	// `/new` loaded outright opens with the page, before trust has said where
	// it may send: pinned as soon as it has.
	$effect(() => {
		if (composing && pinned === null && sendable.length > 0) {
			pinned = [...sendable];
		}
	});
	const choices = $derived(pinned ?? sendable);
	/** Chosen under "For whom?", when there is more than one. */
	let chosen = $state<ItemTarget | null>(null);
	const composeId = $derived(
		choices.length === 1
			? (choices[0]?.id ?? null)
			: (choices.find((choice) => choice.id === chosen?.spaceId)?.id ?? null)
	);
	/** Its tags as the board has them now, a tag just made included. */
	const composeTags = $derived(
		(
			boards.find((board) => board.id === composeId) ??
			choices.find((choice) => choice.id === composeId)
		)?.tags ?? []
	);
	const forWhomTargets = $derived(
		choices.map((choice): ItemTarget => ({ spaceId: choice.id, kind: 'shared', partner: null }))
	);

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
		pinned = [...sendable];
		composing = true;
		pushed = true;
		pushState(resolve('/(auth-required)/(app)/messages/new'), {});
	}

	/** Closes the dialog and takes the URL back off `/new`, settled once the history has moved. */
	async function stopComposing(): Promise<void> {
		// Asked twice by one close (the button, then the dialog's own hide):
		// a second Back would leave the board too.
		if (!composing) {
			return;
		}
		composing = false;
		pinned = null;
		if (pushed) {
			pushed = false;
			// Back to the board's own entry, so Back afterwards leaves the board
			// rather than reopening the dialog.
			const landed = new Promise((done) => addEventListener('popstate', done, { once: true }));
			history.back();
			await landed;
		} else {
			// Landed on `/new` by a full load: there is no board entry behind it.
			replaceState(resolve('/(auth-required)/(app)/messages'), {});
		}
	}

	async function send(message: ComposedMessage, tagIds: string[] = []): Promise<string | null> {
		const partnershipId = composeId;
		// The vault, and the trust check's permission to write into it. The
		// composer is hidden while trust says no, so missing either here means
		// the vault is still opening.
		const vault = partnershipId ? partnershipVault(partnershipId) : null;
		const grant = partnershipId && vault ? writeGrantFor(partnershipId, vault.id) : null;
		if (!(partnershipId && vault && grant)) {
			return 'Still getting ready to send. Try again in a moment.';
		}
		const outcome = await sendMessage({ kind: 'new-thread', partnershipId, tagIds }, message, {
			vault,
			grant
		});
		if (!outcome.ok) {
			return outcome.message;
		}

		// Off `/new` first, so Back from the thread goes to the board rather
		// than to the dialog, empty again. Not `goto`'s `replaceState` over
		// the `/new` entry instead: a shallow entry shares the board's
		// navigation index, and so would the thread put in its place, so Back
		// from the thread was taken as shallow and went nowhere.
		await stopComposing();
		await invalidate(`messages:board:${partnershipId}`);
		// Straight into the thread that was just started, which is where the
		// reply will land.
		await goto(resolve('/(auth-required)/(app)/messages/[threadId]', { threadId: outcome.threadId }));
		return null;
	}

	const description = $derived.by(() => {
		if (data.view === 'me' || partnerSpaces.length === 0) {
			return null;
		}
		if (several) {
			return 'Every partner’s threads, newest first.';
		}
		return only ? `Between you and ${nameOf(only.id)}.` : null;
	});
	const pageTitle = $derived(
		only && !several && data.context.kind === 'space' ? `${nameOf(only.id)} — messages` : 'Messages'
	);
</script>

<svelte:head><title>{pageTitle}</title></svelte:head>

<section class="page">
	<NestedPageHeader
		backHref={resolve('/(auth-required)/(app)/today')}
		backLabel="Back to Today"
		backText="Today"
		title="Messages"
		{description}
	>
		{#snippet corner()}
			<ContextSwitcher spaces={data.contextSpaces} context={data.context} you={data.user?.name ?? ''} />
		{/snippet}
	</NestedPageHeader>

	{#if partnerSpaces.length === 0}
		<!-- Nobody to write to. Everyone and Me are the same thing without a
		     partner, and the switcher is not shown. -->
		<div class="empty-state" data-testid="messages-no-partner">
			<wa-icon name="comment" variant="regular"></wa-icon>
			<p class="lead">Messages are between you and a partner</p>
			<p>Link a partner, and the two of you can write things only you can read.</p>
			<wa-button href={resolve('/(auth-required)/(app)/settings/partners/new')} variant="brand">
				Add a partner
			</wa-button>
		</div>
	{:else if data.view === 'me'}
		<!-- Me has no messages. Offered, never done: switching by itself would
		     change what every other list on this device shows too. -->
		<div class="empty-state" data-testid="messages-me">
			<wa-icon name="comment" variant="regular"></wa-icon>
			<p class="lead">Messages are between you and a partner</p>
			<p>You’re looking at your own things. Whose messages do you want?</p>
			<div class="switches">
				{#each partnerSpaces as space (space.id)}
					<wa-button
						appearance="outlined"
						variant="brand"
						pill
						onclick={() => switchContext({ kind: 'space', spaceId: space.id })}
					>
						<span
							slot="start"
							class="dot"
							style:background={spaceColourValue(space.colour)}
							aria-hidden="true"
						></span>
						Switch to {shownSpace(space).name}
					</wa-button>
				{/each}
			</div>
		</div>
	{:else if keyring.status !== 'unlocked'}
		<!--
			Never the board until the key is here.

			Falling through to it was a real bug: with the keyring unresolved the
			board rendered every thread with "…" for the preview and "…" for every
			message inside — ciphertext with nothing to open it, presented as if it
			were the content. `locked` gets the same placeholder: `EncryptionGate` is
			already sending the user to sign in again, so there is nothing to show.
		-->
		<div class="notice" aria-busy="true" data-testid="messages-settling">
			<wa-spinner></wa-spinner>
			<p>Loading your messages…</p>
		</div>
	{:else}
		<div class="board">
			<header>
				<!-- Per partnership: each has its own keys and its own requests.
				     Over several, only what stops a send (`alertsOnly`); each
				     partner's own board says the rest. -->
				{#each boards as board (board.id)}
					<PartnerKeyNotice
						trust={trustFor(board.id)}
						partnerName={nameOf(board.id)}
						alertsOnly={several}
						verify={() => markVerified(user.id, board.id, board.recipients)}
						accept={(which) => acceptKeyChange(user.id, board.id, board.recipients, which)}
					/>
					<RestoreRequests
						requests={board.restoreRequests}
						partnershipId={board.id}
						partnerName={nameOf(board.id)}
						userId={user.id}
					/>
				{/each}
			</header>

			<StickerBoard
				threads={data.threads}
				spaceOf={several ? spaceOf : null}
				empty={several
					? 'Nothing here yet. Write something only you and a partner can read.'
					: undefined}
				{highlightThreadId}
				onHighlightEnd={() => {
					highlightThreadId = null;
				}}
			/>

			{#if sendable.length > 0}
				<div class="new">
					<!-- "Write something" rather than "New message": Today already has
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

			{#if composing && choices.length > 0}
				<NewMessageDialog
					partnerName={composeId ? nameOf(composeId) : null}
					partnershipId={composeId}
					tags={composeTags}
					origin={composeOrigin}
					forWhom={choices.length > 1 ? forWhom : undefined}
					{send}
					permanentMedia={hasFeature(data.features, 'permanentMedia')}
					highQualityMedia={hasFeature(data.features, 'highQualityMedia')}
					close={stopComposing}
				/>
			{/if}
		</div>
	{/if}
</section>

{#snippet forWhom()}
	<!-- Asked first on a board of several partners: a thread is between two
	     people, and the one it goes to is named in the send. Remembered on
	     this device, as the tasks and notebook pickers are. -->
	<ForWhom
		targets={forWhomTargets}
		spaces={data.contextSpaces}
		storageKey="bound-up:messages-for-whom"
		onchoose={(value) => {
			chosen = value;
		}}
	/>
{/snippet}

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

	.empty-state {
		margin: var(--wa-space-l) var(--page-gutter);
		padding: var(--wa-space-2xl) var(--wa-space-m);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--wa-space-s);
		text-align: center;
		border: 1px dashed var(--wa-color-surface-border);
		border-radius: var(--wa-panel-border-radius);

		wa-icon {
			font-size: 2.5rem;
			color: var(--wa-color-brand-fill-loud);
		}

		p {
			margin: 0;
			color: var(--wa-color-text-quiet);
		}

		.lead {
			color: var(--wa-color-text-normal);
			font-weight: var(--wa-font-weight-bold);
			font-size: var(--wa-font-size-l);
		}

		.switches {
			display: flex;
			flex-wrap: wrap;
			justify-content: center;
			gap: var(--wa-space-xs);
			margin-block-start: var(--wa-space-xs);
		}

		.dot {
			display: inline-block;
			inline-size: 0.625rem;
			block-size: 0.625rem;
			border-radius: 50%;
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
