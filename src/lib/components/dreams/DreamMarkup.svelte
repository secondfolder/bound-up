<script lang="ts">
	import { type InlineSegment, inlineSegments, speakerShade } from '$lib/dream/inline';
	import { type MarkupNode, type MarkupTag, parseMarkup } from '$lib/dream/markup';

	/**
	 * A passage's markup as the reader sees it (docs/dreams.md, "The
	 * markup"): speech in its speaker's colour, names linked to their cards,
	 * beats as space, spoilers blurred until tapped, `<more>` expanded on tap.
	 * The footer is never shown. A tag this view does not draw yet shows its
	 * words, so nothing the model wrote is lost.
	 */
	let {
		source,
		turnId,
		names,
		expansions,
		filling,
		streaming = false,
		onref,
		onmore
	}: {
		source: string;
		/** The passage's turn, which keys its `<more>` expansions; null while it streams. */
		turnId: string | null;
		names: { id: string; name: string }[];
		expansions: ReadonlyMap<string, string>;
		/** Keys of expansions being written. */
		filling: ReadonlySet<string>;
		streaming?: boolean;
		onref: (id: string) => void;
		onmore: (key: string, phrase: string) => void;
	} = $props();

	const nodes = $derived(parseMarkup(source, { final: !streaming }));

	/** Each `<more>` keyed by its order in the passage, so its expansion is found again. */
	const moreKeys = $derived.by(() => {
		const keys = new Map<MarkupTag, string>();
		let count = 0;
		const walk = (list: readonly MarkupNode[]) => {
			for (const node of list) {
				if (node.type !== 'tag') {
					continue;
				}
				if (node.name === 'more') {
					keys.set(node, `${turnId ?? 'streaming'}:more:${count}`);
					count += 1;
				}
				walk(node.children);
			}
		};
		walk(nodes);
		return keys;
	});

	let revealed = $state(new Set<MarkupTag>());

	function words(list: readonly MarkupNode[]): string {
		return list.map((node) => (node.type === 'tag' ? words(node.children) : node.text)).join('');
	}

	const TONES = new Set(['whisper', 'loud', 'slow']);
</script>

{#snippet inline(segments: InlineSegment[])}
	{#each segments as segment, index (index)}
		{#if segment.kind === 'em'}
			<em>{segment.text}</em>
		{:else if segment.kind === 'strong'}
			<strong>{segment.text}</strong>
		{:else if segment.kind === 'link'}
			<!-- A native button: a name in running prose, which a wa-button would
			     break out of its line. Keyboard and role come with it. -->
			<button type="button" class="name" onclick={() => onref(segment.id)}>{segment.text}</button>
		{:else}
			{segment.text}
		{/if}
	{/each}
{/snippet}

{#snippet tree(list: readonly MarkupNode[])}
	{#each list as node, index (index)}
		{#if node.type === 'text'}
			{@render inline(inlineSegments(node.text, names))}
		{:else if node.type === 'ref'}
			<button type="button" class="name" onclick={() => onref(node.id)}>{node.text}</button>
		{:else if node.name === 'after'}
			<!-- The footer is notes for the model. -->
		{:else if node.name === 'beat'}
			{#if node.attrs.kind === 'scene'}
				<wa-divider class="scene"></wa-divider>
			{:else}
				<span class="beat" aria-hidden="true"></span>
			{/if}
		{:else if node.name === 'say'}
			<span class="say" data-shade={speakerShade(node.attrs.who ?? '')}>{@render tree(node.children)}</span>
		{:else if node.name === 'hidden'}
			{#if revealed.has(node)}
				<span class="hidden-open">{@render tree(node.children)}</span>
			{:else}
				<!-- A disclosure: a native button, since wa-button forwards no aria-expanded. -->
				<button
					type="button"
					class="spoiler"
					aria-expanded="false"
					onclick={() => {
						revealed = new Set([...revealed, node]);
					}}
				>
					<span class="blur" aria-hidden="true">{words(node.children)}</span>
					<span class="label">{node.attrs.label ?? 'Tap to reveal'}</span>
				</button>
			{/if}
		{:else if node.name === 'more'}
			{const key = $derived(moreKeys.get(node) ?? '')}
			<button
				type="button"
				class="more"
				disabled={streaming || turnId === null}
				onclick={() => onmore(key, words(node.children))}
			>
				{@render tree(node.children)}
			</button>
			{#if expansions.has(key)}
				<span class="expansion">{expansions.get(key)}</span>
			{:else if filling.has(key)}
				<wa-skeleton class="expanding" effect="sheen"></wa-skeleton>
			{/if}
		{:else if TONES.has(node.name)}
			<span class="tone {node.name}">{@render tree(node.children)}</span>
		{:else}
			{@render tree(node.children)}
		{/if}
	{/each}
{/snippet}

<div class="markup" class:streaming>{@render tree(nodes)}</div>

<style>
	.markup {
		white-space: pre-line;
		line-height: 1.65;
		overflow-wrap: anywhere;
	}

	.name {
		all: unset;
		cursor: pointer;
		text-decoration: underline;
		text-decoration-color: var(--wa-color-brand-on-quiet);
		text-underline-offset: 0.2em;

		&:focus-visible {
			outline: var(--wa-focus-ring);
		}
	}

	.say {
		color: var(--speaker, var(--wa-color-text-normal));

		&[data-shade='0'] {
			--speaker: var(--wa-color-brand-on-quiet);
		}
		&[data-shade='1'] {
			--speaker: var(--wa-color-success-on-quiet);
		}
		&[data-shade='2'] {
			--speaker: var(--wa-color-warning-on-quiet);
		}
		&[data-shade='3'] {
			--speaker: var(--wa-color-danger-on-quiet);
		}
		&[data-shade='4'] {
			--speaker: var(--wa-color-neutral-on-quiet);
		}
	}

	.beat {
		display: block;
		height: var(--wa-space-m);
	}

	.scene {
		margin-block: var(--wa-space-l);
	}

	.spoiler {
		all: unset;
		position: relative;
		cursor: pointer;
		border-radius: var(--wa-border-radius-s);
		background: var(--wa-color-surface-lowered);

		.blur {
			filter: blur(0.35em);
			user-select: none;
		}

		.label {
			position: absolute;
			inset: 0;
			display: grid;
			place-items: center;
			font-size: var(--wa-font-size-s);
			color: var(--wa-color-text-quiet);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
		}
	}

	.more {
		all: unset;
		cursor: pointer;
		border-bottom: 1px dashed var(--wa-color-brand-on-quiet);

		&:disabled {
			cursor: default;
			border-bottom-color: transparent;
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
		}
	}

	.expansion {
		color: var(--wa-color-text-quiet);

		&::before {
			content: ' ';
		}
	}

	.expanding {
		display: inline-block;
		width: 8rem;
		vertical-align: middle;
	}

	.tone.whisper {
		font-size: 0.9em;
		color: var(--wa-color-text-quiet);
	}

	.tone.loud {
		font-weight: var(--wa-font-weight-bold);
	}

	.tone.slow {
		letter-spacing: 0.04em;
	}
</style>
