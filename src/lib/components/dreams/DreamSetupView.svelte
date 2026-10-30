<script lang="ts">
	import { page } from '$app/state';
	import RadioButton from '$lib/components/segmented/RadioButton.svelte';
	import RadioButtonGroup from '$lib/components/segmented/RadioButtonGroup.svelte';
	import { type Build, parseBuild } from '$lib/dream/build';
	import { type DreamElement, elementLabel } from '$lib/dream/elements';
	import { parseMarkup, plainText } from '$lib/dream/markup';
	import { parseBriefReading } from '$lib/dream/reading';
	import {
		type Lookup,
		type ResearchMode,
		type SetupProgressStep,
		type StepStatus,
		setupProgress
	} from '$lib/dream/setup-progress';
	import type { DreamSession } from '$lib/dream-browser/session.svelte';
	import { MAX_AMENDMENT_CHARS } from '$lib/sealed-kinds/dreams';
	import DreamCard from './DreamCard.svelte';
	import DreamExchange from './DreamExchange.svelte';
	import DreamNotices from './DreamNotices.svelte';
	import DreamTextBox from './DreamTextBox.svelte';
	import { elementIcon } from './element-icons';

	/**
	 * Setting a daydream up, live (docs/dreams.md, "The setup page"): every
	 * step it really takes, in order, each with a line of what the model is
	 * writing while it works and what came of it once it is done, every idea
	 * a tap away, and a box to change it while it works. Then a summary of
	 * what was made, which waits on Start: nothing is played until the user
	 * has seen it.
	 *
	 * Reopened from the story (`onback`), it shows how the daydream was set
	 * up, and choosing another idea or changing it builds a new opening beside
	 * the old one.
	 */
	let {
		session,
		research = 'none',
		onstart,
		onback = null
	}: {
		session: DreamSession;
		research?: ResearchMode;
		onstart: () => void | Promise<void>;
		/** Back to the story, when it has been started. */
		onback?: (() => void) | null;
	} = $props();

	const setup = $derived(session.setup);
	/** Debug mode, on this device for an account that holds it: display only. */
	const debugOn = $derived(Boolean(page.data.debug));
	const streaming = $derived(session.streaming);
	/** The reading, as it streams or as kept. */
	const reading = $derived(
		streaming?.what === 'read' ? parseBriefReading(streaming.text) : (setup?.reading ?? null)
	);
	const streamedBuild = $derived(
		streaming?.what === 'build' ? parseBuild(streaming.text, { final: false }) : null
	);
	/** The build, as it streams or as kept. */
	const build = $derived<Omit<Build, 'passage'> | null>(streamedBuild ?? setup?.build ?? null);
	const opening = $derived(session.path[0]?.turn);
	const openingText = $derived(
		streamedBuild?.passage ?? (opening?.kind === 'passage' ? opening.source : '')
	);
	const chosen = $derived(
		setup?.reading?.directions.find((direction) => direction.id === setup.chosen?.directionId) ?? null
	);
	const step = $derived(session.step);
	const researchText = $derived(
		session.researched ?? (reading?.research.needed ? reading.research.text : '')
	);

	const progress = $derived(
		setup
			? setupProgress({
					setup,
					pending: session.pendingTrail,
					live: session.liveStep,
					lookups: session.lookups,
					research
				})
			: []
	);

	const SPACES = /\s+/g;
	const FIRST_SENTENCE = /^.+?[.!?…](?:\s|$)/;

	/**
	 * The latest of what the model is writing, cleaned of tags, so you can
	 * watch it work: its thinking until its words begin, which a model that
	 * thinks first spends a while on before it writes anything.
	 */
	const liveLine = $derived.by(() => {
		if (!streaming) {
			return '';
		}
		const written = plainText(parseMarkup(streaming.text, { final: false }))
			.replaceAll(SPACES, ' ')
			.trim();
		const words = written || (streaming.thinking ?? '').replaceAll(SPACES, ' ').trim();
		return words.length > 140 ? `…${words.slice(-140)}` : words;
	});

	/** The live line goes under the step being written, never under one waiting on the user. */
	/** The step whose request is shown, in debug mode. */
	let exchangeId = $state<string | null>(null);
	const exchangeStep = $derived(progress.find((entry) => entry.id === exchangeId) ?? null);
	function showExchange(id: string) {
		exchangeId = id;
	}

	const STATUS_WORDS: Record<StepStatus, string> = {
		done: 'done',
		active: 'in progress',
		yours: 'waiting for you',
		waiting: 'to come'
	};

	const VIEW_WORDS: Record<string, string> = {
		scroll: 'read as a story',
		tap: 'one beat at a time',
		texts: 'as messages',
		monologue: 'as a monologue'
	};
	const HEAT_WORDS: Record<string, string> = {
		none: 'Not sexual',
		suggestive: 'Suggestive',
		steamy: 'Steamy',
		explicit: 'Explicit'
	};

	/** One line saying who or what an element is: the first field it shows. */
	function lineOf(element: DreamElement): string {
		const field = element.fields.find((entry) => entry.shown && entry.text.trim());
		const text = field?.text.trim() ?? '';
		return text.length > 140 ? `${text.slice(0, 140)}…` : text;
	}

	/** The first sentence of the opening, as its result. */
	function firstLine(source: string): string {
		const text = plainText(parseMarkup(source, { final: true }))
			.replaceAll(SPACES, ' ')
			.trim();
		const sentence = text.match(FIRST_SENTENCE)?.[0] ?? text;
		return sentence.length > 160 ? `${sentence.slice(0, 160)}…` : sentence.trim();
	}

	/** Every stat on the build's elements, worded for the summary. */
	const tracked = $derived(
		(build?.elements ?? []).flatMap((element) =>
			element.stats.map((stat) =>
				element.type === 'you' ? stat.name : `${elementLabel(element)}'s ${stat.name}`
			)
		)
	);

	let showIdeas = $state(false);
	/** Saved for this daydream unless the user says otherwise (docs/dreams.md, "Preferences"). */
	let remember = $state<'story' | 'general' | 'none'>('story');
	const worded = $derived(session.worded);
	let starting = $state(false);
	/** The element whose card is open. */
	let cardId = $state<string | null>(null);
	const card = $derived(setup?.build?.elements.find((element) => element.id === cardId) ?? null);
	function openCard(id: string) {
		cardId = id;
	}
	/** Changed by hand and not yet followed through: Update takes Start's place. */
	const edits = $derived(setup?.pendingEdits ?? []);

	async function start() {
		starting = true;
		try {
			await onstart();
		} finally {
			starting = false;
		}
	}
</script>

{#snippet lookups(found: readonly Lookup[], showFound: boolean)}
	{#if found.length > 0}
		<ul class="substeps" aria-label="Looked up for the brief">
			{#each found as lookup, index (index)}
				{#if lookup.type === 'search'}
					<li data-ok={lookup.ok}>
						<span aria-hidden="true">{lookup.ok ? '✓' : '✗'}</span>
						<span>
							{lookup.ok ? 'Searched for' : 'Could not search for'}
							<span class="what">“{lookup.query}”</span>
						</span>
					</li>
				{:else}
					<li data-ok={lookup.ok && lookup.allowed}>
						<span aria-hidden="true">{lookup.ok && lookup.allowed ? '✓' : '✗'}</span>
						<span>
							{#if !lookup.allowed}
								Not opened, not one of the brief's sites:
							{:else if lookup.ok}
								Read
							{:else}
								Could not be read:
							{/if}
							<span class="what">{lookup.url}</span>
						</span>
					</li>
				{/if}
			{/each}
		</ul>
	{/if}
	{#if showFound && researchText}
		<wa-details summary="What it found">
			<p class="research">{researchText}</p>
		</wa-details>
	{/if}
{/snippet}

{#snippet ideaList()}
	{#if reading}
		<ul class="directions">
			{#each reading.directions as direction (direction.id)}
				<li class:current={direction.id === chosen?.id}>
					<span>{direction.text}</span>
					{#if setup?.reading && direction.id !== chosen?.id && streaming?.what !== 'read'}
						<wa-button size="s" appearance="outlined" onclick={() => session.choose(direction.id)}>
							Use this one
						</wa-button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet directions()}
	{#if reading && reading.directions.length > 0}
		{#if streaming?.what === 'read' && reading.pick.by !== 'user'}
			<!-- Not drawn as they arrive: code picks one, and a list appearing and
			     going again is noise. Only a brief that asks to choose shows them. -->
			<p class="result quiet">{reading.directions.length} {reading.directions.length === 1 ? 'idea' : 'ideas'} so far</p>
		{:else if step === 'pick'}
			<!-- The user is choosing: the ideas are under that step. -->
			<p class="result">{reading.directions.length} {reading.directions.length === 1 ? 'idea' : 'ideas'}</p>
		{:else if chosen && !showIdeas}
			<p class="result">
				{reading.directions.length}
				{reading.directions.length === 1 ? 'idea' : 'ideas'} ·
				<!-- A disclosure: native, since wa-button forwards no aria-expanded. -->
				<button
					type="button"
					class="link"
					aria-expanded="false"
					onclick={() => {
						showIdeas = true;
					}}>See them all</button
				>
			</p>
		{:else}
			{@render ideaList()}
			{#if chosen}
				<button
					type="button"
					class="link"
					aria-expanded="true"
					onclick={() => {
						showIdeas = false;
					}}>Hide them</button
				>
			{/if}
		{/if}
	{/if}
{/snippet}

{#snippet question()}
	{#if step === 'ask' && setup?.reading?.ask}
		{const asked = $derived(setup.reading.ask)}
		<section class="question" aria-labelledby="question">
			<h2 id="question">{asked.text}</h2>
			<div class="options">
				{#each asked.options as option (option)}
					<wa-button appearance="outlined" onclick={() => session.answer(option, remember)}>{option}</wa-button>
				{/each}
			</div>
			<DreamTextBox
				id="dream-answer"
				label="Or answer in your own words"
				max={400}
				draft={{ kind: 'dream-answer', dreamId: session.id }}
				submitLabel="Answer"
				rows={1}
				onsend={async (text) => {
					await session.answer(text, remember);
					return session.problem === null;
				}}
			/>
			<RadioButtonGroup label="Remember the answer for" size="s" bind:value={remember}>
				<RadioButton value="story">This daydream</RadioButton>
				<RadioButton value="general">Every daydream</RadioButton>
				<RadioButton value="none">Don't</RadioButton>
			</RadioButtonGroup>
		</section>
	{:else if setup?.reading?.ask && setup.reading.answer}
		<p class="result">{setup.reading.ask.text} <strong>{setup.reading.answer}</strong></p>
	{/if}
{/snippet}

{#snippet pick()}
	{#if chosen}
		<p class="result">Picked: <strong>{chosen.text}</strong></p>
		{#if !(setup?.build && step === 'ready')}
			<wa-button size="s" appearance="plain" onclick={() => session.tryAnother()}>Try another idea</wa-button>
		{/if}
	{:else if step === 'pick'}
		<p class="result">You asked to choose. Pick one, or let it choose for you.</p>
		{@render ideaList()}
		<wa-button size="s" appearance="outlined" onclick={() => session.surprise()}>Surprise me</wa-button>
	{/if}
{/snippet}

{#snippet built()}
	{#if build && (build.title || build.elements.length > 0)}
		{#if build.title}<p class="result"><strong>{build.title}</strong></p>{/if}
		<p class="result quiet">
			{HEAT_WORDS[build.heat]}, {VIEW_WORDS[build.presentation.view] ?? build.presentation.view},
			{build.presentation.theme} theme
		</p>
		{#if build.elements.length > 0}
			<ul class="chips cast" aria-label="Who and what is in it">
				{#each build.elements as element (element.id)}
					<li>
						{#if setup?.build && !streamedBuild}
							<button type="button" class="chip" onclick={() => openCard(element.id)}>
								<wa-icon name={elementIcon(element.type)} aria-hidden="true"></wa-icon>
								{elementLabel(element)}
							</button>
						{:else}
							<span class="chip">
								<wa-icon name={elementIcon(element.type)} aria-hidden="true"></wa-icon>
								{elementLabel(element)}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
{/snippet}

{#snippet result(entry: SetupProgressStep)}
	{const showing = $derived(entry.current || entry.status === 'active')}
	{#if entry.kind === 'research'}
		{@render lookups(entry.lookups, showing)}
	{:else if entry.kind === 'read'}
		<!-- What a reading looked up for itself (a story model with tools) is its substeps. -->
		{@render lookups(entry.lookups, showing && research === 'self')}
		{#if showing && reading && reading.musts.length > 0}
			<ul class="musts" aria-label="What it must have">
				{#each reading.musts as must (must)}<li>{must}</li>{/each}
			</ul>
		{/if}
		{#if showing}{@render directions()}{/if}
	{:else if entry.kind === 'answer'}
		{#if entry.current && setup?.reading?.ask && setup.reading.answer}
			<p class="result">{setup.reading.ask.text} <strong>{setup.reading.answer}</strong></p>
		{/if}
	{:else if entry.kind === 'ask'}
		{@render question()}
	{:else if entry.kind === 'pick'}
		{#if showing || entry.status === 'yours'}{@render pick()}{/if}
	{:else if entry.kind === 'build'}
		{#if showing}
			{@render built()}
			{#if openingText && !streamedBuild}<p class="result quiet">“{firstLine(openingText)}”</p>{/if}
		{/if}
	{/if}
{/snippet}

<div class="setup">
	<!-- The brief in a box of its own, as the plan's mockup has it. -->
	<section class="brief" aria-label="What you asked for">
		<p>{setup?.brief}</p>
		{#each setup?.amendments ?? [] as amendment, index (index)}
			<p class="amendment">Then: {amendment}</p>
		{/each}
	</section>

	<ol class="steps">
		{#each progress as entry (entry.id)}
			<li data-status={entry.status} data-step={entry.kind}>
				<span class="mark" aria-hidden="true"></span>
				<div class="body">
					<span class="label">
						<span>{entry.label}<span class="wa-visually-hidden">, {STATUS_WORDS[entry.status]}</span></span>
						{#if debugOn && session.exchanges.has(`setup:${entry.id}`)}
							<!-- Debug mode: this step's request to the model, and its reply. -->
							<wa-button size="s" appearance="plain" onclick={() => showExchange(entry.id)}>
								<wa-icon name="circle-info" label={`The request for “${entry.label}”`}></wa-icon>
							</wa-button>
						{/if}
					</span>
					{#if entry.status === 'active' && liveLine}
						<p class="live" aria-live="off">{liveLine}</p>
					{/if}
					{@render result(entry)}
				</div>
			</li>
		{/each}
	</ol>

	{#if session.problem}
		<wa-callout variant="danger">
			<p>{session.problem}</p>
			{#if debugOn && session.problemDetail}
				<!-- Debug mode: what really went wrong, for an account that can turn it on. -->
				<pre class="problem-detail">{session.problemDetail}</pre>
			{/if}
			<wa-button size="s" appearance="outlined" onclick={() => session.runSetup()}>Try again</wa-button>
		</wa-callout>
	{/if}

	{#if setup?.build && step === 'ready' && !streaming && session.path.length > 0}
		{const made = $derived(setup.build)}
		<!-- What was made, before it is played: the plan's "a quick look first". -->
		<section class="ready" aria-labelledby="ready-title">
			<h2 id="ready-title">{made.title}</h2>
			{#if made.telling}
				<p class="what">{made.telling.split('\n')[0]}</p>
			{/if}
			{#if made.elements.length > 0}
				<h3>Who and what is in it</h3>
				<ul class="people">
					{#each made.elements as element (element.id)}
						<li>
							<!-- Native: a row of the summary that opens its card. -->
							<button type="button" class="person" onclick={() => openCard(element.id)}>
								<wa-icon name={elementIcon(element.type)} aria-hidden="true"></wa-icon>
								<span>
									<strong>{elementLabel(element)}</strong>
									{#if lineOf(element)}<small>{lineOf(element)}</small>{/if}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<dl class="facts">
				<div>
					<dt>Shown</dt>
					<dd>{VIEW_WORDS[made.presentation.view] ?? made.presentation.view}, {made.presentation.theme} theme</dd>
				</div>
				<div>
					<dt>How sexual</dt>
					<dd>{HEAT_WORDS[made.heat]}</dd>
				</div>
				{#if tracked.length > 0}
					<div>
						<dt>Keeps track of</dt>
						<dd>{tracked.join(', ')}</dd>
					</div>
				{/if}
			</dl>
			{#if made.telling || researchText}
				<wa-details summary="Telling notes and background">
					{#if made.telling}<p class="telling">{made.telling}</p>{/if}
					{#if researchText}<p class="research">{researchText}</p>{/if}
				</wa-details>
			{/if}
			{#if edits.length > 0}
				<div class="edits">
					<p><strong>Changed by hand</strong>, not yet followed through the rest:</p>
					<ul>
						{#each edits as change, index (index)}<li>{change}</li>{/each}
					</ul>
				</div>
			{/if}
			<div class="start">
				{#if edits.length > 0}
					<wa-button appearance="accent" variant="brand" onclick={() => session.applyEdits()}>Update</wa-button>
				{:else if onback}
					<wa-button appearance="accent" variant="brand" onclick={() => onback?.()}>Back to the story</wa-button>
					<wa-button appearance="outlined" onclick={() => session.tryAnother()}
						>Start again with another idea</wa-button
					>
				{:else}
					<wa-button appearance="accent" variant="brand" disabled={starting} onclick={start}>Start</wa-button>
					<wa-button appearance="outlined" onclick={() => session.tryAnother()}>Pick another</wa-button>
				{/if}
			</div>
		</section>
	{/if}

	{#if worded.limits.length + worded.preferences.length > 0}
		<!-- So nothing steers the story where the user cannot see it. -->
		<wa-details summary="What I'm keeping in mind">
			<ul class="kept">
				{#each worded.limits as limit (limit)}<li>Never: {limit}</li>{/each}
				{#each worded.preferences as preference (preference)}<li>{preference}</li>{/each}
			</ul>
		</wa-details>
	{/if}

	{#if exchangeStep && exchangeId}
		<DreamExchange
			label={`The request for “${exchangeStep.label}”`}
			about={{}}
			exchange={session.exchanges.get(`setup:${exchangeId}`)}
			onclose={() => {
				exchangeId = null;
			}}
		/>
	{/if}

	{#if card}
		<DreamCard
			element={card}
			filling={false}
			dreamId={session.id}
			onedit={(changed) => session.editElement(changed)}
			onclose={() => {
				cardId = null;
			}}
		/>
	{/if}

	<DreamNotices {session} />

	<div class="change">
		<DreamTextBox
			id="dream-change"
			label="Not quite? Tell it what to change."
			max={MAX_AMENDMENT_CHARS}
			draft={{ kind: 'dream-change', dreamId: session.id }}
			submitLabel="Change it"
			rows={1}
			onsend={async (text) => {
				await session.amend(text);
				return session.problem === null;
			}}
		/>
	</div>
</div>

<style>
	.setup {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);
	}

	.brief {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-2xs);
		padding: var(--wa-space-s) var(--wa-space-m);
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-m);
		background: var(--wa-color-surface-raised);

		p {
			margin: 0;
			white-space: pre-line;
			overflow-wrap: anywhere;
		}
	}

	.amendment {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}

	.steps {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
		margin: 0;
		padding: 0;
		list-style: none;

		> li {
			display: grid;
			grid-template-columns: 1.25rem 1fr;
			gap: var(--wa-space-s);
			align-items: start;
		}

		> li[data-status='waiting'] {
			opacity: 0.4;
		}
	}

	/* The plan's marks: a ring to come, a turning ring while it works, a filled tick when done. */
	.mark {
		position: relative;
		box-sizing: border-box;
		width: 1.125rem;
		height: 1.125rem;
		margin-top: 0.15rem;
		border: 2px solid var(--wa-color-brand-border-loud);
		border-radius: 50%;
	}

	li[data-status='done'] > .mark {
		background: var(--wa-color-brand-fill-loud);
		border-color: var(--wa-color-brand-fill-loud);

		&::after {
			content: '';
			position: absolute;
			left: 0.28rem;
			top: 0.08rem;
			width: 0.25rem;
			height: 0.55rem;
			border: solid var(--wa-color-brand-on-loud);
			border-width: 0 2px 2px 0;
			transform: rotate(45deg);
		}
	}

	li[data-status='active'] > .mark {
		border-top-color: transparent;
	}

	/* Waiting on the user, not the model: the whole ring breathes, never the spinner. */
	li[data-status='yours'] > .mark {
		border-width: 3px;
	}

	@media (prefers-reduced-motion: no-preference) {
		li[data-status='active'] > .mark {
			animation: turn 0.8s linear infinite;
		}

		li[data-status='yours'] > .mark {
			animation: beat 1.6s ease-in-out infinite;
		}
	}

	@keyframes beat {
		50% {
			transform: scale(0.7);
			opacity: 0.55;
		}
	}

	@keyframes turn {
		to {
			transform: rotate(360deg);
		}
	}

	.body {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--wa-space-2xs);
		min-width: 0;
	}

	.label {
		display: flex;
		align-items: center;
		gap: var(--wa-space-2xs);
		font-weight: var(--wa-font-weight-semibold);
	}

	.live {
		margin: 0;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
		font-style: italic;
		overflow-wrap: anywhere;
	}

	.result {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.quiet {
		color: var(--wa-color-text-quiet);
		font-size: var(--wa-font-size-s);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-2xs);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.cast .chip {
		display: inline-flex;
		align-items: center;
		gap: var(--wa-space-3xs);
		padding: var(--wa-space-3xs) var(--wa-space-xs);
		border: 1px solid var(--wa-color-brand-border-normal);
		border-radius: var(--wa-border-radius-pill);
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--wa-font-size-s);
	}

	.edits {
		padding: var(--wa-space-xs) var(--wa-space-s);
		border-left: 3px solid var(--wa-color-brand-border-loud);
		font-size: var(--wa-font-size-s);

		p,
		ul {
			margin: 0;
		}
	}

	.substeps {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-3xs);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--wa-font-size-s);

		li {
			display: flex;
			gap: var(--wa-space-xs);
		}

		li[data-ok='false'] {
			color: var(--wa-color-text-quiet);
		}

		.what {
			overflow-wrap: anywhere;
		}
	}

	.research,
	.telling {
		margin: 0;
		white-space: pre-line;
	}

	.question {
		display: flex;
		flex-direction: column;
		align-self: stretch;
		gap: var(--wa-space-s);

		h2 {
			margin: 0;
			font-size: var(--wa-font-size-m);
		}
	}

	.options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-xs);
	}

	.link {
		all: unset;
		cursor: pointer;
		text-decoration: underline;
		font-size: var(--wa-font-size-s);

		&:focus-visible {
			outline: var(--wa-focus-ring);
		}
	}

	.directions {
		display: flex;
		flex-direction: column;
		align-self: stretch;
		gap: var(--wa-space-xs);
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--wa-space-s);
			padding: var(--wa-space-xs) var(--wa-space-s);
			border: 1px solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-m);
		}

		li.current {
			border-color: var(--wa-color-brand-border-loud);
		}
	}

	.ready {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
		padding: var(--wa-space-m);
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-raised);

		h2,
		h3 {
			margin: 0;
		}

		h3 {
			font-size: var(--wa-font-size-s);
			color: var(--wa-color-text-quiet);
		}

		.what {
			margin: 0;
		}
	}

	.people {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
		margin: 0;
		padding: 0;
		list-style: none;

		.person {
			display: grid;
			grid-template-columns: 1.25rem minmax(0, 1fr);
			gap: var(--wa-space-xs);
			align-items: baseline;
			width: 100%;
			padding: var(--wa-space-2xs);
			border: 0;
			border-radius: var(--wa-border-radius-m);
			background: transparent;
			color: inherit;
			font: inherit;
			text-align: start;
			cursor: pointer;

			&:hover {
				background: var(--wa-color-brand-fill-quiet);
			}

			&:focus-visible {
				outline: var(--wa-focus-ring);
			}
		}

		span {
			display: flex;
			flex-direction: column;
			min-width: 0;
			overflow-wrap: anywhere;
		}

		small {
			color: var(--wa-color-text-quiet);
		}
	}

	.facts {
		display: grid;
		gap: var(--wa-space-2xs);
		margin: 0;

		div {
			display: flex;
			flex-wrap: wrap;
			gap: var(--wa-space-xs);
		}

		dt {
			color: var(--wa-color-text-quiet);
		}

		dd {
			margin: 0;
		}
	}

	.start {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-xs);
	}

	.kept {
		margin: 0;
		padding-left: 1.25em;
	}

	.change {
		position: sticky;
		bottom: 0;
		padding-block: var(--wa-space-s);
		background: var(--wa-color-surface-default);
	}

	.cast button.chip {
		cursor: pointer;

		&:hover {
			background: var(--wa-color-brand-fill-quiet);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
		}
	}

	/* Plain lines, not chips: they are what was read, nothing to press. */
	.musts {
		margin: 0;
		padding-left: 1.25em;
		font-size: var(--wa-font-size-s);
		overflow-wrap: anywhere;
	}

	.problem-detail {
		max-height: 16rem;
		margin: var(--wa-space-xs) 0 0;
		overflow: auto;
		font-size: var(--wa-font-size-xs);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
