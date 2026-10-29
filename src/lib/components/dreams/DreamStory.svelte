<script lang="ts">
	import { onMount } from 'svelte';
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import { unlockedIdentity } from '$lib/crypto/session.svelte';
	import { linkableNames } from '$lib/dream/elements';
	import { fieldKey } from '$lib/dream/fields';
	import type { DreamSession } from '$lib/dream-browser/session.svelte';
	import { type DraftSession, openDraft } from '$lib/messaging/drafts';
	import { MAX_INPUT_CHARS, MAX_PASSAGE_CHARS } from '$lib/sealed-kinds/dreams';
	import DreamCard from './DreamCard.svelte';
	import DreamMarkup, { type MarkupInputs } from './DreamMarkup.svelte';
	import DreamTextBox from './DreamTextBox.svelte';

	/**
	 * Playing a daydream (docs/dreams.md, "Playing"): the branch being read,
	 * each passage with its versions and what can be done to it, the cards,
	 * and the user's turn. Retry, Another take and Edit each add a version
	 * beside the passage rather than replacing it.
	 */
	let { session }: { session: DreamSession } = $props();

	const elements = $derived(session.elements);
	const names = $derived(linkableNames(elements));
	const expansions = $derived(session.expansions);
	const build = $derived(session.setup?.build ?? null);

	let cardId = $state<string | null>(null);
	let editing = $state<{ turnId: string; source: string } | null>(null);
	const card = $derived(elements.find((element) => element.id === cardId) ?? null);

	function openCard(id: string) {
		cardId = id;
		void session.fillCard(id);
	}

	function expand(turnId: string, key: string, phrase: string) {
		if (!expansions.has(key)) {
			void session.expand(turnId, key, phrase);
		}
	}

	// ── what the user sets in a passage ─────────────────────────────────────

	const answering = $derived(session.lastPassage?.id ?? null);

	/** The passage being answered takes input; the rest show what was sent after them. */
	function inputsFor(turnId: string, index: number): MarkupInputs {
		if (turnId === answering && !session.busy) {
			return {
				live: true,
				choices: session.choices,
				values: session.values,
				setChoice: (id, value) => session.setChoice(id, value),
				setValue: (key, value) => session.setValue(key, value),
				done: () => void session.send('')
			};
		}
		const after = session.path[index + 1]?.turn;
		if (after?.kind !== 'input') {
			return { live: false, choices: {}, values: {} };
		}
		return {
			live: false,
			choices: Object.fromEntries(after.cycles.map((cycle) => [cycle.id, cycle.value])),
			values: Object.fromEntries(
				after.fields.map((field) => [fieldKey(field.block, field.name), field.value])
			)
		};
	}

	// Half-filled fields are kept, encrypted, like anything typed.
	let inputsDraft: DraftSession | null = null;
	onMount(() => {
		void openDraft({ kind: 'dream-inputs', dreamId: session.id }, unlockedIdentity()).then(
			(draft) => {
				inputsDraft = draft;
				try {
					const saved = draft.initial ? JSON.parse(draft.initial.text) : null;
					if (saved && typeof saved.turnId === 'string') {
						session.restoreInputs(saved);
					}
				} catch {
					// A draft that will not read is no draft.
				}
			}
		);
	});
	$effect(() => {
		const set = Object.keys(session.choices).length + Object.keys(session.values).length > 0;
		const text = set
			? JSON.stringify({ turnId: answering, choices: session.choices, values: session.values })
			: '';
		inputsDraft?.save({ text, tagIds: [] });
	});

	// ── how it looks ─────────────────────────────────────────────────────────

	const theme = $derived(build?.presentation.theme ?? 'rust');
	const viewKey = $derived(`bound-up:dream-view:${session.id}`);
	let chosenView = $state<'scroll' | 'tap' | null>(null);
	onMount(() => {
		try {
			const saved = localStorage.getItem(viewKey);
			chosenView = saved === 'tap' || saved === 'scroll' ? saved : null;
		} catch {
			// Storage refused: the build's suggestion stands.
		}
	});
	const view = $derived(chosenView ?? (build?.presentation.view === 'tap' ? 'tap' : 'scroll'));

	function switchView() {
		chosenView = view === 'tap' ? 'scroll' : 'tap';
		try {
			localStorage.setItem(viewKey, chosenView);
		} catch {
			// Remembered for this page only.
		}
	}

	const ENDED_NOTES: Record<string, string> = {
		stopped: 'Stopped before the end.',
		refused: 'Refused.',
		failed: 'Stopped part way.'
	};
</script>

<div
	class="story"
	data-theme={theme}
	style:--dream-page={`var(--dream-${theme}-page)`}
	style:--dream-ink={`var(--dream-${theme}-ink)`}
	style:--dream-accent={`var(--dream-${theme}-accent)`}
	style:--dream-face={`var(--dream-${theme}-face)`}
>
	{#if build}
		<header class="title">
			<div class="title-line">
				<h2>{build.title}</h2>
				<!-- A toggle: native, because wa-button forwards no aria-pressed. -->
				<button type="button" class="view-switch" aria-pressed={view === 'tap'} onclick={switchView}>
					<wa-icon name="circle-half-stroke" aria-hidden="true"></wa-icon>
					One beat at a time
				</button>
			</div>
			<wa-details summary="How this daydream was set up">
				<div class="setup">
					<p><strong>You asked for</strong> “{session.setup?.brief}”</p>
					{#if build.telling}<p class="telling">{build.telling}</p>{/if}
					{#if elements.length > 0}
						<div class="chips">
							{#each elements.filter((element) => element.shown) as element (element.id)}
								<wa-button size="s" appearance="outlined" onclick={() => openCard(element.id)}>{element.name}</wa-button>
							{/each}
						</div>
					{/if}
				</div>
			</wa-details>
		</header>
	{/if}

	<ol class="turns">
		{#each session.path as entry, index (entry.id)}
			{#if entry.turn === null}
				<li class="unreadable">This part can't be shown on this device.</li>
			{:else if entry.turn.kind === 'input'}
				<li class="you">
					{#if entry.turn.text.trim()}
						<p>{entry.turn.text}</p>
					{:else}
						<p class="quiet">Continue</p>
					{/if}
				</li>
			{:else}
				{const versions = $derived(session.versions(entry.id))}
				{const passage = $derived(entry.turn)}
				<li class="passage">
					<DreamMarkup
						source={passage.source}
						turnId={entry.id}
						{names}
						{expansions}
						filling={session.filling}
						view={entry.id === answering ? view : 'scroll'}
						inputs={inputsFor(entry.id, index)}
						onref={openCard}
						onmore={(key, phrase) => expand(entry.id, key, phrase)}
					/>
					{#if ENDED_NOTES[passage.ended]}
						<p class="ended">{ENDED_NOTES[passage.ended]}</p>
					{/if}
					{#if session.chips?.turnId === entry.id}
						{const chips = $derived(session.chips)}
						<fieldset class="chips steer">
							<legend class="quiet">Or steer it</legend>
							{#each chips.options as option (option)}
								<wa-button
									size="s"
									appearance="outlined"
									disabled={session.busy}
									onclick={() => session.steerTo(entry.id, option)}>{option}</wa-button
								>
							{/each}
						</fieldset>
					{/if}
					<div class="passage-actions">
						{#if versions.ids.length > 1}
							<span class="versions">
								<wa-button
									size="s"
									appearance="plain"
									disabled={versions.at <= 0 || session.busy}
									onclick={() => session.switchTo(versions.ids[versions.at - 1] ?? entry.id)}
								>
									<wa-icon name="chevron-left" label="Previous version"></wa-icon>
								</wa-button>
								<span>{versions.at + 1} / {versions.ids.length}</span>
								<wa-button
									size="s"
									appearance="plain"
									disabled={versions.at >= versions.ids.length - 1 || session.busy}
									onclick={() => session.switchTo(versions.ids[versions.at + 1] ?? entry.id)}
								>
									<wa-icon name="chevron-right" label="Next version"></wa-icon>
								</wa-button>
							</span>
						{/if}
						{#if passage.ended !== 'complete'}
							<wa-button size="s" appearance="outlined" disabled={session.busy} onclick={() => session.retry(entry.id)}>
								Retry
							</wa-button>
						{/if}
						<wa-button size="s" appearance="plain" disabled={session.busy} onclick={() => session.anotherTake(entry.id)}>
							Another take
						</wa-button>
						<wa-button
							size="s"
							appearance="plain"
							disabled={session.busy}
							onclick={() => session.differentDirection(entry.id)}
						>
							Different direction
						</wa-button>
						<wa-button
							size="s"
							appearance="plain"
							disabled={session.busy}
							onclick={() => {
								editing = { turnId: entry.id, source: passage.source };
							}}
						>
							Edit
						</wa-button>
					</div>
				</li>
			{/if}
		{/each}
		{#if session.streaming?.what === 'passage'}
			<li class="passage" aria-busy="true">
				{#if session.streaming.text}
					<DreamMarkup
						source={session.streaming.text}
						turnId={null}
						{names}
						{expansions}
						filling={session.filling}
						streaming
						onref={openCard}
						onmore={() => undefined}
					/>
				{:else}
					<div class="waiting" role="status" aria-label="Writing">
						<wa-skeleton effect="sheen"></wa-skeleton>
						<wa-skeleton effect="sheen"></wa-skeleton>
					</div>
				{/if}
			</li>
		{/if}
	</ol>

	{#if session.problem}
		<wa-callout variant="warning">{session.problem}</wa-callout>
	{/if}

	<div class="compose">
		<DreamTextBox
			id="dream-turn"
			label="Your turn"
			max={MAX_INPUT_CHARS}
			draft={{ kind: 'dream', dreamId: session.id }}
			submitLabel="Send"
			disabled={session.busy}
			onsend={async (text) => {
				await session.send(text);
				return true;
			}}
		>
			{#snippet actions()}
				{#if session.busy}
					<wa-button appearance="outlined" onclick={() => session.stop()}>
						<wa-icon slot="start" name="stop" variant="solid"></wa-icon>
						Stop
					</wa-button>
				{:else}
					<wa-button appearance="plain" onclick={() => session.send('')}>Continue</wa-button>
				{/if}
			{/snippet}
		</DreamTextBox>
	</div>
</div>

{#if card}
	<DreamCard
		element={card}
		filling={session.filling.has(`card:${card.id}`)}
		ondraw={() => session.namesFor(card.id)}
		onrename={(name) => session.rename(card.id, name)}
		onclose={() => {
			cardId = null;
		}}
	/>
{/if}

{#if editing}
	{const target = $derived(editing)}
	<ResponsiveDialog
		label="Edit this passage"
		lightDismiss={false}
		onclose={() => {
			editing = null;
		}}
	>
		<p class="quiet">Your version is kept beside the original, and the story goes on from yours.</p>
		<DreamTextBox
			id="dream-edit"
			label="The passage"
			max={MAX_PASSAGE_CHARS}
			draft={{ kind: 'dream-edit', turnId: target.turnId }}
			initial={target.source}
			submitLabel="Keep my version"
			rows={10}
			onsend={async (text) => {
				await session.edit(target.turnId, text);
				editing = null;
				return true;
			}}
		/>
	</ResponsiveDialog>
{/if}

<style>
	.story {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);
	}

	.title-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--wa-space-s);
	}

	.view-switch {
		display: inline-flex;
		align-items: center;
		gap: var(--wa-space-2xs);
		padding: var(--wa-space-2xs) var(--wa-space-s);
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-pill);
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--wa-font-size-s);
		cursor: pointer;

		&[aria-pressed='true'] {
			background: var(--wa-color-brand-fill-quiet);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
		}
	}

	.title h2 {
		margin: 0 0 var(--wa-space-xs);
	}

	.setup {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);

		p {
			margin: 0;
		}
	}

	.telling {
		color: var(--wa-color-text-quiet);
		white-space: pre-line;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-2xs);
	}

	.steer {
		align-items: center;
		margin-inline: 0;
		padding: 0;
		border: 0;
		margin-top: var(--wa-space-xs);
		font-family: var(--wa-font-family-body);
	}

	/* The daydream's theme is the passages' own: their page, ink and face. */
	.turns {
		padding: var(--wa-space-m);
		border-radius: var(--wa-border-radius-l);
		background: var(--dream-page);
		color: var(--dream-ink);
		font-family: var(--dream-face);
		margin: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-l);
	}

	.you {
		align-self: flex-end;
		max-width: 85%;
		padding: var(--wa-space-xs) var(--wa-space-m);
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-brand-fill-quiet);

		p {
			margin: 0;
			white-space: pre-line;
		}
	}

	.quiet,
	.ended,
	.unreadable {
		margin: 0;
		color: var(--wa-color-text-quiet);
		font-size: var(--wa-font-size-s);
	}

	.passage-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--wa-space-2xs);
		margin-top: var(--wa-space-xs);
	}

	.versions {
		display: inline-flex;
		align-items: center;
		gap: var(--wa-space-2xs);
		font-size: var(--wa-font-size-s);
	}

	.waiting {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
	}

	.compose {
		position: sticky;
		bottom: 0;
		padding-block: var(--wa-space-s);
		background: var(--wa-color-surface-default);
	}
</style>
