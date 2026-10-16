<script lang="ts">
	import { explicitOoc } from '$lib/daydream/ooc';
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import type { PassageMeta } from '$lib/sealed-kinds/daydreams';
	import { PENDING_TEXT, UNREADABLE_TEXT } from '$lib/sealed-views.svelte';
	import type { DaydreamTreeNodeView } from '$lib/types';
	import DaydreamSiblings from './DaydreamSiblings.svelte';

	/**
	 * Something the user did: words they wrote, as a bubble; a button they
	 * pressed, a roll or a safety signal, as a small marker, so the story
	 * shows what steered it without each press reading like a message.
	 */
	let {
		story,
		node,
		readAs
	}: {
		story: DaydreamStory;
		node: DaydreamTreeNodeView;
		/** How the passage after this turn says it read it, when that is known. */
		readAs: PassageMeta['readAs'] | null;
	} = $props();

	const content = $derived(story.content(node.id));

	/** Shown only where the reading is worth saying: anything but the plain "something you do". */
	const READ_AS_WORDS: Partial<Record<NonNullable<PassageMeta['readAs']>, string>> = {
		direction: 'taken as a direction',
		cowrite: 'taken as part of the story',
		ooc: 'taken as out of character'
	};

	const label = $derived.by(() => {
		if (content?.type !== 'text') {
			return null;
		}
		if (explicitOoc(content.text)) {
			return 'out of character';
		}
		return readAs ? (READ_AS_WORDS[readAs] ?? null) : null;
	});

	const STEER_WORDS = { more: 'More of this', rewrite: 'Rewrite', 'not-this': 'Not this' } as const;

	const SAFETY_WORDS = {
		red: 'You stopped the scene',
		yellow: 'You asked to ease off',
		resume: 'You carried on'
	} as const;
</script>

{#if content === undefined || content === null}
	<li class="said">
		<p class="text">{content === undefined ? PENDING_TEXT : UNREADABLE_TEXT}</p>
	</li>
{:else if content.type === 'text'}
	<li class="said" data-turn-id={node.id}>
		<p class="text">{content.text}</p>
		<div class="under">
			{#if label}<span class="label">{label}</span>{/if}
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
			<q>{content.quote.text}</q>
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

	.marker {
		align-self: flex-end;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.375rem;
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);

		q {
			font-style: italic;
			overflow-wrap: anywhere;
		}

		&.safety {
			align-self: center;
		}
	}
</style>
