<script lang="ts">
	import { DAYDREAM_LIMITS, DAYDREAM_VOICE_PRESETS, type DaydreamVoicePresetId } from '$lib/daydream';
	import { ideaLevel } from '$lib/daydream/dial-words';
	import type { ExchangeLogView as ChatLog } from '$lib/daydream/exchange-log';
	import {
		type DaydreamStarter,
		forSide,
		inOrder,
		matchesSearch,
		SHOWN_STARTERS,
		type StarterSide,
		starterIdea,
		startersFor
	} from '$lib/daydream/starters';
	import type { SuggestFailure } from '$lib/daydream/suggest';
	import type { GeneratedIdea } from '$lib/daydream/suggestions';
	import DaydreamSidePicker from './DaydreamSidePicker.svelte';
	import ExchangeLog from './ExchangeLog.svelte';
	import SearchField from './SearchField.svelte';
	import SuggestionProblem from './SuggestionProblem.svelte';

	/**
	 * The ways into a new daydream, friendliest first: describe it in a
	 * sentence and have the model put it together ("Write this story") or
	 * offer a few stories like it ("Suggest stories for this"), pick a
	 * ready-made one (searchable by title, premise and tags),
	 * or build it from scratch. Suggested stories take the ready-made ones'
	 * place until cleared, and "More ideas" adds to them; under it, the
	 * ready-made ones show a few at first and "More ideas" shows them all; both, and "Write
	 * this story", are for the side chosen under "You as", which also filters
	 * the ready-made ones. All but the last land on the setup form's sentence,
	 * where every part of it can still be changed. See docs/daydreams.md,
	 * "Starting one".
	 *
	 * Presentational: the page owns the request, so "Try another" on the
	 * setup can ask again with the same words.
	 */
	let {
		brief = $bindable(),
		side = $bindable(),
		suggestionsOn,
		starterOrder,
		asking,
		problem,
		generated,
		writing,
		ideaProblem,
		ondescribe,
		onstarter,
		ongenerate,
		onmore,
		onclear,
		onidea,
		onblank,
		debug = false
	}: {
		/** What the user has written, kept by the page so it survives going back. */
		brief: string;
		/** Which side the stories are for, or null for either. Kept by the page. */
		side: StarterSide | null;
		/** Whether the model may be asked: without it there is no "describe it". */
		suggestionsOn: boolean;
		/** The ready-made daydreams' ids in the order to show them, shuffled by the page's load. */
		starterOrder: readonly string[];
		asking: boolean;
		/** Why the last description came back with nothing, or null. */
		problem: SuggestFailure | null;
		/** The last ideas generated and what was asked for, kept by the page; null before any. */
		generated: {
			brief: string;
			ideas: readonly GeneratedIdea[];
			/** How the model wrote the latest ones, links read and all, for debug mode. */
			log?: ChatLog;
		} | null;
		/** The title of the generated idea being written out, while it is. */
		writing: string | null;
		/** Why a generated idea could not be written out, or null. */
		ideaProblem: SuggestFailure | null;
		ondescribe: () => void;
		onstarter: (starter: DaydreamStarter) => void;
		/** Asks for stories like the one described; answers why none came, or null. */
		ongenerate: (brief: string) => Promise<SuggestFailure | null>;
		/** Asks for more of the same, added to the last; answers why none came, or null. */
		onmore: () => Promise<SuggestFailure | null>;
		/** Puts the generated ideas away, back to the ready-made daydreams. */
		onclear: () => void;
		onidea: (idea: GeneratedIdea) => void;
		onblank: () => void;
		/** Debug mode: a failed suggestion shows what came back. */
		debug?: boolean;
	} = $props();

	let suggesting = $state(false);
	let suggestProblem: SuggestFailure | null = $state(null);
	let gettingMore = $state(false);
	let moreProblem: SuggestFailure | null = $state(null);

	async function suggest() {
		suggesting = true;
		suggestProblem = null;
		suggestProblem = await ongenerate(brief.trim());
		suggesting = false;
	}

	async function more() {
		gettingMore = true;
		moreProblem = null;
		moreProblem = await onmore();
		gettingMore = false;
	}

	/** What is typed in the search beside "Story suggestions"; empty is no filter. */
	let filter = $state('');

	const starters = $derived(
		inOrder(startersFor(side), starterOrder).filter((starter) =>
			matchesSearch({ ...starterIdea(starter).idea, tags: starter.tags }, filter)
		)
	);
	/**
	 * The ready-made daydreams show `SHOWN_STARTERS` until "More ideas" shows
	 * the lot. A search looks through all of them, so what it finds is never
	 * hidden behind the button.
	 */
	let allStarters = $state(false);
	const searching = $derived(filter.trim() !== '');
	const startersShown = $derived(
		allStarters || searching ? starters : starters.slice(0, SHOWN_STARTERS)
	);
	// An idea whose brief put the user on the other side is what they asked
	// for, so "You as" does not hide it.
	const ideasForSide = $derived(
		generated
			? generated.ideas.filter((idea) => idea.sideFromBrief || forSide([idea], side).length > 0)
			: []
	);
	const ideasShown = $derived(ideasForSide.filter((shown) => matchesSearch(shown, filter)));

	const busy = $derived(asking || suggesting || gettingMore);
	const canAsk = $derived(brief.trim() !== '' && !busy);

	const voiceLabel = (voice: DaydreamVoicePresetId) =>
		DAYDREAM_VOICE_PRESETS.find((preset) => preset.id === voice)?.label ?? '';
</script>

<div class="starter">
	{#if suggestionsOn}
		<section class="describe" aria-labelledby="describe-heading">
			<h2 id="describe-heading">What do you feel like?</h2>
			<label class="brief">
				<span class="hint">A few words is enough: who, where, what happens, or what it should say.</span>
				<textarea
					rows="3"
					maxlength={DAYDREAM_LIMITS.brief}
					placeholder="A stranger on a night train…"
					bind:value={brief}
					disabled={asking || suggesting}></textarea>
			</label>
			<div class="controls">
				<DaydreamSidePicker bind:side />
				<div class="actions">
					<wa-button
						appearance={canAsk ? 'filled' : 'outlined'}
						variant={canAsk ? 'brand' : 'neutral'}
						disabled={!canAsk}
						onclick={ondescribe}
					>
						<wa-icon slot="start" name="wand-magic-sparkles" variant="solid"></wa-icon>
						{asking ? 'Writing your daydream…' : 'Write this daydream'}
					</wa-button>
					<wa-button appearance="outlined" disabled={!canAsk} onclick={suggest}>
						<wa-icon slot="start" name="lightbulb" variant="solid"></wa-icon>
						{suggesting ? 'Thinking up daydreams…' : 'Suggest daydreams for this'}
					</wa-button>
				</div>
			</div>
			{#if problem}<SuggestionProblem {problem} {debug} />{/if}
			{#if suggestProblem}<SuggestionProblem problem={suggestProblem} {debug} />{/if}
		</section>
	{/if}

	<section class="ready-made" aria-labelledby="ready-made-heading">
		<div class="ready-made-head">
			<h2 id="ready-made-heading">Daydream suggestions</h2>
			<div class="search">
				<SearchField
					bind:value={filter}
					label="Search daydreams"
					placeholder="Title, premise or tag"
					collapsible
				/>
			</div>
		</div>
		<!-- With the box, "You as" sits beside its buttons instead, since it is
		     what they ask for as well as what is shown here. -->
		{#if !suggestionsOn}<DaydreamSidePicker bind:side />{/if}
		{#if generated}
			<section class="generated" aria-labelledby="generated-heading">
				<div class="generated-head">
					<h3 id="generated-heading">For “{generated.brief}”</h3>
					<wa-button
						appearance="plain"
						size="s"
						disabled={busy}
						onclick={() => {
							moreProblem = null;
							onclear();
						}}
					>
						<wa-icon slot="start" name="xmark" variant="solid"></wa-icon>
						Clear
					</wa-button>
				</div>
				{#if debug && generated.log}<ExchangeLog log={generated.log} />{/if}
				{#if ideasForSide.length === 0}
					<p class="hint">None of these have you as the {side}. Ask for more that do.</p>
				{:else if ideasShown.length === 0}
					<p class="hint">None of these match “{filter.trim()}”.</p>
				{/if}
				<ul class="cards">
					{#each ideasShown as idea (idea.title)}
						{const level = $derived(ideaLevel(idea.dials))}
						<li>
							<!-- A card, as the ready-made ones are. -->
							<button
								type="button"
								class="card"
								disabled={asking}
								onclick={() => onidea(idea)}
							>
								<span class="title">{idea.title}</span>
								<span class="premise">{idea.premise}</span>
								<span class="tags">
									{#each idea.tags as tag (tag)}<span class="tag">{tag}</span>{/each}
								</span>
								<!-- "You’re the dom" says nothing once "You as" has chosen the side
								     a card is for, so cards say it under "Either", and on one whose
								     brief chose the other side. -->
								<span class="meta">
									{#if writing === idea.title}
										<span class="level">Writing your daydream…</span>
									{:else if level}<span class="level">{level}</span>{/if}
									{#if idea.voice}<span>{voiceLabel(idea.voice)}</span>{/if}
									{#if idea.you && (side === null || idea.sideFromBrief)}<span>You’re the {idea.you}</span>{/if}
								</span>
							</button>
						</li>
					{/each}
				</ul>
				{#if ideaProblem}<SuggestionProblem problem={ideaProblem} {debug} />{/if}
				<wa-button
					class="more"
					appearance="outlined"
					size="s"
					disabled={busy}
					onclick={more}
				>
					<wa-icon slot="start" name="plus" variant="solid"></wa-icon>
					{gettingMore ? 'Thinking up more…' : 'More ideas'}
				</wa-button>
				{#if moreProblem}<SuggestionProblem problem={moreProblem} {debug} />{/if}
			</section>
		{:else}
			{#if starters.length === 0}
				<p class="hint none">No daydreams match “{filter.trim()}”.</p>
			{/if}
			<ul class="cards">
				{#each startersShown as starter (starter.id)}
					{const idea = $derived(starterIdea(starter).idea)}
					{const level = $derived(ideaLevel(idea.dials))}
					<li>
						<!-- A card: a title, a line and a level in a block, which
						     wa-button's one-line control cannot lay out. -->
						<button type="button" class="card" onclick={() => onstarter(starter)}>
							<span class="title">{idea.title}</span>
							<span class="premise">{idea.premise}</span>
							<span class="tags">
								{#each starter.tags as tag (tag)}<span class="tag">{tag}</span>{/each}
							</span>
							<span class="meta">
								{#if level}<span class="level">{level}</span>{/if}
								<span>{voiceLabel(starter.voice)}</span>
								{#if starter.you && side === null}<span>You’re the {starter.you}</span>{/if}
							</span>
						</button>
					</li>
				{/each}
			</ul>
			{#if startersShown.length < starters.length}
				<wa-button
					class="more"
					appearance="outlined"
					size="s"
					onclick={() => {
						allStarters = true;
					}}
				>
					<wa-icon slot="start" name="plus" variant="solid"></wa-icon>
					More ideas
				</wa-button>
			{/if}
		{/if}
	</section>

	<section class="blank" aria-labelledby="blank-heading">
		<h2 id="blank-heading">Build your own</h2>
		<span class="hint">Rather choose every part yourself? Start from an empty form.</span>
		<wa-button appearance="outlined" onclick={onblank}>
			<wa-icon slot="start" name="pen-ruler" variant="solid"></wa-icon>
			Build it yourself
		</wa-button>
	</section>
</div>

<style>
	.starter {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;

		h2 {
			margin: 0;
			font-size: 1.25rem;
		}
	}

	/* "You as" at the start, the buttons at the end, wrapping onto two rows
	   where there is no room for both. */
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem 1rem;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-inline-start: auto;
	}

	.brief {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	textarea {
		inline-size: 100%;
		box-sizing: border-box;
		padding: 0.6rem 0.75rem;
		border-radius: 0.6rem;
		border: 1px solid var(--wa-color-surface-border);
		background: var(--wa-color-surface-lowered);
		color: inherit;
		font: inherit;
		font-size: 1.125rem;
		resize: vertical;
	}

	.generated {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;

		h3 {
			margin: 0;
			font-size: 1rem;
			color: var(--wa-color-text-quiet);
			overflow-wrap: anywhere;
		}

		p {
			margin: 0;
		}
	}

	/* After the suggested daydreams or the ready-made ones, a little apart from them. */
	.more {
		align-self: flex-start;
		margin-block-start: 0.5rem;
	}

	.generated-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.5rem;
	}

	.ready-made-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		min-block-size: var(--wa-form-control-height);
	}

	/* Room for the search to open into: the rest of the row from the heading.
	   From a width of nothing rather than its own, since the native input
	   inside wants about twenty characters, and as the row's minimum that
	   widened the whole page past a phone's screen. */
	.search {
		flex: 1 1 0;
		min-inline-size: 0;
		max-inline-size: 24rem;
		display: flex;
	}

	.none {
		margin: 0;
	}

	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(14rem, 100%), 1fr));
		gap: 0.5rem;

		li {
			/* Web Awesome's native styles indent every `li` by 1.125em. */
			margin: 0;
			display: flex;
		}
	}

	/* Web Awesome's native styles make every <button> a one-line control of
	   the form height, which a card is not. */
	.card {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: flex-start;
		gap: 0.25rem;
		block-size: auto;
		min-inline-size: 0;
		margin: 0;
		white-space: normal;
		overflow-wrap: anywhere;
		font-size: 1rem;
		font-weight: inherit;
		padding: 0.75rem 1rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-default);
		color: inherit;
		font-family: inherit;
		text-align: start;
		cursor: pointer;

		&:hover:not(:disabled) {
			background: var(--wa-color-surface-raised);
		}

		&:disabled {
			cursor: progress;
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}

		.title {
			font-weight: 600;
		}

		.premise {
			font-size: 0.875rem;
			color: var(--wa-color-text-quiet);
		}

		.tags {
			display: flex;
			flex-wrap: wrap;
			gap: 0.25rem;
			padding-block-start: 0.25rem;
		}

		.tag {
			padding: 0.05rem 0.5rem;
			border-radius: 999px;
			background: var(--wa-color-brand-fill-quiet);
			color: var(--wa-color-brand-on-quiet);
			font-size: 0.75rem;
		}

		.meta {
			display: flex;
			flex-wrap: wrap;
			gap: 0.25rem 0.75rem;
			margin-block-start: auto;
			padding-block-start: 0.25rem;
			font-size: 0.75rem;
			color: var(--wa-color-text-quiet);
		}

		.level {
			color: var(--wa-color-text-normal);
			font-weight: 600;
		}
	}

	.blank > wa-button {
		align-self: flex-start;
	}

	.hint {
		font-size: 0.875rem;
		color: var(--wa-color-text-quiet);
	}
</style>
