<script lang="ts">
	import type { WaSelectEvent } from '@awesome.me/webawesome/dist/events/select.js';
	import { explicitOoc } from '$lib/daydream/ooc';
	import { plainPassage } from '$lib/daydream/passage-format';
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import { type Reading, readingSchema } from '$lib/sealed-kinds/daydreams';
	import { PENDING_TEXT, UNREADABLE_TEXT } from '$lib/sealed-views.svelte';
	import type { DaydreamTreeNodeView } from '$lib/types';
	import DaydreamSiblings from './DaydreamSiblings.svelte';

	/**
	 * Something the user did: words they wrote, as a bubble; a button they
	 * pressed, a roll or a safety signal, as a small marker, so the story
	 * shows what steered it without each press reading like a message.
	 *
	 * Words are drawn as the story read them. Ones read as a direction ("Make
	 * the story super steamy") are a direction marker, as if the button had
	 * been pressed. Ones that were an instruction for the user's turn ("Tell
	 * Charlie the fox is safe") show as the turn the model wrote out from them,
	 * since that is what the story answered, with a button to see what was
	 * actually sent. Either way, Read it differently forks the story from here
	 * with the reading the user meant (`DaydreamStory.reread`).
	 */
	let {
		story,
		node,
		readAs,
		expansion,
		chosen
	}: {
		story: DaydreamStory;
		node: DaydreamTreeNodeView;
		/** How the passage after this turn (or the one arriving) read it, when that is known. */
		readAs: Reading | null;
		/** This turn written out by the passage after it (or the one arriving), if it was. */
		expansion: string | null;
		/** Whether `readAs` is the user's own choice rather than the model's reading. */
		chosen: boolean;
	} = $props();

	const content = $derived(story.content(node.id));

	/** Showing what the user sent rather than what it was written out to. */
	let showSent = $state(false);

	/** Shown only where the reading is worth saying: anything but the plain "something you do". */
	const READ_AS_WORDS: Partial<Record<Reading, string>> = {
		cowrite: 'taken as part of the story',
		ooc: 'taken as out of character'
	};

	/** The same, once the user has said how they meant it: every reading is then worth saying. */
	const CHOSEN_WORDS: Record<Reading, string> = {
		action: 'read as something you do, as you asked',
		instruction: 'written out for you, as you asked',
		direction: 'read as a direction, as you asked',
		cowrite: 'read as part of the story, as you asked',
		ooc: 'read as out of character, as you asked'
	};

	/** Read it differently's choices, as the menu words them. */
	const READING_CHOICES: Record<Reading, string> = {
		action: 'Something I say or do',
		instruction: 'Write my turn out for me',
		direction: 'A direction for the story',
		cowrite: 'Part of the story',
		ooc: 'Out of character'
	};

	const asDirection = $derived(readAs === 'direction' && !expansion);

	const label = $derived.by(() => {
		if (content?.type !== 'text') {
			return null;
		}
		if (expansion) {
			if (showSent) {
				return 'what you sent';
			}
			return chosen ? CHOSEN_WORDS.instruction : 'written out for you';
		}
		if (chosen && readAs) {
			return CHOSEN_WORDS[readAs];
		}
		if (explicitOoc(content.text)) {
			return 'out of character';
		}
		// A direction says so by being drawn as one.
		return readAs ? (READ_AS_WORDS[readAs] ?? null) : null;
	});

	/**
	 * Every reading but the one it has. Writing a turn out needs the user to
	 * be in the story, so a watcher is not offered it.
	 */
	const choices = $derived(
		readingSchema.options.filter(
			(reading) =>
				reading !== (readAs ?? 'action') &&
				!(reading === 'instruction' && story.setup?.voice.stance === 'absent')
		)
	);

	function onReread(event: WaSelectEvent) {
		// The property, not the attribute: a value Svelte sets on an upgraded
		// element is a property, which Lit does not reflect (AGENTS.md).
		const chosenReading = readingSchema.safeParse(
			(event.detail.item as HTMLElement & { value?: string }).value
		);
		if (chosenReading.success) {
			showSent = false;
			void story.reread(node.id, chosenReading.data);
		}
	}

	const STEER_WORDS = { more: 'More of this', rewrite: 'Rewrite', 'not-this': 'Not this' } as const;

	const SAFETY_WORDS = {
		red: 'You stopped the scene',
		yellow: 'You asked to ease off',
		resume: 'You carried on'
	} as const;
</script>

{#snippet rereadMenu()}
	{#if story.available}
		<!-- A fork rather than a correction: the passage already written stays
		     beside the new one, reached with the switcher. -->
		<wa-dropdown class="reread" placement="bottom-end" onwa-select={onReread}>
			<wa-button slot="trigger" size="s" appearance="plain" pill>
				<wa-icon name="ellipsis-vertical" variant="solid" label="Read it differently"></wa-icon>
			</wa-button>
			<!-- Web Awesome styles a heading in a dropdown as the label over its items. -->
			<h3>Interpret as…</h3>
			{#each choices as reading (reading)}
				<wa-dropdown-item value={reading}>{READING_CHOICES[reading]}</wa-dropdown-item>
			{/each}
		</wa-dropdown>
	{/if}
{/snippet}

{#if content === undefined || content === null}
	<li class="said">
		<p class="text">{content === undefined ? PENDING_TEXT : UNREADABLE_TEXT}</p>
	</li>
{:else if content.type === 'text' && asDirection}
	<li class="marker" data-turn-id={node.id}>
		<wa-icon name="arrow-right" variant="solid"></wa-icon>
		<span class="direction">{content.text}</span>
		{#if label}<span class="label">{label}</span>{/if}
		{@render rereadMenu()}
		<DaydreamSiblings {story} turnId={node.id} />
	</li>
{:else if content.type === 'text'}
	<li class="said" data-turn-id={node.id}>
		{#if expansion && !showSent}
			<!-- Written by the model, so without any markup it slipped in. -->
			<p class="text">{plainPassage(expansion)}</p>
		{:else}
			<!-- What was sent, set apart as a note when it is not what the story answered. -->
			<p class="text" class:note={expansion !== null}>{content.text}</p>
		{/if}
		<div class="under">
			{#if label}<span class="label">{label}</span>{/if}
			{#if expansion}
				<wa-button class="switch" size="s" appearance="plain" onclick={() => {
					showSent = !showSent;
				}}>
					{showSent ? 'Show it written out' : 'Show what you sent'}
				</wa-button>
			{/if}
			{@render rereadMenu()}
			<DaydreamSiblings {story} turnId={node.id} />
		</div>
	</li>
{:else}
	<li class="marker" class:safety={content.type === 'safety'} data-turn-id={node.id}>
		{#if content.type === 'direction'}
			<wa-icon name="arrow-right" variant="solid"></wa-icon> {content.label}
		{:else if content.type === 'steer'}
			<wa-icon name="arrow-right" variant="solid"></wa-icon>
			{STEER_WORDS[content.action]}:
			<q>{plainPassage(content.quote.text)}</q>
		{:else if content.type === 'roll'}
			<wa-icon name="dice" variant="solid"></wa-icon> Rolled {content.result} — {content.outcome}
		{:else if content.type === 'safety'}
			{SAFETY_WORDS[content.signal]}
		{/if}
		<DaydreamSiblings {story} turnId={node.id} />
	</li>
{/if}

<style>
	.said {
		align-self: flex-end;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;
		max-inline-size: 85%;

		.text {
			margin: 0;
			padding: 0.625rem 0.875rem;
			border-radius: 1rem;
			border-end-end-radius: 0.25rem;
			background: var(--wa-color-brand-fill-quiet);
			white-space: pre-wrap;
			overflow-wrap: anywhere;

			&.note {
				font-style: italic;
				background: none;
				border: 1px dashed var(--wa-color-brand-border-quiet);
			}
		}

		.switch {
			--wa-form-control-height: 1.75rem;
			--wa-form-control-padding-inline: 0.5rem;

			font-size: 0.75rem;
		}

		.under {
			display: flex;
			align-items: center;
			gap: 0.5rem;
		}

		.label {
			font-size: 0.75rem;
			font-style: italic;
			color: var(--wa-color-text-quiet);
		}
	}

	.reread wa-button {
		--wa-form-control-height: 1.75rem;
	}

	.marker {
		align-self: flex-end;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.375rem;
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);

		.direction {
			overflow-wrap: anywhere;
		}

		.label {
			font-size: 0.75rem;
			font-style: italic;
		}

		q {
			font-style: italic;
			overflow-wrap: anywhere;
		}

		&.safety {
			align-self: center;
		}
	}
</style>
