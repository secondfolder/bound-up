<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { currentKeyring, unlockedIdentity } from '$lib/crypto/session.svelte';
	import { DEFAULT_SAFEWORD } from '$lib/daydream';
	import { replaceTurn, saveTurn, writeReply } from '$lib/daydream/client';
	import { type ContextTurn, trimContext } from '$lib/daydream/context';
	import type { ComposedMessage } from '$lib/messaging/client';
	import { openDraft } from '$lib/messaging/drafts';
	import { describeRequestFailure } from '$lib/request-failure.svelte';
	import { documentToPlainText, parseStoredRichText } from '$lib/richtext';
	import { scrollIntoViewWithin } from '$lib/scroll-parent';
	import type { DaydreamSetupContent } from '$lib/sealed-kinds/daydreams';
	import {
		openedDaydreamSetup,
		openedDaydreamTurn,
		PENDING_TEXT,
		UNREADABLE_TEXT
	} from '$lib/sealed-views.svelte';
	import type { DaydreamTurnView, DaydreamView } from '$lib/types';
	import MessageComposer from './MessageComposer.svelte';

	/**
	 * A daydream's conversation, and where the next turn is written.
	 *
	 * Each turn the user sends is sealed and saved first, then the character's
	 * reply is asked for and shown as it arrives, then sealed and saved once it
	 * has finished. The conversation is kept here rather than re-loaded after
	 * every turn: a load reads every turn again, and D1 charges by the row.
	 */
	let {
		daydream,
		/** Whether this server can write replies at all. */
		available
	}: { daydream: DaydreamView; available: boolean } = $props();

	const keyring = $derived(currentKeyring());
	const setup = $derived(openedDaydreamSetup(daydream.setup));

	// svelte-ignore state_referenced_locally
	// Seeded once: from here on this list is the conversation, appended to as
	// turns are saved. The page is keyed on the daydream's id, so another
	// daydream gets a fresh one.
	let turns: DaydreamTurnView[] = $state([...daydream.turns]);

	/** The reply arriving right now, as far as it has got; null when nothing is. */
	let streaming: string | null = $state(null);
	/** Aborts the reply arriving right now: the Stop button. */
	let controller: AbortController | null = null;
	/** What went wrong with the last reply, shown with a way to try again. */
	let problem: string | null = $state(null);
	/** What "Try again" does: the reply that failed, asked for again. */
	let retry: (() => void) | null = $state(null);
	let listElement: HTMLElement | undefined = $state();

	const busy = $derived(streaming !== null);
	/**
	 * The reply being asked for, written and saved right now, if any. A send
	 * waits for it rather than being refused, so someone who types their next
	 * turn while the character is still writing can press Send straight away:
	 * their turn lands after the reply, in the order the scene happened.
	 */
	let replying: Promise<void> | null = null;

	/** Starts a reply, keeping `replying` for as long as it runs. */
	function startReply(opened: DaydreamSetupContent, replacing: DaydreamTurnView | null) {
		const run = reply(opened, replacing)
			// Never a rejection: a send waits on this, and must go ahead (or say
			// why not) rather than hang on a reply that blew up.
			.catch((cause: unknown) => {
				streaming = null;
				problem = describeRequestFailure(cause);
				retry = () => startReply(opened, replacing);
			})
			.finally(() => {
				if (replying === run) {
					replying = null;
				}
			});
		replying = run;
	}
	const latest = $derived(turns.at(-1));

	onDestroy(() => controller?.abort());

	/**
	 * What this visit wrote itself, by turn id: the user's turns and the
	 * replies that arrived here. Already known, so read from here rather than
	 * opened again — and opening is asynchronous, so a reply asked for straight
	 * after the user's turn was saved would otherwise find that turn still
	 * "opening" and refuse to go.
	 */
	const written = new SvelteMap<string, string>();

	/** A turn as it reads here: its text, `undefined` while opening, null if it will not open. */
	function openedText(turn: DaydreamTurnView): string | null | undefined {
		const known = written.get(turn.id);
		if (known !== undefined) {
			return known;
		}
		const opened = openedDaydreamTurn(turn.sealed);
		return opened === undefined ? undefined : (opened?.text ?? null);
	}

	/**
	 * The conversation as the model reads it, or null while some of it is
	 * still opening — a reply asked for then would be written without it. A
	 * turn that will not open here at all is left out rather than holding the
	 * scene up for good.
	 */
	function contextFrom(list: readonly DaydreamTurnView[]): ContextTurn[] | null {
		const context: ContextTurn[] = [];
		for (const turn of list) {
			const text = openedText(turn);
			if (text === undefined) {
				return null;
			}
			if (text !== null) {
				context.push({ role: turn.role, text });
			}
		}
		return trimContext(context);
	}

	/**
	 * Asks for the character's reply and saves it: appended as a new turn, or
	 * in place of `replacing` when it is a retry. The conversation it answers
	 * is every turn before the one it will become.
	 */
	async function reply(opened: DaydreamSetupContent, replacing: DaydreamTurnView | null) {
		const before = replacing ? turns.filter((turn) => turn.position < replacing.position) : turns;
		const context = contextFrom(before);
		if (!context) {
			problem = 'This is still getting ready. Try again in a moment.';
			retry = () => startReply(opened, replacing);
			return;
		}
		problem = null;
		retry = null;
		streaming = '';
		controller = new AbortController();
		const { signal } = controller;

		let text: string;
		try {
			const outcome = await writeReply(
				daydream.id,
				{ mode: context.length === 0 ? 'opening' : 'reply', setup: opened, turns: context },
				{
					signal,
					onText: (soFar) => {
						streaming = soFar;
					}
				}
			);
			if (!outcome.ok) {
				streaming = null;
				problem = outcome.error;
				retry = () => startReply(opened, replacing);
				return;
			}
			({ text } = outcome);
		} catch {
			// Stopped. What had arrived stays, like a sentence cut off: it is
			// what was on screen, and retrying it is one press away.
			text = (streaming ?? '').trim();
			if (!text) {
				streaming = null;
				return;
			}
		} finally {
			controller = null;
		}

		const saved = replacing
			? await replaceTurn(daydream.id, replacing, text)
			: await saveTurn(daydream.id, { id: crypto.randomUUID(), role: 'character', text });
		streaming = null;
		if (!saved.ok) {
			problem = saved.error;
			retry = () => startReply(opened, replacing);
			return;
		}
		written.set(saved.turn.id, text);
		turns = replacing
			? turns.map((turn) => (turn.id === saved.turn.id ? saved.turn : turn))
			: [...turns, saved.turn];
	}

	/**
	 * Sends what the user wrote. The composer keeps the text, and the draft,
	 * until this answers null — which is once the turn is saved, not once the
	 * reply has come: a reply that fails leaves the user's turn in the scene,
	 * with "Try again" beside it, rather than back in the box. A reply still
	 * arriving is waited for first (`replying`), with the composer showing it is
	 * busy meanwhile.
	 */
	async function send(message: ComposedMessage): Promise<string | null> {
		const opened = setup;
		if (!opened) {
			return 'This is still getting ready. Try again in a moment.';
		}
		// A loop, because a "Try again" pressed meanwhile starts another.
		for (let waiting = replying; waiting; waiting = replying) {
			await waiting;
		}
		const text = documentToPlainText(parseStoredRichText(message.text)).trim();
		const saved = await saveTurn(daydream.id, { id: crypto.randomUUID(), role: 'user', text });
		if (!saved.ok) {
			return saved.error;
		}
		written.set(saved.turn.id, text);
		turns = [...turns, saved.turn];
		startReply(opened, null);
		return null;
	}

	function retryLatest() {
		if (setup && latest?.role === 'character' && !replying) {
			startReply(setup, latest);
		}
	}

	/**
	 * A new daydream starts itself: the setup page's button said "Start", so
	 * the opening scene is asked for as soon as the setup is open here. Once
	 * per visit, so a failed opening waits for "Try again" rather than
	 * retrying on its own.
	 */
	let opening = false;
	$effect(() => {
		const opened = setup;
		if (opened && available && !opening && untrack(() => turns.length === 0)) {
			opening = true;
			// Untracked: `reply` reads the turns as it starts, and this effect
			// must not re-run every time they change.
			untrack(() => startReply(opened, null));
		}
	});

	// Keeps the newest turn in view as turns are added and a reply streams in.
	// Through the shared helper because `<main>` is what scrolls in this shell.
	$effect(() => {
		const count = turns.length;
		const growing = streaming;
		void tick().then(() => {
			const last = listElement?.lastElementChild;
			if (listElement && last && (count > 0 || growing !== null)) {
				scrollIntoViewWithin(last, listElement, { behavior: 'auto', gap: 8 });
			}
		});
	});

	/** The composer's draft, one per daydream. Identity untracked, as `ThreadView` does. */
	const daydreamId = $derived(daydream.id);
	function draftFor(id: string) {
		return openDraft({ kind: 'daydream', daydreamId: id }, untrack(unlockedIdentity));
	}

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
</script>

{#if keyring.status !== 'unlocked'}
	<!-- A placeholder until this device can open the conversation (AGENTS.md:
	     never content while the keyring is anything but unlocked). -->
	<p class="placeholder">{PENDING_TEXT}</p>
{:else}
	<ol class="turns" bind:this={listElement} aria-live="polite">
		{#each turns as turn (turn.id)}
			{const text = $derived(openedText(turn))}
			<li class={turn.role}>
				{#if turn.role === 'character'}
					<span class="who">{setup?.characterName ?? PENDING_TEXT}</span>
				{/if}
				<p class="text">
					{text ?? (text === undefined ? PENDING_TEXT : UNREADABLE_TEXT)}
				</p>
				{#if turn === latest && turn.role === 'character' && !busy && available}
					<wa-button class="retry" size="s" appearance="plain" onclick={retryLatest}>
						<wa-icon slot="start" name="rotate-right" variant="solid"></wa-icon>
						Write this reply again
					</wa-button>
				{/if}
			</li>
		{/each}
		{#if streaming !== null}
			<li class="character streaming">
				<span class="who">{setup?.characterName ?? PENDING_TEXT}</span>
				<p class="text">
					{#if streaming}{streaming}{:else}<wa-spinner></wa-spinner>
						<span class="wa-visually-hidden">Writing a reply</span>{/if}
				</p>
			</li>
		{/if}
	</ol>

	{#if problem}
		<wa-callout variant="danger" size="s" class="problem">
			{problem}
			{#if retry}
				<wa-button size="s" appearance="outlined" onclick={() => retry?.()}>Try again</wa-button>
			{/if}
		</wa-callout>
	{/if}

	{#if available}
		<div class="compose">
			{#if busy}
				<wa-button
					class="stop"
					size="s"
					appearance="outlined"
					onclick={() => controller?.abort()}
				>
					<wa-icon slot="start" name="stop" variant="solid"></wa-icon>
					Stop
				</wa-button>
			{/if}
			<!-- Nothing until the draft is read and the page has hydrated: an editor
			     shown empty and then filled would look like the text was lost. -->
			{#if mounted}
				{#key daydreamId}
					{#await draftFor(daydreamId) then draft}
						<MessageComposer
							{send}
							placeholder="Your turn…"
							allowAttachments={false}
							initialText={draft.initial?.text ?? ''}
							onTextChange={(text) => draft.save({ text, tagIds: [] })}
						/>
					{/await}
				{/key}
			{/if}
			<p class="reminder">
				What you write here goes to the model provider that writes the replies. Write “{setup?.safeword.trim() ||
					DEFAULT_SAFEWORD}” to stop the scene.
			</p>
		</div>
	{:else}
		<wa-callout variant="neutral">
			Daydreams aren't set up on this server any more, so the character can't reply. Your scene is
			still here to read.
		</wa-callout>
	{/if}
{/if}

<style>
	.placeholder {
		color: var(--wa-color-text-quiet);
		text-align: center;
	}

	.turns {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;

		li {
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
			max-inline-size: 85%;
		}

		.who {
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
			padding-inline: 0.25rem;
		}

		.text {
			margin: 0;
			padding: 0.625rem 0.875rem;
			border-radius: 1rem;
			/* A reply's paragraphs are line breaks in its text. */
			white-space: pre-wrap;
			overflow-wrap: anywhere;
		}

		.user {
			align-self: flex-end;
			align-items: flex-end;

			.text {
				background: var(--wa-color-brand-fill-quiet);
				border-end-end-radius: 0.25rem;
			}
		}

		.character {
			align-self: flex-start;

			.text {
				background: var(--wa-color-surface-raised, var(--wa-color-surface-default));
				border: 1px solid var(--wa-color-surface-border);
				border-end-start-radius: 0.25rem;
			}
		}

		.retry {
			align-self: flex-start;
			color: var(--wa-color-text-quiet);
		}
	}

	.problem {
		margin-block-start: 0.75rem;

		wa-button {
			margin-inline-start: 0.5rem;
		}
	}

	/* Pinned to the bottom of the scrollport, directly above the nav: `<main>`
	   is what scrolls, so sticky works against it (AGENTS.md, "Adding a route"). */
	.compose {
		position: sticky;
		inset-block-end: 0;
		margin-block-start: 1rem;
		padding-block: 0.75rem;
		background: var(--wa-color-surface-default);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;

		.stop {
			align-self: center;
		}

		.reminder {
			margin: 0;
			font-size: 0.75rem;
			color: var(--wa-color-text-quiet);
		}
	}
</style>
