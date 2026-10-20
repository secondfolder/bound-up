<script lang="ts">
	import { DAYDREAM_LIMITS, DAYDREAM_VOICE_PRESETS } from '$lib/daydream';
	import { sceneLevel } from '$lib/daydream/dial-words';
	import {
		type DaydreamStarter,
		forSide,
		inOrder,
		matchesSearch,
		SHOWN_STARTERS,
		type StarterSide,
		starterScene,
		startersFor
	} from '$lib/daydream/starters';
	import type { GeneratedIdea } from '$lib/daydream/suggestions';
	import DaydreamSidePicker from './DaydreamSidePicker.svelte';
	import SearchField from './SearchField.svelte';

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
		idea = $bindable(),
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
		onblank
	}: {
		/** What the user has written, kept by the page so it survives going back. */
		idea: string;
		/** Which side the stories are for, or null for either. Kept by the page. */
		side: StarterSide | null;
		/** Whether the model may be asked: without it there is no "describe it". */
		suggestionsOn: boolean;
		/** The ready-made stories' ids in the order to show them, shuffled by the page's load. */
		starterOrder: readonly string[];
		asking: boolean;
		/** Why the last description came back with nothing, or null. */
		problem: string | null;
		/** The last ideas generated and what was asked for, kept by the page; null before any. */
		generated: { request: string; ideas: readonly GeneratedIdea[] } | null;
		/** The title of the generated idea being written out, while it is. */
		writing: string | null;
		/** Why a generated idea could not be written out, or null. */
		ideaProblem: string | null;
		ondescribe: () => void;
		onstarter: (starter: DaydreamStarter) => void;
		/** Asks for stories like the one described; answers why none came, or null. */
		ongenerate: (request: string) => Promise<string | null>;
		/** Asks for more of the same, added to the last; answers why none came, or null. */
		onmore: () => Promise<string | null>;
		/** Puts the generated ideas away, back to the ready-made stories. */
		onclear: () => void;
		onidea: (idea: GeneratedIdea) => void;
		onblank: () => void;
	} = $props();

	let suggesting = $state(false);
	let suggestProblem: string | null = $state(null);
	let gettingMore = $state(false);
	let moreProblem: string | null = $state(null);

	async function suggest() {
		suggesting = true;
		suggestProblem = null;
		suggestProblem = await ongenerate(idea.trim());
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
			matchesSearch({ ...starterScene(starter).scene, tags: starter.tags }, filter)
		)
	);
	/**
	 * The ready-made stories show `SHOWN_STARTERS` until "More ideas" shows
	 * the lot. A search looks through all of them, so what it finds is never
	 * hidden behind the button.
	 */
	let allStarters = $state(false);
	const searching = $derived(filter.trim() !== '');
	const startersShown = $derived(
		allStarters || searching ? starters : starters.slice(0, SHOWN_STARTERS)
	);
	const ideasForSide = $derived(generated ? forSide(generated.ideas, side) : []);
	const ideasShown = $derived(ideasForSide.filter((shown) => matchesSearch(shown, filter)));

	const busy = $derived(asking || suggesting || gettingMore);
	const canAsk = $derived(idea.trim() !== '' && !busy);

	const voiceLabel = (starter: DaydreamStarter) =>
		DAYDREAM_VOICE_PRESETS.find((preset) => preset.id === starter.voice)?.label ?? '';
</script>

<div class="starter">
	{#if suggestionsOn}
		<section class="describe" aria-labelledby="describe-heading">
			<h2 id="describe-heading">What do you feel like?</h2>
			<label class="idea">
				<span class="hint">A few words is enough: who, where, or what happens.</span>
				<textarea
					rows="3"
					maxlength={DAYDREAM_LIMITS.idea}
					placeholder="A stranger on a night train…"
					bind:value={idea}
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
						{asking ? 'Writing your daydream…' : 'Write this story'}
					</wa-button>
					<wa-button appearance="outlined" disabled={!canAsk} onclick={suggest}>
						<wa-icon slot="start" name="lightbulb" variant="solid"></wa-icon>
						{suggesting ? 'Thinking up stories…' : 'Suggest stories for this'}
					</wa-button>
				</div>
			</div>
			{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}
			{#if suggestProblem}<p class="invalid" role="alert">{suggestProblem}</p>{/if}
		</section>
	{/if}

	<section class="ready-made" aria-labelledby="ready-made-heading">
		<div class="ready-made-head">
			<h2 id="ready-made-heading">Story suggestions</h2>
			<div class="search">
				<SearchField
					bind:value={filter}
					label="Search stories"
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
					<h3 id="generated-heading">For “{generated.request}”</h3>
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
				{#if ideasForSide.length === 0}
					<p class="hint">None of these have you as the {side}. Ask for more that do.</p>
				{:else if ideasShown.length === 0}
					<p class="hint">None of these match “{filter.trim()}”.</p>
				{/if}
				<ul class="cards">
					{#each ideasShown as idea (idea.title)}
						{const level = $derived(sceneLevel(idea.dials))}
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
								     every card shown is for, so cards say it only under "Either". -->
								<span class="meta">
									{#if writing === idea.title}
										<span class="level">Writing your daydream…</span>
									{:else if level}<span class="level">{level}</span>{/if}
									{#if idea.you && side === null}<span>You’re the {idea.you}</span>{/if}
								</span>
							</button>
						</li>
					{/each}
				</ul>
				{#if ideaProblem}<p class="invalid" role="alert">{ideaProblem}</p>{/if}
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
				{#if moreProblem}<p class="invalid" role="alert">{moreProblem}</p>{/if}
			</section>
		{:else}
			{#if starters.length === 0}
				<p class="hint none">No stories match “{filter.trim()}”.</p>
			{/if}
			<ul class="cards">
				{#each startersShown as starter (starter.id)}
					{const scene = $derived(starterScene(starter).scene)}
					{const level = $derived(sceneLevel(scene.dials))}
					<li>
						<!-- A card: a title, a line and a level in a block, which
						     wa-button's one-line control cannot lay out. -->
						<button type="button" class="card" onclick={() => onstarter(starter)}>
							<span class="title">{scene.title}</span>
							<span class="premise">{scene.premise}</span>
							<span class="tags">
								{#each starter.tags as tag (tag)}<span class="tag">{tag}</span>{/each}
							</span>
							<span class="meta">
								{#if level}<span class="level">{level}</span>{/if}
								<span>{voiceLabel(starter)}</span>
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

	.idea {
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

	/* After the suggested stories or the ready-made ones, a little apart from them. */
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

	.invalid {
		margin: 0;
		color: var(--wa-color-text-danger);
	}
</style>
