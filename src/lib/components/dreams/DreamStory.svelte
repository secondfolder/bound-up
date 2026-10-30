<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import { unlockedIdentity } from '$lib/crypto/session.svelte';
	import { elementLabel, linkableNames } from '$lib/dream/elements';
	import { fieldKey } from '$lib/dream/fields';
	import { voiceForSpeaker } from '$lib/dream/voices';
	import { ReadAloud, SPEEDS } from '$lib/dream-browser/reader.svelte';
	import type { DreamSession } from '$lib/dream-browser/session.svelte';
	import { type DraftSession, openDraft } from '$lib/messaging/drafts';
	import { MAX_INPUT_CHARS, MAX_PASSAGE_CHARS } from '$lib/sealed-kinds/dreams';
	import type { FishVoicePresetId } from '$lib/server-settings';
	import DreamCard from './DreamCard.svelte';
	import DreamMarkup, { type MarkupInputs } from './DreamMarkup.svelte';
	import DreamNotices from './DreamNotices.svelte';
	import DreamTextBox from './DreamTextBox.svelte';

	/**
	 * Playing a daydream (docs/dreams.md, "Playing"): the branch being read,
	 * each passage with its versions and what can be done to it, the cards,
	 * and the user's turn. Retry, Another take and Edit each add a version
	 * beside the passage rather than replacing it.
	 */
	let {
		session,
		pictures: picturesOn = false,
		voice = null
	}: {
		session: DreamSession;
		pictures?: boolean;
		/** Read aloud, when this server and account have it. */
		voice?: { narratorPreset: FishVoicePresetId | null } | null;
	} = $props();

	const pictures = $derived({
		enabled: picturesOn,
		url: (key: string) => session.pictures[key],
		has: (key: string) => session.hasPicture(key),
		making: (key: string) => session.filling.has(key),
		show: (key: string) => session.showPicture(key),
		draw: (key: string, picture: { of: string; caption: string }) => {
			const turnId = key.split(':')[0] ?? '';
			void session.drawPicture(turnId, key, picture);
		}
	});

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
				done: () => void session.send(''),
				answer: (question, answer, remember) =>
					void session.answerQuestion(question, answer, remember),
				roll: (offered) => void session.roll(offered)
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
			),
			answered: Object.fromEntries(after.answers.map((answer) => [answer.id, answer.text])),
			rolled: Object.fromEntries(after.rolls.map((rolled) => [rolled.id, rolled.value]))
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

	// ── read aloud ───────────────────────────────────────────────────────────

	// svelte-ignore state_referenced_locally
	// Made once: whether this server reads aloud does not change while the
	// page is open, and the reader holds the clips already fetched.
	const reader = voice
		? new ReadAloud({
				voiceOf: (who) => voiceForSpeaker(who, session.elements, session.id, voice.narratorPreset),
				nameOf: (who) => speakerName(who)
			})
		: null;
	onDestroy(() => reader?.dispose());

	function speakerName(who: string | null): string {
		if (who === 'you') {
			return 'You';
		}
		const element = session.elements.find((candidate) => candidate.id === who);
		return element ? elementLabel(element) : 'Narrator';
	}

	/** The passage's drawn text, which is what is read. */
	function passageRoot(turnId: string): HTMLElement | null {
		return document.querySelector<HTMLElement>(`[data-turn="${CSS.escape(turnId)}"] .markup`);
	}

	function listen(turnId: string, at?: { x: number; y: number }) {
		const root = passageRoot(turnId);
		if (reader && root) {
			reader.play(turnId, root, at);
		}
	}

	function toggleListening() {
		session.listening = !session.listening;
		if (!session.listening) {
			reader?.stop();
			if (reader) {
				reader.readNew = false;
			}
		}
	}

	/**
	 * While a passage is being read, a tap on any sentence of it plays from
	 * there. Only a pointer's shortcut, like the tap-through's tap: Listen and
	 * the player are the controls for the keyboard and a screen reader.
	 */
	function tapToListen(turnId: string): Attachment<HTMLElement> {
		return (element) => {
			const onClick = (event: MouseEvent) => {
				if (
					reader?.turnId === turnId &&
					!(
						event.target instanceof Element &&
						event.target.closest('button, a, input, wa-input, wa-button')
					)
				) {
					listen(turnId, { x: event.clientX, y: event.clientY });
				}
			};
			element.addEventListener('click', onClick);
			return () => element.removeEventListener('click', onClick);
		};
	}

	function nextSpeed() {
		if (reader) {
			const at = SPEEDS.indexOf(reader.rate as (typeof SPEEDS)[number]);
			reader.setRate(SPEEDS[(at + 1) % SPEEDS.length] ?? 1);
		}
	}

	// "Read new passages": each passage that arrives from here on is read
	// once it is finished, never one that was already there.
	let lastHeard: string | null = null;
	$effect(() => {
		const latest = session.lastPassage?.id ?? null;
		const streaming = session.streaming !== null;
		if (latest === lastHeard || streaming) {
			return;
		}
		const previous = lastHeard;
		lastHeard = latest;
		if (previous !== null && latest !== null && reader?.readNew && session.listening) {
			void tick().then(() => listen(latest));
		}
	});

	// ── how it looks ─────────────────────────────────────────────────────────

	const theme = $derived(build?.presentation.theme ?? 'rust');

	/** Every stat on a shown element, labelled with whose it is unless it is the user's. */
	const tracked = $derived(
		elements
			.filter((element) => element.shown)
			.flatMap((element) =>
				element.stats.map((stat) => ({
					key: `${element.id}.${stat.name}`,
					label: element.type === 'you' ? heading(stat.name) : `${element.name}: ${stat.name}`,
					value: stat.value,
					max: stat.kind === 'meter' ? (stat.max ?? 100) : null
				}))
			)
	);

	function heading(name: string): string {
		return name.charAt(0).toUpperCase() + name.slice(1);
	}
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
				<span class="switches">
					{#if reader}
						<!-- A toggle: native, because wa-button forwards no aria-pressed. -->
						<button type="button" class="view-switch" aria-pressed={session.listening} onclick={toggleListening}>
							<wa-icon name="volume-high" aria-hidden="true"></wa-icon>
							Read aloud
						</button>
					{/if}
					<button type="button" class="view-switch" aria-pressed={view === 'tap'} onclick={switchView}>
						<wa-icon name="circle-half-stroke" aria-hidden="true"></wa-icon>
						One beat at a time
					</button>
				</span>
			</div>
			<wa-details summary="How this daydream was set up">
				<div class="setup">
					<p><strong>You asked for</strong> “{session.setup?.brief}”</p>
					{#if build.telling}<p class="telling">{build.telling}</p>{/if}
					{#if elements.length > 0}
						<div class="chips">
							{#each elements.filter((element) => element.shown) as element (element.id)}
								<wa-button size="s" appearance="outlined" onclick={() => openCard(element.id)}>{elementLabel(element)}</wa-button>
							{/each}
						</div>
					{/if}
					{#if (session.setup?.preferences.length ?? 0) > 0}
						<section class="this-daydream">
							<h3>Remembered for this daydream</h3>
							<ul>
								{#each session.setup?.preferences ?? [] as preference (preference.id)}
									<li>
										<span>{preference.text}</span>
										<wa-button size="s" appearance="plain" onclick={() => session.makeGeneral(preference.id)}
											>Make it general</wa-button
										>
										<wa-button size="s" appearance="plain" onclick={() => session.forget(preference.id)}
											>Forget</wa-button
										>
									</li>
								{/each}
							</ul>
						</section>
					{/if}
				</div>
			</wa-details>
		</header>
	{/if}

	{#if tracked.length > 0}
		<!-- The stats as they stand on this branch: each moved only by words that earned it. -->
		<dl class="stats">
			{#each tracked as entry (entry.key)}
				<div>
					<dt>{entry.label}</dt>
					<dd>
						{#if entry.max !== null}
							<wa-progress-bar value={Math.round((Number(entry.value) / entry.max) * 100)} label={entry.label}
							></wa-progress-bar>
							<span class="readout">{entry.value} / {entry.max}</span>
						{:else}
							<span class="readout">{Array.isArray(entry.value) ? entry.value.join(', ') : entry.value}</span>
						{/if}
					</dd>
				</div>
			{/each}
		</dl>
	{/if}

	<ol class="turns" data-view={build?.presentation.view ?? 'scroll'}>
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
				<li class="passage" data-turn={entry.id} {@attach tapToListen(entry.id)}>
					<DreamMarkup
						source={passage.source}
						turnId={entry.id}
						{names}
						{expansions}
						filling={session.filling}
						view={entry.id === answering ? view : 'scroll'}
						inputs={inputsFor(entry.id, index)}
						{pictures}
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
						{#if reader && session.listening}
							<wa-button size="s" appearance="plain" onclick={() => listen(entry.id)}>
								<wa-icon slot="start" name="play" aria-hidden="true"></wa-icon>
								Listen
							</wa-button>
						{/if}
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

	<DreamNotices {session} />

	{#if session.problem}
		<wa-callout variant="warning">{session.problem}</wa-callout>
	{/if}

	{#if reader && session.listening}
		<section class="player" aria-label="Reading aloud">
			<span class="speaker" aria-live="polite">
				{#if reader.loading}
					Getting the voice ready…
				{:else if reader.turnId}
					{reader.speaker}
				{:else}
					Tap Listen on a passage
				{/if}
			</span>
			<span class="controls">
				<wa-button size="s" appearance="plain" disabled={reader.turnId === null} onclick={() => reader.back()}>
					<wa-icon name="backward-step" label="Back a sentence"></wa-icon>
				</wa-button>
				{#if reader.playing}
					<wa-button size="s" appearance="plain" onclick={() => reader.pause()}>
						<wa-icon name="pause" label="Pause"></wa-icon>
					</wa-button>
				{:else}
					<wa-button
						size="s"
						appearance="plain"
						disabled={reader.turnId === null && session.lastPassage === null}
						onclick={() => {
							if (reader.turnId) {
								reader.resume();
							} else if (session.lastPassage) {
								listen(session.lastPassage.id);
							}
						}}
					>
						<wa-icon name="play" label="Play"></wa-icon>
					</wa-button>
				{/if}
				<wa-button size="s" appearance="plain" onclick={nextSpeed}>
					<span class="wa-visually-hidden">Speed</span>
					{reader.rate}×
				</wa-button>
			</span>
			<span class="options">
				<!-- Toggles: native, because wa-button forwards no aria-pressed. -->
				<button
					type="button"
					class="toggle"
					aria-pressed={reader.readNew}
					onclick={() => {
						reader.readNew = !reader.readNew;
					}}>{reader.readNew ? '✓ ' : ''}Read new passages</button
				>
				<button
					type="button"
					class="toggle"
					aria-pressed={reader.highlight}
					onclick={() => reader.setHighlight(!reader.highlight)}
					>{reader.highlight ? '✓ ' : ''}Highlight</button
				>
			</span>
			{#if reader.problem}<p class="problem">{reader.problem}</p>{/if}
		</section>
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

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
		gap: var(--wa-space-xs) var(--wa-space-m);
		margin: 0;

		dt {
			font-size: var(--wa-font-size-s);
			color: var(--wa-color-text-quiet);
		}

		dd {
			display: flex;
			align-items: center;
			gap: var(--wa-space-xs);
			margin: 0;

			wa-progress-bar {
				flex: 1;
				--track-height: 0.5rem;
			}
		}

		.readout {
			font-size: var(--wa-font-size-s);
			font-variant-numeric: tabular-nums;
		}
	}

	/* Monologue: one voice in short lines, set like a script read aloud. */
	.turns[data-view='monologue'] .passage {
		font-size: var(--wa-font-size-l);
		line-height: 1.8;
		text-align: center;
	}

	/* Texts: the story is the other side of a chat, passage by passage. */
	.turns[data-view='texts'] .passage {
		align-self: flex-start;
		max-width: 85%;
		padding: var(--wa-space-xs) var(--wa-space-m);
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-raised);
	}

	.title-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--wa-space-s);
	}

	.switches {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-xs);
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

	/* What is being read, word by word (the reader's CSS highlight). */
	:global(::highlight(dream-reading)) {
		background-color: var(--wa-color-brand-fill-quiet);
		color: inherit;
	}

	.player {
		position: sticky;
		bottom: 0;
		z-index: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--wa-space-2xs) var(--wa-space-s);
		padding: var(--wa-space-xs) var(--wa-space-s);
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-raised);

		.speaker {
			flex: 1 1 8rem;
			min-width: 0;
			font-weight: var(--wa-font-weight-semibold);
			overflow-wrap: anywhere;
		}

		.controls,
		.options {
			display: flex;
			align-items: center;
			gap: var(--wa-space-2xs);
		}

		.toggle {
			padding: var(--wa-space-3xs) var(--wa-space-xs);
			border: 1px solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-pill);
			background: transparent;
			color: inherit;
			font: inherit;
			font-size: var(--wa-font-size-xs);
			cursor: pointer;

			&[aria-pressed='true'] {
				background: var(--wa-color-brand-fill-quiet);
			}

			&:focus-visible {
				outline: var(--wa-focus-ring);
			}
		}

		.problem {
			flex-basis: 100%;
			margin: 0;
			color: var(--wa-color-text-quiet);
			font-size: var(--wa-font-size-s);
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

	.this-daydream {
		h3 {
			margin: 0 0 var(--wa-space-2xs);
			font-size: var(--wa-font-size-s);
		}

		ul {
			margin: 0;
			padding: 0;
			list-style: none;
		}

		li {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--wa-space-2xs);

			span {
				flex: 1 1 12rem;
			}
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
