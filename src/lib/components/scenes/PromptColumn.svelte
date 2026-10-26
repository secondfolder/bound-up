<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SceneSection } from '$lib/scenes/blocks';
	import {
		type Consideration,
		insertText,
		type Mentioned,
		PROMPT_TYPE_LABELS,
		type PromptOutcome,
		type PromptType,
		visibleConsiderations
	} from '$lib/scenes/considerations';
	import { levelFor, type ScenePreferences, withLevel, withNeverShow } from '$lib/scenes/preferences';
	import ConsiderationCard from './ConsiderationCard.svelte';
	import PromptSection from './PromptSection.svelte';

	/**
	 * The scene designer's column: prompts beside the page, one section per
	 * type, each with its own Fewer and More. Nothing here is required, and
	 * nothing is ever counted as missing. See docs/scenes.md, "The prompt
	 * column".
	 *
	 * The sections whose content comes from elsewhere (what you're into,
	 * blocks, story ideas) are snippets, so this stays about layout and the
	 * two catalogue-driven types.
	 */
	let {
		preferences,
		onPreferences,
		mentioned,
		outcomes,
		readOnly,
		onAdd,
		onOutcome,
		kinks,
		blocks,
		story
	}: {
		preferences: ScenePreferences;
		onPreferences: (next: ScenePreferences) => void;
		mentioned: Mentioned;
		/** This scene's prompt outcomes, by prompt id. */
		outcomes: ReadonlyMap<string, PromptOutcome>;
		readOnly: boolean;
		/** Puts `text` on the page, in the section of its kind. */
		onAdd: (section: SceneSection, text: string) => void;
		/** Null clears an outcome, bringing the prompt back. */
		onOutcome: (promptId: string, outcome: PromptOutcome | null) => void;
		kinks?: Snippet<[number]>;
		blocks?: Snippet<[number]>;
		story?: Snippet<[number]>;
	} = $props();

	const neverShow = $derived(new Set(preferences.neverShow));

	function visible(type: 'think' | 'ask'): Consideration[] {
		return visibleConsiderations(type, {
			level: levelFor(preferences, type),
			mentioned,
			outcomes,
			neverShow
		});
	}

	const think = $derived(visible('think'));
	const ask = $derived(visible('ask'));

	/** What was set aside in this scene, which the foot of the column can bring back. */
	const setAside = $derived([...outcomes].filter(([, outcome]) => outcome !== 'added').length);

	function add(entry: Consideration, answer?: string) {
		onAdd(entry.insert.section, insertText(entry, answer));
		onOutcome(entry.id, 'added');
	}

	function setLevel(type: PromptType, next: number) {
		onPreferences(withLevel(preferences, type, next));
	}

	function bringBack() {
		for (const [id, outcome] of outcomes) {
			if (outcome !== 'added') {
				onOutcome(id, null);
			}
		}
	}
</script>

{#snippet cards(entries: Consideration[], empty: string)}
	{#if entries.length === 0}
		<p class="quiet">{empty}</p>
	{:else}
		{#each entries as entry (entry.id)}
			<ConsiderationCard
				consideration={entry}
				disabled={readOnly}
				onAdd={(answer) => add(entry, answer)}
				onHandled={() => onOutcome(entry.id, 'handled')}
				onDismiss={() => onOutcome(entry.id, 'dismissed')}
				onNeverShow={() => onPreferences(withNeverShow(preferences, entry.id))}
			/>
		{/each}
	{/if}
{/snippet}

{#snippet section(type: PromptType, content: Snippet<[number]>)}
	<PromptSection
		label={PROMPT_TYPE_LABELS[type]}
		level={levelFor(preferences, type)}
		onLevel={(next) => setLevel(type, next)}
	>
		{@render content(levelFor(preferences, type))}
	</PromptSection>
{/snippet}

{#snippet thinkCards(_level: number)}
	{@render cards(think, 'Nothing more for now. More shows extra ideas.')}
{/snippet}

{#snippet askCards(_level: number)}
	{@render cards(ask, 'No questions for now. More asks a few extra.')}
{/snippet}

<div class="prompt-column">
	{#if blocks}{@render section('blocks', blocks)}{/if}
	{@render section('think', thinkCards)}
	{@render section('ask', askCards)}
	{#if kinks}{@render section('kinks', kinks)}{/if}
	{#if story}{@render section('story', story)}{/if}

	{#if setAside > 0}
		<wa-button size="s" appearance="plain" onclick={bringBack}>
			Bring back the {setAside === 1 ? 'prompt' : `${setAside} prompts`} set aside here
		</wa-button>
	{/if}
</div>

<style>
	.prompt-column {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-l);
	}

	.quiet {
		margin: 0;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}
</style>
