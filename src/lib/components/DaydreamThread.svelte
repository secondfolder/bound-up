<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { currentKeyring, unlockedIdentity } from '$lib/crypto/session.svelte';
	import { quoteAt } from '$lib/daydream/quotes';
	import { DaydreamStory } from '$lib/daydream/story.svelte';
	import type { ComposedMessage } from '$lib/messaging/client';
	import { openDraft } from '$lib/messaging/drafts';
	import { documentToPlainText, parseStoredRichText } from '$lib/richtext';
	import { followEnd, scrollIntoViewWithin } from '$lib/scroll-parent';
	import type { Quote, Reading } from '$lib/sealed-kinds/daydreams';
	import { PENDING_TEXT } from '$lib/sealed-views.svelte';
	import type { DaydreamView } from '$lib/types';
	import DaydreamBookmarkDialog from './DaydreamBookmarkDialog.svelte';
	import DaydreamBookmarks from './DaydreamBookmarks.svelte';
	import DaydreamBranchMap from './DaydreamBranchMap.svelte';
	import DaydreamDials from './DaydreamDials.svelte';
	import DaydreamDirections from './DaydreamDirections.svelte';
	import DaydreamNotThisDialog from './DaydreamNotThisDialog.svelte';
	import DaydreamPassage from './DaydreamPassage.svelte';
	import DaydreamRollCard from './DaydreamRollCard.svelte';
	import DaydreamSafety from './DaydreamSafety.svelte';
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
		onnamed
	}: {
		daydream: DaydreamView;
		available: boolean;
		/** Told the daydream's name once the model has given it one, for the page's heading. */
		onnamed?: (name: string) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	// Seeded once: from here on the story is this object, added to as turns are
	// saved. The page is keyed on the daydream's id, so another daydream gets a
	// fresh one.
	const story = new DaydreamStory(daydream, available);

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

	onDestroy(() => story.stop());

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
		const before = document.createRange();
		before.selectNodeContents(start);
		before.setEnd(range.startContainer, range.startOffset);
		const from = before.toString().length;
		const quote = quoteAt(content.text, from, from + range.toString().length);
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
						scene={setup.scene.dials}
						onscenechange={async (dials) => {
							dialsProblem = await story.setSceneDials(dials);
						}}
					/>
					{#if dialsProblem}<p class="invalid" role="alert">{dialsProblem}</p>{/if}
				</div>
			</wa-popover>
		{/if}
	</div>

	<!-- Follows a passage as it arrives only for a reader already at the end:
	     one who has scrolled up to read is left where they are. -->
	<ol class="turns" bind:this={listElement} aria-live="polite" {@attach followEnd}>
		{#each story.path as node (node.id)}
			{#if node.role === 'story'}
				<DaydreamPassage
					{story}
					{node}
					{speaker}
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
			<li class="streaming">
				{#if speaker}<span class="who">{speaker}</span>{/if}
				<p class="text">
					{#if story.streaming.text}{story.streaming.text}{:else}<wa-spinner></wa-spinner>
						<span class="wa-visually-hidden">Writing</span>{/if}
				</p>
			</li>
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
			Daydreams aren't set up on this server any more, so the story can't go on. It is still here to
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
		gap: 0.375rem;
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

	.streaming {
		align-self: flex-start;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-inline-size: 90%;

		.who {
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
			padding-inline: 0.25rem;
		}

		.text {
			margin: 0;
			padding: 0.625rem 0.875rem;
			border-radius: 1rem;
			border-end-start-radius: 0.25rem;
			background: var(--wa-color-surface-raised, var(--wa-color-surface-default));
			border: 1px solid var(--wa-color-surface-border);
			white-space: pre-wrap;
			overflow-wrap: anywhere;
		}
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
