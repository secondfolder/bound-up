<script lang="ts">
	import { parseBuild } from '$lib/dream/build';
	import { parseMarkup, plainText } from '$lib/dream/markup';
	import { parseBriefReading } from '$lib/dream/reading';
	import type { DreamSession } from '$lib/dream-browser/session.svelte';
	import { MAX_AMENDMENT_CHARS } from '$lib/sealed-kinds/dreams';
	import DreamMarkup from './DreamMarkup.svelte';
	import DreamTextBox from './DreamTextBox.svelte';

	/**
	 * Setting a daydream up, live (docs/dreams.md, "The setup page"): each
	 * step with a line of what the model is writing, results in their places
	 * as they arrive, every idea a tap away, and a box to change it while it
	 * works. Nothing waits behind a spinner.
	 */
	let { session }: { session: DreamSession } = $props();

	const setup = $derived(session.setup);
	const streaming = $derived(session.streaming);
	/** The reading, as it streams or as kept. */
	const reading = $derived(
		streaming?.what === 'read' ? parseBriefReading(streaming.text) : (setup?.reading ?? null)
	);
	const build = $derived(
		streaming?.what === 'build' ? parseBuild(streaming.text, { final: false }) : null
	);
	const chosen = $derived(
		setup?.reading?.directions.find((direction) => direction.id === setup.chosen?.directionId) ?? null
	);
	const step = $derived(session.step);

	/** The latest of what the model is writing, cleaned of tags: so you can watch it think. */
	const liveLine = $derived.by(() => {
		if (!streaming) {
			return '';
		}
		const words = plainText(parseMarkup(streaming.text, { final: false }))
			.replaceAll(/\s+/g, ' ')
			.trim();
		return words.length > 140 ? `…${words.slice(-140)}` : words;
	});

	type Status = 'done' | 'active' | 'waiting';
	function status(done: boolean, started: boolean): Status {
		if (done) {
			return 'done';
		}
		return started ? 'active' : 'waiting';
	}
	const steps = $derived.by((): { label: string; status: Status }[] => {
		const readDone = Boolean(setup?.reading) && streaming?.what !== 'read';
		const picked = Boolean(setup?.chosen);
		const built = Boolean(setup?.build) && streaming?.what !== 'build';
		return [
			{ label: 'Reading what you asked for', status: readDone ? 'done' : 'active' },
			{
				label: step === 'pick' ? 'Choose an idea' : 'Thinking of directions',
				status: status(picked, readDone)
			},
			{
				label: 'Building it and writing the opening',
				status: status(built, picked)
			}
		];
	});

	let showIdeas = $state(false);
</script>

<div class="setup">
	<p class="brief">“{setup?.brief}”</p>
	{#each setup?.amendments ?? [] as amendment, index (index)}
		<p class="amendment">Then: “{amendment}”</p>
	{/each}

	<ol class="steps">
		{#each steps as entry (entry.label)}
			<li data-status={entry.status}>
				<span class="mark" aria-hidden="true">
					{#if entry.status === 'done'}
						<wa-icon name="check"></wa-icon>
					{:else if entry.status === 'active' && streaming}
						<wa-spinner></wa-spinner>
					{:else}
						<wa-icon name="circle" variant="regular"></wa-icon>
					{/if}
				</span>
				<span>{entry.label}</span>
			</li>
		{/each}
	</ol>

	{#if liveLine}
		<p class="live" aria-live="off">{liveLine}</p>
	{/if}

	{#if reading && reading.musts.length > 0}
		<fieldset class="chips musts">
			<legend>What it must have</legend>
			{#each reading.musts as must (must)}
				<wa-badge variant="neutral" appearance="outlined">{must}</wa-badge>
			{/each}
		</fieldset>
	{/if}

	{#if step === 'ask' && setup?.reading?.ask}
		{const question = $derived(setup.reading.ask)}
		<section class="question" aria-labelledby="question">
			<h2 id="question">{question.text}</h2>
			<div class="options">
				{#each question.options as option (option)}
					<wa-button appearance="outlined" onclick={() => session.answer(option)}>{option}</wa-button>
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
					await session.answer(text);
					return session.problem === null;
				}}
			/>
		</section>
	{/if}

	{#if setup?.reading && setup.reading.directions.length > 0}
		<section class="ideas">
			{#if chosen}
				<p>
					Picked: <strong>{chosen.text}</strong>
					{#if setup.reading.directions.length > 1}
						·
						<!-- A disclosure: native, since wa-button forwards no aria-expanded. -->
						<button type="button" class="link" aria-expanded={showIdeas} onclick={() => {
								showIdeas = !showIdeas;
							}}>
							See all {setup.reading.directions.length} ideas
						</button>
					{/if}
				</p>
			{/if}
			{#if !chosen || showIdeas}
				<ul class="directions">
					{#each setup.reading.directions as direction (direction.id)}
						<li class:current={direction.id === chosen?.id}>
							<span>{direction.text}</span>
							{#if direction.id !== chosen?.id}
								<wa-button size="s" appearance="outlined" onclick={() => session.choose(direction.id)}>
									Use this one
								</wa-button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	{#if build}
		<section class="build">
			{#if build.title}<h2>{build.title}</h2>{/if}
			{#if build.telling}<p class="telling">{build.telling}</p>{/if}
			{#if build.elements.length > 0}
				<div class="chips">
					{#each build.elements as element (element.id)}
						<wa-badge variant="brand" appearance="outlined">{element.name}</wa-badge>
					{/each}
				</div>
			{/if}
			{#if build.passage}
				<div class="opening">
					<DreamMarkup
						source={build.passage}
						turnId={null}
						names={[]}
						expansions={new Map()}
						filling={new Set()}
						streaming
						onref={() => undefined}
						onmore={() => undefined}
					/>
				</div>
			{/if}
		</section>
	{/if}

	{#if session.problem}
		<wa-callout variant="danger">
			<p>{session.problem}</p>
			<wa-button size="s" appearance="outlined" onclick={() => session.runSetup()}>Try again</wa-button>
		</wa-callout>
	{/if}

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
		margin: 0;
		font-size: var(--wa-font-size-l);
	}

	.amendment {
		margin: 0;
		color: var(--wa-color-text-quiet);
	}

	.steps {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);

		li {
			display: flex;
			align-items: center;
			gap: var(--wa-space-s);
		}

		li[data-status='waiting'] {
			color: var(--wa-color-text-quiet);
		}

		.mark {
			display: inline-grid;
			place-items: center;
			width: 1.25rem;
		}
	}

	.live {
		margin: 0;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
		font-style: italic;
	}

	.musts {
		margin: 0;
		padding: 0;
		border: 0;

		legend {
			padding: 0;
			margin-bottom: var(--wa-space-2xs);
			font-size: var(--wa-font-size-s);
			color: var(--wa-color-text-quiet);
		}
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-2xs);
	}

	.question {
		display: flex;
		flex-direction: column;
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

	.ideas p {
		margin: 0;
	}

	.link {
		all: unset;
		cursor: pointer;
		text-decoration: underline;

		&:focus-visible {
			outline: var(--wa-focus-ring);
		}
	}

	.directions {
		margin: var(--wa-space-s) 0 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);

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
			border-color: var(--wa-color-brand-on-quiet);
		}
	}

	.build {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);

		h2 {
			margin: 0;
		}
	}

	.telling {
		margin: 0;
		color: var(--wa-color-text-quiet);
		white-space: pre-line;
	}

	.opening {
		padding: var(--wa-space-m);
		border-radius: var(--wa-border-radius-m);
		background: var(--wa-color-surface-raised);
	}

	.change {
		position: sticky;
		bottom: 0;
		padding-block: var(--wa-space-s);
		background: var(--wa-color-surface-default);
	}
</style>
