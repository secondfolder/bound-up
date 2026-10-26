<script lang="ts">
	import type { LexicalEditor } from 'lexical';
	import { hasChip, mergeChips } from '$lib/daydream/chips';
	import { roll } from '$lib/daydream/dice';
	import {
		addStoryStarter,
		addToSection,
		setStoryLine,
		storyValues,
		visibleText
	} from '$lib/lexical/plugins/scene-blocks';
	import type { HelpGate } from '$lib/scenes/help-gate.svelte';
	import { addLine } from '$lib/scenes/page-edits';
	import {
		chipsAt,
		STORY_LINE_LABELS,
		STORY_LINES,
		type StoryLine,
		startersAt
	} from '$lib/scenes/story';
	import { openedDaydreamCharacter } from '$lib/sealed-views.svelte';
	import type { DaydreamLibraryItemView } from '$lib/types';
	import '$lib/components/choice-controls.css';

	/**
	 * Story ideas, for a scene with some roleplay in it: ready-made starting
	 * points, chips for each line of the story (toggled in and out of the
	 * page's Story section, as daydreams' chips toggle in and out of a field),
	 * the characters from the person's daydream library to play, and a die.
	 * See docs/scenes.md, "Story ideas".
	 */
	let {
		editor,
		level,
		readOnly,
		characters,
		gate = null,
		userId = null
	}: {
		editor: LexicalEditor | null;
		level: number;
		readOnly: boolean;
		/** The person's daydream characters, when they have Daydreams; empty otherwise. */
		characters: DaydreamLibraryItemView[];
		/** For "More ideas" from the model, when the server has one. */
		gate?: HelpGate | null;
		userId?: string | null;
	} = $props();

	/** Chips the model suggested, by line, after the curated ones; kept for this visit only. */
	let suggested = $state.raw<Partial<Record<StoryLine, string[]>>>({});

	async function moreIdeas(line: StoryLine) {
		if (!(gate && editor)) {
			return;
		}
		const answer = await gate.ask({ task: 'story-chips', line, page: visibleText(editor, userId) });
		if (answer?.task === 'story-chips') {
			suggested = { ...suggested, [line]: mergeChips(suggested[line] ?? [], answer.chips) };
		}
	}

	let values = $state.raw<Partial<Record<StoryLine, string>>>({});
	$effect(() => {
		const bound = editor;
		if (!bound) {
			return;
		}
		values = storyValues(bound);
		return bound.registerUpdateListener(() => {
			values = storyValues(bound);
		});
	});

	const disabled = $derived(readOnly || !editor);
	const starters = $derived(startersAt(level));
	const playable = $derived(
		characters.flatMap((item) => {
			const opened = openedDaydreamCharacter(item.sealed);
			return opened ? [{ id: item.id, character: opened }] : [];
		})
	);

	function playAs(character: (typeof playable)[number]['character']) {
		if (!editor) {
			return;
		}
		const who = character.archetype ? `${character.name} (${character.archetype})` : character.name;
		setStoryLine(editor, 'parts', who, 'add');
		const notes = character.fields
			.filter((field) => field.kind === 'personality' || field.kind === 'speech')
			.map((field) => field.value.trim())
			.filter((value) => value !== '');
		if (notes.length > 0) {
			addToSection(editor, 'story', `${character.name}: ${notes.join('. ')}`);
		}
	}

	let rolled = $state<number | null>(null);

	function addRoll() {
		if (editor) {
			addLine(editor, 'Roll a die for it: 1–2 …, 3–4 …, 5–6 …');
		}
	}
</script>

<div class="story">
	{#if starters.length > 0}
		<div class="group">
			<h3>Start from</h3>
			<div class="chips">
				{#each starters as starter (starter.id)}
					<button
						type="button"
						class="choice-chip"
						{disabled}
						onclick={() => editor && addStoryStarter(editor, starter.lines)}
					>
						{starter.title}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#each STORY_LINES as line (line)}
		<div class="group">
			<h3>{STORY_LINE_LABELS[line]}</h3>
			<div class="chips">
				{#each mergeChips(chipsAt(level, line), suggested[line] ?? []) as chip (chip)}
					<!-- A toggle, so a native button: wa-button forwards no aria-pressed. -->
					<button
						type="button"
						class="choice-chip"
						{disabled}
						aria-pressed={hasChip(values[line] ?? '', chip)}
						onclick={() => editor && setStoryLine(editor, line, chip)}
					>
						{chip}
					</button>
				{/each}
				{#if gate?.available}
					<wa-button
						size="s"
						appearance="plain"
						disabled={disabled || gate.busy !== null}
						onclick={() => moreIdeas(line)}
					>
						<wa-icon slot="start" name="wand-magic-sparkles"></wa-icon>
						More ideas<span class="wa-visually-hidden">{` for ${STORY_LINE_LABELS[line].toLowerCase()}`}</span>
					</wa-button>
				{/if}
			</div>
		</div>
	{/each}

	{#if playable.length > 0}
		<div class="group">
			<h3>Play as one of your characters</h3>
			<div class="chips">
				{#each playable as { id, character } (id)}
					<button type="button" class="choice-chip" {disabled} onclick={() => playAs(character)}>
						{character.name}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="group">
		<h3>Leave it to chance</h3>
		<div class="dice">
			<wa-button
				size="s"
				appearance="outlined"
				onclick={() => {
					rolled = roll(6);
				}}
			>
				<wa-icon slot="start" name="dice"></wa-icon>
				Roll a die
			</wa-button>
			{#if rolled !== null}<span class="rolled" aria-live="polite">{rolled}</span>{/if}
			<wa-button size="s" appearance="plain" {disabled} onclick={addRoll}>
				Add a roll to the page
			</wa-button>
		</div>
	</div>
</div>

<style>
	.story {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-2xs);
	}

	h3 {
		margin: 0;
		font-size: var(--wa-font-size-s);
		font-weight: var(--wa-font-weight-semibold);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-2xs);
	}

	/* Wrapping, in a column as narrow as a phone's panel over the page. */
	.dice {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--wa-space-s);
	}

	.rolled {
		font-size: var(--wa-font-size-l);
		font-weight: var(--wa-font-weight-semibold);
	}
</style>
