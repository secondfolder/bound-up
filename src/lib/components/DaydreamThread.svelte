<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { currentKeyring, unlockedIdentity } from '$lib/crypto/session.svelte';
	import { storedOffset } from '$lib/daydream/passage-selection';
	import { quoteAt } from '$lib/daydream/quotes';
	import { RawConversation } from '$lib/daydream/raw-conversation.svelte';
	import { RawExchanges } from '$lib/daydream/raw-exchanges.svelte';
	import { RawSetupExchanges } from '$lib/daydream/raw-setup-exchanges.svelte';
	import { DaydreamStory } from '$lib/daydream/story.svelte';
	import type { ComposedMessage } from '$lib/messaging/client';
	import { openDraft } from '$lib/messaging/drafts';
	import { documentToPlainText, parseStoredRichText } from '$lib/richtext';
	import { followEnd, scrollIntoViewWithin } from '$lib/scroll-parent';
	import type { Quote, Reading } from '$lib/sealed-kinds/daydreams';
	import { PENDING_TEXT } from '$lib/sealed-views.svelte';
	import type { DaydreamTreeNodeView, DaydreamView } from '$lib/types';
	import DaydreamArriving from './DaydreamArriving.svelte';
	import DaydreamBookmarkDialog from './DaydreamBookmarkDialog.svelte';
	import DaydreamBookmarks from './DaydreamBookmarks.svelte';
	import DaydreamBranchMap from './DaydreamBranchMap.svelte';
	import DaydreamDials from './DaydreamDials.svelte';
	import DaydreamDirections from './DaydreamDirections.svelte';
	import DaydreamDriftNote from './DaydreamDriftNote.svelte';
	import DaydreamNotThisDialog from './DaydreamNotThisDialog.svelte';
	import DaydreamPassage from './DaydreamPassage.svelte';
	import DaydreamPicturesControl from './DaydreamPicturesControl.svelte';
	import DaydreamRawExchange from './DaydreamRawExchange.svelte';
	import DaydreamRawSent from './DaydreamRawSent.svelte';
	import DaydreamRawSetup from './DaydreamRawSetup.svelte';
	import DaydreamRawSystem from './DaydreamRawSystem.svelte';
	import DaydreamRawTurn from './DaydreamRawTurn.svelte';
	import DaydreamRollCard from './DaydreamRollCard.svelte';
	import DaydreamSafety from './DaydreamSafety.svelte';
	import DaydreamSettingsNote from './DaydreamSettingsNote.svelte';
	import DaydreamSuggestions from './DaydreamSuggestions.svelte';
	import DaydreamUserTurn from './DaydreamUserTurn.svelte';
	import MessageComposer from './MessageComposer.svelte';

	/**
	 * A daydream's story, and every way to move it on: the composer, the
	 * direction buttons, suggestions, rolls, the safety controls, and what can
	 * be done with a passage once it is written. The state and the actions are
	 * `DaydreamStory`'s; this draws them and wires them to each other.
	 */
	let {
		daydream,
		/** Whether this server can write passages at all. */
		available,
		keepRawReplies = false,
		picturesAvailable = false,
		debug = false,
		onnamed
	}: {
		daydream: DaydreamView;
		available: boolean;
		/**
		 * The account is granted debug mode, so each passage keeps the model's
		 * reply as it arrived (`DaydreamStory`'s constructor says why).
		 */
		keepRawReplies?: boolean;
		/** Whether this server makes pictures (docs/daydreams.md, "Pictures"). */
		picturesAvailable?: boolean;
		/** Debug mode is on on this device: the raw log switch shows. */
		debug?: boolean;
		/** Told the daydream's name once the model has given it one, for the page's heading. */
		onnamed?: (name: string) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Seeded once: from here on the story is this object, added to as turns are
	// saved. The page is keyed on the daydream's id, so another daydream gets a
	// fresh one.
	const story = new DaydreamStory(daydream, available, { keepRawReplies, picturesAvailable });

	// ── the raw log (debug mode) ─────────────────────────────────────────────

	/** Remembered on the device, as a convenience: a reload keeps the log open. */
	const RAW_LOG_KEY = 'daydreams.raw-log';
	let rawLogChosen = $state(false);
	onMount(() => {
		try {
			rawLogChosen = localStorage.getItem(RAW_LOG_KEY) === '1';
		} catch {
			// Storage refused (a private window, say): the log starts closed.
		}
	});
	function setRawLog(on: boolean) {
		rawLogChosen = on;
		try {
			if (on) {
				localStorage.setItem(RAW_LOG_KEY, '1');
			} else {
				localStorage.removeItem(RAW_LOG_KEY);
			}
		} catch {
			// Not remembered, which only costs a toggle after a reload.
		}
	}
	const rawLog = $derived(debug && rawLogChosen);
	/** What the model was sent before each passage, asked for as the raw log draws it. */
	const conversation = new RawConversation(story);
	/**
	 * Each request's exchange with the model, kept verbatim, loaded for the
	 * branch while the raw log is open. A passage from before they were kept
	 * falls back to its own `sent` and `raw` (`DaydreamRawSent`).
	 */
	const exchanges = new RawExchanges(story);
	/** How the daydream was set up, which heads the raw log: read the first time it opens. */
	const setupExchanges = new RawSetupExchanges(story.id);
	$effect(() => {
		if (rawLog) {
			exchanges.load(story.path.map((node) => node.id));
			setupExchanges.load();
		}
	});
	/** The newest passage on the branch, whose request's system prompt heads the raw log. */
	const newestPassage = $derived(story.path.findLast((node) => node.role === 'story') ?? null);
	/** The system prompt heading the raw log: the newest passage's record, or its rebuild. */
	const rawSystem = $derived.by(() => {
		if (!newestPassage) {
			return null;
		}
		const content = story.content(newestPassage.id);
		if (content?.type === 'text' && content.sent) {
			return content.sent.system;
		}
		const state = conversation.state(newestPassage.id);
		return state && state !== 'loading' && 'system' in state ? state.system : null;
	});
	/** Each turn's previous passage on the branch: the request it should add to. */
	const previousPassage = $derived.by(() => {
		const map = new Map<string, DaydreamTreeNodeView | null>();
		let last: DaydreamTreeNodeView | null = null;
		for (const node of story.path) {
			// Every turn, so a failed request after the user's turn finds the
			// passage its history should have added to.
			map.set(node.id, last);
			if (node.role === 'story') {
				last = node;
			}
		}
		return map;
	});

	/**
	 * Debug mode's Export: the whole daydream, every branch, opened and saved
	 * to the device as JSON (`DaydreamStory.exportHistory`). It is the story in
	 * the clear, so it lives behind debug mode and goes nowhere but the file.
	 */
	let exporting = $state(false);
	async function exportHistory() {
		exporting = true;
		try {
			const history = await story.exportHistory();
			const url = URL.createObjectURL(
				new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' })
			);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = `daydream-${story.id}.json`;
			anchor.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} finally {
			exporting = false;
		}
	}

	const keyring = $derived(currentKeyring());
	const setup = $derived(story.setup);
	const busy = $derived(story.busy);

	/** The name over each passage when one character tells the whole story; none otherwise. */
	const speaker = $derived.by(() => {
		if (!setup) {
			return PENDING_TEXT;
		}
		const [only] = setup.characters;
		return setup.voice.narrator === 'none' && setup.characters.length === 1 && only
			? only.name
			: null;
	});

	/**
	 * Who has a colour of their own in a passage's dialogue: the user, by
	 * "you" or the name they play under, unless they are not in the story;
	 * then the cast, in the setup's order (`voiceOf`).
	 */
	const cast = $derived({
		you: setup && setup.voice.stance !== 'absent' ? ['you', setup.voice.protagonistName] : [],
		characters: setup?.characters.map((character) => character.name) ?? []
	});

	/** The story's first passage on this branch, which opens with a drop cap. */
	const openingId = $derived(story.path.find((node) => node.role === 'story')?.id ?? null);

	type Answered = { readAs: Reading | null; expansion: string | null; chosen: boolean };

	/**
	 * How the passage after each user turn read it, and what it wrote the turn
	 * out to if it did, by the user turn's id. A passage arriving now counts as
	 * soon as it has written a turn out, so the bubble fills in as it does.
	 */
	const answered = $derived.by(() => {
		const map = new Map<string, Answered>();
		story.path.forEach((node, index) => {
			const next = story.path[index + 1];
			if (node.role === 'user' && next) {
				const content = story.content(next.id);
				if (content?.type === 'text' && content.meta) {
					map.set(node.id, {
						readAs: content.meta.readAs ?? null,
						expansion: content.meta.expansion ?? null,
						chosen: content.meta.readAsChosen === true
					});
				}
			}
		});
		const arriving = story.streaming;
		if (arriving?.parentId && (arriving.expansion || arriving.readAs || arriving.reading)) {
			map.set(arriving.parentId, {
				readAs: arriving.readAs ?? (arriving.expansion ? 'instruction' : arriving.reading),
				expansion: arriving.expansion,
				chosen: arriving.readAs !== null
			});
		}
		return map;
	});

	const leaf = $derived(story.leafPassage);
	const offerRoll = $derived(leaf?.meta?.roll && !busy && !story.halted ? leaf.meta.roll : null);
	const suggestions = $derived(busy || story.halted ? [] : (leaf?.meta?.suggestions ?? []));

	onDestroy(() => {
		story.stop();
		story.dispose();
	});

	// A new daydream starts itself: the setup page's button said "Start", so
	// the opening is asked for as soon as the setup is open here. Once per
	// visit, so a failed opening waits for "Try again" rather than retrying on
	// its own.
	let opening = false;
	$effect(() => {
		if (setup && available && !opening) {
			opening = true;
			untrack(() => story.open());
		}
	});

	// A daydream without a name gets one once its opening is there to name it
	// from, and nothing is being written: after the opening this visit, or on
	// the next visit when the last one never got that far. The story asks at
	// most once per visit (`nameIfUnnamed`).
	const openingWritten = $derived(
		story.path.some((node) => node.role === 'story' && story.content(node.id)?.type === 'text')
	);
	$effect(() => {
		if (setup && setup.title.trim() === '' && openingWritten && !busy) {
			untrack(async () => {
				const name = await story.nameIfUnnamed();
				if (name) {
					onnamed?.(name);
				}
			});
		}
	});

	// The branch being read, opened in full: turns another device added, or a
	// branch moved to, may not have come with the page.
	$effect(() => {
		const ids = story.path.map((node) => node.id);
		untrack(() => void story.ensureLoaded(ids));
	});

	let listElement: HTMLElement | undefined = $state();

	/**
	 * The passage that last arrived, which following the end stops at
	 * (`followEnd`'s `holdAt`): once its top reaches the top of the screen,
	 * the rest waits for the reader to scroll, so a long passage is not
	 * scrolled away before it has been read. Set when a passage finishes
	 * arriving, and cleared when the next starts, whose own bubble holds
	 * meanwhile. Never set on opening a daydream, which opens at its end.
	 */
	let heldId: string | null = $state(null);
	let wasStreaming = false;
	$effect(() => {
		const streaming = story.streaming !== null;
		untrack(() => {
			if (streaming) {
				heldId = null;
			} else if (wasStreaming) {
				heldId = story.leafPassage?.id ?? null;
			}
			wasStreaming = streaming;
		});
	});

	/**
	 * The held passage, while it is still the newest thing in the story: a
	 * turn sent after it is followed to as usual, before its reply starts.
	 */
	function heldElement(list: HTMLElement): Element | null {
		const held = list.querySelector('[data-hold-scroll]');
		return held && held === list.lastElementChild ? held : null;
	}

	/** Scrolls a turn into view: after a jump from the branch map or the bookmarks. */
	async function scrollToTurn(turnId: string) {
		await tick();
		const target = listElement?.querySelector(`[data-turn-id="${CSS.escape(turnId)}"]`);
		if (target && listElement) {
			scrollIntoViewWithin(target, listElement, { behavior: 'smooth', gap: 8 });
		}
	}

	// ── selecting words in a passage ─────────────────────────────────────────

	/** Words selected in one passage, which that passage's bar acts on. */
	let selection: { turnId: string; quote: Quote } | null = $state(null);

	/**
	 * Follows the document's selection. Only a selection wholly inside one
	 * passage's text counts; offsets are measured against that text, which
	 * never changes, so they stay true. Losing the selection does not clear
	 * the bar straight away — tapping one of its buttons can collapse the
	 * selection first — so it clears on a press anywhere else instead.
	 */
	function onSelectionChange() {
		const current = document.getSelection();
		if (!current || current.isCollapsed || current.rangeCount === 0) {
			return;
		}
		const range = current.getRangeAt(0);
		const start = (
			range.startContainer instanceof Element
				? range.startContainer
				: range.startContainer.parentElement
		)?.closest('[data-passage-text]');
		const end = (
			range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement
		)?.closest('[data-passage-text]');
		if (!(start && start === end && start instanceof HTMLElement)) {
			return;
		}
		const turnId = start.dataset.passageText ?? '';
		const content = story.content(turnId);
		if (content?.type !== 'text') {
			return;
		}
		// Offsets into the passage as stored, not into what is drawn: the
		// markup that is not drawn would otherwise shift every quote
		// (`storedOffset`).
		const quote = quoteAt(
			content.text,
			storedOffset(start, range.startContainer, range.startOffset),
			storedOffset(start, range.endContainer, range.endOffset)
		);
		selection = quote ? { turnId, quote } : null;
	}

	function onPointerDown(event: PointerEvent) {
		const target = event.target instanceof Element ? event.target : null;
		if (selection && !target?.closest('.selection, [data-passage-text]')) {
			selection = null;
		}
	}

	onMount(() => {
		document.addEventListener('selectionchange', onSelectionChange);
		document.addEventListener('pointerdown', onPointerDown);
		return () => {
			document.removeEventListener('selectionchange', onSelectionChange);
			document.removeEventListener('pointerdown', onPointerDown);
		};
	});

	// ── dialogs and drawers ──────────────────────────────────────────────────

	let bookmarking: { turnId: string; quote: Quote | null } | null = $state(null);
	let notThis: { turnId: string; quote: Quote } | null = $state(null);
	let showBranches = $state(false);
	let showBookmarks = $state(false);
	let dialsProblem: string | null = $state(null);

	// ── the composer ─────────────────────────────────────────────────────────

	let composer: ReturnType<typeof MessageComposer> | undefined = $state();

	/**
	 * Sends what the user wrote. The composer keeps the text, and the draft,
	 * until this answers null — once the turn is saved, not once the passage
	 * has come.
	 */
	async function send(message: ComposedMessage): Promise<string | null> {
		const text = documentToPlainText(parseStoredRichText(message.text)).trim();
		return await story.send(text);
	}

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
	<!-- A placeholder until this device can open the story (AGENTS.md: never
	     content while the keyring is anything but unlocked). -->
	<p class="placeholder">{PENDING_TEXT}</p>
{:else}
	<div class="tools">
		{#if debug}
			<wa-switch
				size="s"
				class="raw-log"
				checked={rawLogChosen}
				onchange={(event: Event) => setRawLog((event.currentTarget as HTMLInputElement).checked)}
				>Raw log</wa-switch
			>
			<wa-button size="s" appearance="outlined" disabled={exporting} onclick={exportHistory}>
				<wa-icon slot="start" name="file-export" variant="solid"></wa-icon>
				{exporting ? 'Exporting…' : 'Export'}
			</wa-button>
		{/if}
		<wa-button size="s" appearance="outlined" onclick={() => {
			showBranches = true;
		}}>
			<wa-icon slot="start" name="code-branch" variant="solid"></wa-icon>
			Branches
		</wa-button>
		<wa-button size="s" appearance="outlined" onclick={() => {
			showBookmarks = true;
		}}>
			<wa-icon slot="start" name="bookmark" variant="regular"></wa-icon>
			Bookmarks
		</wa-button>
		<!-- One split button, Web Awesome's pattern: the setup's own page, and
		     on the chevron the dials, the part of the setup turned most often
		     mid-story. A popover rather than the pattern's `wa-dropdown`, which
		     holds menu items, not sliders. Settings' name is finished in hidden
		     text, as it would otherwise be the same as the app nav's Settings
		     link (AGENTS.md: no two links share a name). -->
		<wa-button-group label="Settings">
			<wa-button
				size="s"
				appearance="outlined"
				href={resolve('/(auth-required)/(app)/daydreams/[id]/edit', { id: daydream.id })}
			>
				<wa-icon slot="start" name="gear" variant="solid"></wa-icon>
				Settings <span class="wa-visually-hidden">for this daydream</span>
			</wa-button>
			{#if setup && available}
				<wa-button id="daydream-dials" size="s" appearance="outlined">
					<wa-icon name="chevron-down" variant="solid" label="Dials"></wa-icon>
				</wa-button>
			{/if}
		</wa-button-group>
		{#if setup && available}
			<wa-popover for="daydream-dials" placement="bottom-end">
				<div class="dials">
					<DaydreamDials
						value={setup.dials}
						onchange={async (dials) => {
							dialsProblem = await story.setDials(dials);
						}}
						idea={setup.idea.dials}
						onideachange={async (dials) => {
							dialsProblem = await story.setIdeaDials(dials);
						}}
					/>
					{#if story.picturesAvailable}
						<DaydreamPicturesControl
							name="story-picture-style"
							value={setup.pictures}
							onchange={async (pictures) => {
								dialsProblem = await story.setPictures(pictures);
							}}
						/>
					{/if}
					{#if dialsProblem}<p class="invalid" role="alert">{dialsProblem}</p>{/if}
				</div>
			</wa-popover>
		{/if}
	</div>

	<!-- Follows a passage as it arrives only for a reader already at the end:
	     one who has scrolled up to read is left where they are. And only until
	     the passage's top reaches the top of the screen (`heldId`). -->
	<ol
		class="turns"
		bind:this={listElement}
		aria-live="polite"
		{@attach (list) => followEnd(list, { holdAt: () => heldElement(list) })}
	>
		{#if rawLog}
			<DaydreamRawSetup setup={setupExchanges} />
		{/if}
		{#if rawLog && newestPassage && exchanges.forTurn(newestPassage.id) === null}
			<!-- A story whose newest passage has an exchange has its system prompt
			     in it, so this is only for one written before exchanges were kept. -->
			<DaydreamRawSystem {story} {conversation} turnId={newestPassage.id} />
		{/if}
		{#if rawLog}
			{#each exchanges.failedAfter(null) as failed (failed.id)}
				<DaydreamRawExchange exchange={failed} previous={null} />
			{/each}
		{/if}
		{#each story.path as node (node.id)}
			{#if rawLog}
				{#if node.role === 'story'}
					{const exchange = $derived(exchanges.forTurn(node.id))}
					{#if exchange}
						{const before = $derived(previousPassage.get(node.id))}
						<DaydreamRawExchange
							{exchange}
							previous={before ? (exchanges.forTurn(before.id) ?? null) : null}
						/>
					{:else if exchange === null}
						<DaydreamRawSent
							{story}
							{conversation}
							{node}
							previous={previousPassage.get(node.id) ?? null}
							system={rawSystem}
						/>
					{:else}
						<li class="raw-loading"><wa-spinner></wa-spinner></li>
					{/if}
				{/if}
				<DaydreamRawTurn {story} {node} exchanged={Boolean(exchanges.forTurn(node.id))} />
				{#each exchanges.failedAfter(node.id) as failed (failed.id)}
					{const before = $derived(node.role === 'story' ? node : previousPassage.get(node.id))}
					<DaydreamRawExchange
						exchange={failed}
						previous={before ? (exchanges.forTurn(before.id) ?? null) : null}
					/>
				{/each}
			{:else if node.role === 'story'}
				<DaydreamPassage
					{story}
					{node}
					{speaker}
					{cast}
					{debug}
					opening={node.id === openingId}
					held={node.id === heldId}
					selected={selection?.turnId === node.id ? selection.quote : null}
					onBookmark={(turnId, quote) => {
						bookmarking = { turnId, quote };
						selection = null;
					}}
					onNotThis={(turnId, quote) => {
						notThis = { turnId, quote };
						selection = null;
					}}
				/>
				<DaydreamSettingsNote {story} turnId={node.id} />
				{#if story.driftOfferId === node.id && available && !busy}
					<DaydreamDriftNote {story} turnId={node.id} {debug} />
				{/if}
			{:else}
				<DaydreamUserTurn
					{story}
					{node}
					readAs={answered.get(node.id)?.readAs ?? null}
					expansion={answered.get(node.id)?.expansion ?? null}
					chosen={answered.get(node.id)?.chosen ?? false}
				/>
			{/if}
		{/each}
		{#if story.streaming}
			<DaydreamArriving
				text={story.streaming.text}
				{speaker}
				{cast}
				opening={openingId === null}
			/>
		{/if}
	</ol>

	{#if offerRoll && leaf}
		<DaydreamRollCard {story} turnId={leaf.id} proposal={offerRoll} />
	{/if}

	{#if available}
		<DaydreamSuggestions
			{suggestions}
			disabled={busy}
			onsend={(text) => void story.send(text)}
			onedit={(text) => composer?.replaceText(text)}
		/>
	{/if}

	{#if story.problem}
		<wa-callout variant="danger" size="s" class="problem">
			{story.problem}
			{#if story.retry}
				<wa-button size="s" appearance="outlined" onclick={() => story.retry?.()}>Try again</wa-button>
			{/if}
		</wa-callout>
		{#if rawLog && story.problemRaw}
			<!-- A failed reply is never saved, so this is the only place its text shows. -->
			<pre class="problem-raw">{story.problemRaw}</pre>
		{/if}
	{/if}

	{#if available}
		<div class="compose">
			<DaydreamSafety {story}>
				{#if busy}
					<wa-button size="s" appearance="outlined" onclick={() => story.stop()}>
						<wa-icon slot="start" name="stop" variant="solid"></wa-icon>
						Stop writing
					</wa-button>
				{:else if !story.halted}
					<DaydreamDirections {story} />
				{/if}
			</DaydreamSafety>
			<!-- Nothing until the draft is read and the page has hydrated: an editor
			     shown empty and then filled would look like the text was lost. -->
			{#if mounted}
				{#key daydreamId}
					{#await draftFor(daydreamId) then draft}
						<MessageComposer
							bind:this={composer}
							{send}
							placeholder="Aa"
							ariaLabel="Your turn"
							allowAttachments={false}
							initialText={draft.initial?.text ?? ''}
							onTextChange={(text) => draft.save({ text, tagIds: [] })}
						/>
					{/await}
				{/key}
			{/if}
		</div>
	{:else}
		<wa-callout variant="neutral">
			Daydreams aren't set up on this server any more, so this daydream can't go on. It is still here to
			read.
		</wa-callout>
	{/if}

	{#if bookmarking}
		{const target = $derived(bookmarking)}
		<DaydreamBookmarkDialog
			quote={target.quote}
			onsave={(label) => story.bookmark(target.turnId, { label, quote: target.quote })}
			onclose={() => {
			bookmarking = null;
		}}
		/>
	{/if}
	{#if notThis}
		{const target = $derived(notThis)}
		<DaydreamNotThisDialog
			quote={target.quote}
			onsave={(line) => story.notThis(target.turnId, target.quote, line)}
			onclose={() => {
			notThis = null;
		}}
		/>
	{/if}
	{#if showBranches}
		<DaydreamBranchMap {story} onclose={() => {
			showBranches = false;
		}} onjump={scrollToTurn} />
	{/if}
	{#if showBookmarks}
		<DaydreamBookmarks {story} onclose={() => {
			showBookmarks = false;
		}} onjump={scrollToTurn} />
	{/if}
{/if}

<style>
	.placeholder {
		color: var(--wa-color-text-quiet);
		text-align: center;
	}

	.tools {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		align-items: center;
		gap: 0.375rem;

		.raw-log {
			margin-inline-end: auto;
		}
	}

	.problem-raw {
		margin: 0;
		padding: 0.5rem 0.75rem;
		border: 1px dashed var(--wa-color-surface-border);
		font-family: var(--wa-font-family-code, monospace);
		font-size: var(--wa-font-size-s);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.dials {
		inline-size: min(20rem, 80vw);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.turns {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.problem {
		margin-block-start: 0.75rem;

		wa-button {
			margin-inline-start: 0.5rem;
		}
	}

	/* Pinned to the bottom of the scrollport, directly above the nav: `<main>`
	   is what scrolls, so sticky works against it (AGENTS.md, "Adding a route").
	   The background is a border-image outset rather than a pseudo-element: it
	   bleeds out of the page's centred column to both edges of the pane, and
	   fades in above the box so the story scrolls away under it softly, but an
	   outset is ink overflow — it neither adds a horizontal scrollbar to `<main>`
	   nor catches clicks meant for the turns behind the fade. */
	.compose {
		--fade: 1.5rem;
		position: sticky;
		inset-block-end: 0;
		margin-block-start: 1rem;
		padding-block: 0.75rem;
		border-image:
			linear-gradient(transparent, var(--wa-color-surface-default) var(--fade)) fill 0 / 0 /
			var(--fade) 100vw 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}
</style>
