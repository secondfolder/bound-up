<script lang="ts">
	import type { WaSelectEvent } from '@awesome.me/webawesome/dist/events/select.js';
	import type { Reaction } from '$lib/daydream/context';
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import type { Quote } from '$lib/sealed-kinds/daydreams';
	import { PENDING_TEXT, UNREADABLE_TEXT } from '$lib/sealed-views.svelte';
	import type { DaydreamTreeNodeView } from '$lib/types';
	import DaydreamPicture from './DaydreamPicture.svelte';
	import DaydreamProse from './DaydreamProse.svelte';
	import DaydreamSiblings from './DaydreamSiblings.svelte';

	/**
	 * One passage of the story: its text, with bookmarked quotes highlighted;
	 * the other takes on it; reactions; and a menu of what else can be done
	 * with it. When some of its text is selected, the bar under it acts on
	 * that stretch (`selected`, worked out by `DaydreamThread`).
	 */
	let {
		story,
		node,
		speaker,
		cast,
		held = false,
		selected,
		onBookmark,
		onNotThis,
		onRawLog,
		debug = false
	}: {
		story: DaydreamStory;
		node: DaydreamTreeNodeView;
		/** Whose voice this is, when one character tells the whole story; null otherwise. */
		speaker: string | null;
		/** Who has a colour of their own in the passage's dialogue (`DaydreamProse`). */
		cast: { you: readonly string[]; characters: readonly string[] };
		/** The passage that last arrived, where following the end stops (`DaydreamThread`'s `heldId`). */
		held?: boolean;
		/** The stretch of this passage that is selected, if any. */
		selected: Quote | null;
		onBookmark: (turnId: string, quote: Quote | null) => void;
		onNotThis: (turnId: string, quote: Quote) => void;
		/** Opens this passage's raw log by itself; offered in debug mode only. */
		onRawLog?: (turnId: string) => void;
		/**
		 * Debug mode is on on this device: a picture shows what it was made
		 * from when tapped, and the menu offers the passage's raw log.
		 */
		debug?: boolean;
	} = $props();

	const content = $derived(story.content(node.id));
	const passage = $derived(content?.type === 'text' ? content : null);
	const ooc = $derived(passage?.meta?.ooc === true);
	const quotes = $derived(
		story
			.bookmarksFor(node.id)
			.flatMap((mark) =>
				mark.content?.type === 'bookmark' && mark.content.quote ? [mark.content.quote] : []
			)
	);
	const reaction = $derived(story.reactionFor(node.id)?.reaction ?? null);
	/** The reaction just given, for its pop; cleared once that has played. */
	let popped: string | null = $state(null);
	const bookmarked = $derived(
		story
			.bookmarksFor(node.id)
			.some((mark) => mark.content?.type === 'bookmark' && !mark.content.quote)
	);

	/**
	 * `outline` is whether the icon has a free regular (outlined) variant to
	 * show while unpressed. `fire` has none: Font Awesome's kit CDN refuses
	 * the request, and the button sat empty until it was pressed and went
	 * solid. Without one the icon stays solid, and pressed shows by colour.
	 */
	const REACTIONS: readonly { value: Reaction; icon: string; label: string; outline: boolean }[] = [
		{ value: 'love', icon: 'fire', label: 'Loved it', outline: false },
		{ value: 'like', icon: 'thumbs-up', label: 'Liked it', outline: true },
		{ value: 'not-for-me', icon: 'thumbs-down', label: 'Not for me', outline: true }
	];

	function onMenu(event: WaSelectEvent) {
		// The property, not the attribute: a value Svelte sets on an upgraded
		// element is a property, which Lit does not reflect (AGENTS.md).
		switch ((event.detail.item as HTMLElement & { value?: string }).value) {
			case 'bookmark':
				onBookmark(node.id, null);
				break;
			case 'again':
				void story.writeAgain(node.id);
				break;
			case 'from-here':
				void story.rewindTo(node.id);
				break;
			case 'raw-log':
				onRawLog?.(node.id);
				break;
			default:
				break;
		}
	}
</script>

<li class="passage" class:ooc data-turn-id={node.id} data-hold-scroll={held || undefined}>
	{#if speaker && !ooc}<span class="who">{speaker}</span>{/if}
	{#if ooc}<span class="who">Out of the story</span>{/if}
	<div class="text">
		{#if content === undefined}{PENDING_TEXT}{:else if !passage}{UNREADABLE_TEXT}{:else}
			<DaydreamProse text={passage.text} {cast} {quotes} turnId={node.id} />
		{/if}
	</div>

	{#if selected && passage && !story.busy}
		<div class="selection" role="toolbar" aria-label="With the selected words">
			<wa-button size="s" appearance="outlined" onclick={() => void story.moreOf(node.id, selected)}>
				More of this
			</wa-button>
			<wa-button
				size="s"
				appearance="outlined"
				onclick={() => void story.rewrite(node.id, { quote: selected })}
			>
				Rewrite this
			</wa-button>
			<wa-button size="s" appearance="outlined" onclick={() => onNotThis(node.id, selected)}>
				Not this
			</wa-button>
			<wa-button size="s" appearance="outlined" onclick={() => onBookmark(node.id, selected)}>
				<wa-icon slot="start" name="highlighter" variant="solid"></wa-icon>
				Keep this
			</wa-button>
		</div>
	{/if}

	{#if passage}
		<!-- After the text, never in it: quote offsets are measured against it. -->
		<DaydreamPicture {story} turnId={node.id} {debug} />
		<div class="actions">
			<DaydreamSiblings {story} turnId={node.id} />
			{#if bookmarked}
				<wa-icon class="bookmarked" name="bookmark" variant="solid" label="Bookmarked"></wa-icon>
			{/if}
			{#if !ooc}
				<div class="reactions">
					{#each REACTIONS as choice (choice.value)}
						<!-- A toggle: a native button, because wa-button forwards no
						     aria-pressed to the button inside it (AGENTS.md). -->
						<button
							type="button"
							class="reaction"
							aria-label={choice.label}
							aria-pressed={reaction === choice.value}
							class:popped={popped === choice.value}
							class:flame={choice.icon === 'fire'}
							onclick={() => {
								popped = reaction === choice.value ? null : choice.value;
								void story.react(node.id, choice.value);
							}}
							onanimationend={() => {
								popped = null;
							}}
						>
							<wa-icon name={choice.icon} variant={choice.outline && reaction !== choice.value ? 'regular' : 'solid'}></wa-icon>
						</button>
					{/each}
				</div>
			{/if}
			<wa-dropdown placement="bottom-end" onwa-select={onMenu}>
				<wa-button slot="trigger" size="s" appearance="plain" pill>
					<wa-icon name="ellipsis" variant="solid" label="More for this passage"></wa-icon>
				</wa-button>
				<wa-dropdown-item value="bookmark">
					<wa-icon slot="icon" name="bookmark" variant="regular"></wa-icon>
					Bookmark
				</wa-dropdown-item>
				{#if story.available}
					<wa-dropdown-item value="again" disabled={story.busy}>
						<wa-icon slot="icon" name="rotate-right" variant="solid"></wa-icon>
						Write again
					</wa-dropdown-item>
				{/if}
				{#if node.id !== story.activeTurnId}
					<wa-dropdown-item value="from-here" disabled={story.busy}>
						<wa-icon slot="icon" name="code-branch" variant="solid"></wa-icon>
						Carry on from here
					</wa-dropdown-item>
				{/if}
				{#if debug && onRawLog}
					<wa-dropdown-item value="raw-log">
						<wa-icon slot="icon" name="code" variant="solid"></wa-icon>
						Raw log
					</wa-dropdown-item>
				{/if}
			</wa-dropdown>
		</div>
	{/if}
</li>

<style>
	.passage {
		align-self: flex-start;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-inline-size: 90%;

		.who {
			font-size: 0.8125rem;
			color: var(--wa-color-text-quiet);
			padding-inline: 0.25rem;
		}

		.text {
			margin: 0;
			padding: 0.625rem 0.875rem;
			border-radius: 1rem;
			border-end-start-radius: 0.25rem;
			background: var(--wa-color-surface-raised, var(--wa-color-surface-default));
			border: 1px solid var(--wa-color-surface-border);
			overflow-wrap: anywhere;

			/* A touch larger, with more room, where there is room: long passages
			   at body size in a chat bubble read cramped on a big screen.
			   DaydreamArriving matches, so a passage does not change size as it
			   is saved. */
			@media (width >= 48rem) {
				padding: 0.75rem 1rem;
				font-size: 1.0625rem;
			}
		}

		&.ooc .text {
			background: transparent;
			border-style: dashed;
			font-style: italic;
			color: var(--wa-color-text-quiet);
		}
	}

	@keyframes reacted {
		40% {
			scale: 1.3;
		}
	}

	@keyframes flicker {
		25% {
			scale: 1.3;
			rotate: -8deg;
		}

		50% {
			scale: 1.15;
			rotate: 6deg;
		}

		75% {
			scale: 1.22;
			rotate: -3deg;
		}
	}

	.selection {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		color: var(--wa-color-text-quiet);

		wa-button {
			--wa-form-control-height: 1.75rem;
		}

		.bookmarked {
			color: var(--wa-color-brand-on-quiet);
		}
	}

	.reactions {
		display: inline-flex;
		gap: 0.125rem;
	}

	.reaction {
		display: inline-grid;
		place-items: center;
		inline-size: 1.75rem;
		block-size: 1.75rem;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: inherit;
		cursor: pointer;

		&[aria-pressed='true'] {
			color: var(--wa-color-brand-on-quiet);
		}

		/* A pop as a reaction is given, and a flicker for the flame: the tap
		   lands visibly. Only on the one just pressed (`popped`), never on
		   reactions already there as the story opens. */
		@media (prefers-reduced-motion: no-preference) {
			&.popped wa-icon {
				animation: reacted 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
			}

			&.popped.flame wa-icon {
				animation: flicker 420ms ease-out;
			}
		}

		&:hover {
			background: var(--wa-color-surface-lowered, transparent);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}
</style>
