<script lang="ts">
	import { DAYDREAM_LIMITS, DAYDREAM_VOICE_PRESETS } from '$lib/daydream';
	import { hasChip, toggleChip } from '$lib/daydream/chips';
	import { sceneLevel } from '$lib/daydream/dial-words';
	import {
		type DaydreamStarter,
		pickIdeas,
		SHOWN_IDEA_CHIPS,
		type StarterSide,
		starterScene,
		startersFor
	} from '$lib/daydream/starters';

	/**
	 * The ways into a new daydream, friendliest first: describe it in a
	 * sentence and have the model put it together, pick a ready-made one, or
	 * build it from scratch. The first two land on the setup form's sentence,
	 * where every part of it can still be changed. See docs/daydreams.md,
	 * "Starting one".
	 *
	 * Presentational: the page owns the request, so "Try another" on the
	 * setup can ask again with the same words.
	 */
	let {
		idea = $bindable(),
		ideas = $bindable(),
		side = $bindable(),
		suggestionsOn,
		asking,
		problem,
		ondescribe,
		onstarter,
		onblank
	}: {
		/** What the user has written, kept by the page so it survives going back. */
		idea: string;
		/**
		 * The few ideas on offer (`pickIdeas`): first drawn by the page's load,
		 * then by the shuffle. Kept by the page, so going back shows the same ones.
		 */
		ideas: string[];
		/** Which side the ready-made stories are shown for, or null for either. Kept by the page. */
		side: StarterSide | null;
		/** Whether the model may be asked: without it there is no "describe it". */
		suggestionsOn: boolean;
		asking: boolean;
		/** Why the last description came back with nothing, or null. */
		problem: string | null;
		ondescribe: () => void;
		onstarter: (starter: DaydreamStarter) => void;
		onblank: () => void;
	} = $props();

	const SIDES: readonly { value: StarterSide | null; label: string }[] = [
		{ value: null, label: 'Either' },
		{ value: 'dom', label: 'Dom' },
		{ value: 'sub', label: 'Sub' }
	];

	const starters = $derived(startersFor(side));

	const canAsk = $derived(idea.trim() !== '' && !asking);

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
					disabled={asking}></textarea>
			</label>
			<fieldset class="chips">
				<legend class="hint">Or start from one of these</legend>
				{#each ideas as chip (chip)}
					<!-- A toggle: a native button with aria-pressed, which wa-button would not forward (AGENTS.md). -->
					<button
						type="button"
						class="chip"
						aria-pressed={hasChip(idea, chip)}
						disabled={asking}
						onclick={() => {
							idea = toggleChip(idea, chip);
						}}>{chip}</button>
				{/each}
				<wa-button
					class="shuffle"
					appearance="plain"
					size="s"
					pill
					disabled={asking}
					onclick={() => {
						ideas = pickIdeas(SHOWN_IDEA_CHIPS, Math.random, ideas);
					}}
				>
					<wa-icon name="shuffle" variant="solid" label="Other ideas"></wa-icon>
				</wa-button>
			</fieldset>
			<wa-button
				appearance={canAsk ? 'filled' : 'outlined'}
				variant={canAsk ? 'brand' : 'neutral'}
				disabled={!canAsk}
				onclick={ondescribe}
			>
				<wa-icon slot="start" name="wand-magic-sparkles" variant="solid"></wa-icon>
				{asking ? 'Writing your daydream…' : 'Write it'}
			</wa-button>
			{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}
		</section>
	{/if}

	<section class="ready-made" aria-labelledby="ready-made-heading">
		<div class="ready-made-head">
			<h2 id="ready-made-heading">{suggestionsOn ? 'Or pick one' : 'Pick one'}</h2>
			<fieldset class="sides">
				<legend class="hint">You as</legend>
				{#each SIDES as option (option.label)}
					<label class="side">
						<input
							type="radio"
							name="starter-side"
							checked={side === option.value}
							onchange={() => {
								side = option.value;
							}}
						/>
						{option.label}
					</label>
				{/each}
			</fieldset>
		</div>
		<ul class="cards">
			{#each starters as starter (starter.id)}
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
							{#if starter.you}<span>You’re the {starter.you}</span>{/if}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	</section>

	<p class="blank">
		Rather choose every part yourself?
		<wa-button appearance="plain" size="s" onclick={onblank}>Build it yourself</wa-button>
	</p>
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

	.describe > wa-button {
		align-self: flex-start;
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

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin: 0;
		padding: 0;
		border: 0;

		.shuffle {
			--wa-form-control-height: 1.9rem;
		}

		legend {
			padding: 0;
			margin-block-end: 0.375rem;
		}
	}

	.chip {
		block-size: auto;
		max-inline-size: 100%;
		margin: 0;
		white-space: normal;
		text-align: start;
		font-weight: inherit;
		padding: 0.25rem 0.7rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: 999px;
		background: transparent;
		color: inherit;
		font-family: inherit;
		font-size: 0.875rem;
		cursor: pointer;

		&[aria-pressed='true'] {
			border-color: var(--wa-color-brand-border-loud, var(--wa-color-surface-border));
			background: var(--wa-color-brand-fill-quiet);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}

	.ready-made-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
	}

	/* A segmented control: native radios, since it is one choice of three,
	   visually hidden inside labels that look like the idea chips. */
	.sides {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin: 0;
		padding: 0;
		border: 0;

		legend {
			float: inline-start;
			padding: 0;
			margin-inline-end: 0.25rem;
		}
	}

	.side {
		padding: 0.25rem 0.7rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: 999px;
		font-size: 0.875rem;
		cursor: pointer;

		&:has(input:checked) {
			border-color: var(--wa-color-brand-border-loud, var(--wa-color-surface-border));
			background: var(--wa-color-brand-fill-quiet);
		}

		&:has(input:focus-visible) {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}

		input {
			position: absolute;
			inline-size: 1px;
			block-size: 1px;
			margin: 0;
			opacity: 0;
			pointer-events: none;
		}
	}

	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(14rem, 100%), 1fr));
		gap: 0.5rem;

		li {
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

		&:hover {
			background: var(--wa-color-surface-raised);
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

	.blank {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem;
		color: var(--wa-color-text-quiet);
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
