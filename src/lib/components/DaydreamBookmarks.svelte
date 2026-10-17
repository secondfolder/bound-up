<script lang="ts">
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import { PENDING_TEXT } from '$lib/sealed-views.svelte';

	/**
	 * The daydream's bookmarks: save points and kept quotes, wherever in the
	 * tree they are. Picking one moves to the branch through it and scrolls
	 * there, so a favourite moment is one tap away however far the story has
	 * gone on since, or whichever branch it was on.
	 */
	let {
		story,
		onclose,
		onjump
	}: {
		story: DaydreamStory;
		onclose: () => void;
		onjump: (turnId: string) => void;
	} = $props();

	let drawer: (HTMLElement & { open: boolean }) | undefined = $state();
	let problem: string | null = $state(null);

	const bookmarks = $derived(
		story.marks.flatMap((mark) =>
			mark.content?.type === 'bookmark' ? [{ ...mark, bookmark: mark.content }] : []
		)
	);

	$effect(() => {
		void story.ensureLoaded(bookmarks.map((mark) => mark.turnId));
	});

	function preview(turnId: string): string {
		const content = story.content(turnId);
		if (content?.type !== 'text') {
			return PENDING_TEXT;
		}
		return content.text.length > 90 ? `${content.text.slice(0, 90).trimEnd()}…` : content.text;
	}

	async function jump(turnId: string) {
		await story.showBranch(turnId);
		if (drawer) {
			drawer.open = false;
		}
		onjump(turnId);
	}
</script>

<wa-drawer
	bind:this={drawer}
	label="Bookmarks"
	open
	light-dismiss
	onwa-after-hide={(event: Event) => event.target === drawer && onclose()}
>
	{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}
	{#if bookmarks.length === 0}
		<p class="empty">
			No bookmarks yet. Bookmark a passage from its menu, or select some words in it and keep them.
		</p>
	{:else}
		<ul class="bookmarks">
			{#each bookmarks as mark (mark.id)}
				<li>
					<!-- A list entry that moves somewhere: a native button, styled as a row. -->
					<button type="button" class="open" disabled={story.busy} onclick={() => jump(mark.turnId)}>
						{#if mark.bookmark.label}<strong>{mark.bookmark.label}</strong>{/if}
						{#if mark.bookmark.quote}
							<q>{mark.bookmark.quote.text}</q>
						{:else}
							<span class="preview">{preview(mark.turnId)}</span>
						{/if}
					</button>
					<wa-button
						size="s"
						appearance="plain"
						pill
						onclick={async () => {
							problem = await story.removeMark(mark.id);
						}}
					>
						<wa-icon name="trash-can" variant="regular" label={`Remove ${mark.bookmark.label || 'this bookmark'}`}></wa-icon>
					</wa-button>
				</li>
			{/each}
		</ul>
	{/if}
</wa-drawer>

<style>
	.bookmarks {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;

		li {
			display: flex;
			align-items: flex-start;
			gap: 0.25rem;
		}
	}

	.open {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem 0.625rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: 0.6rem;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;

		q {
			font-style: italic;
		}

		.preview {
			color: var(--wa-color-text-quiet);
			font-size: 0.875rem;
		}

		&:hover:not(:disabled) {
			background: var(--wa-color-surface-lowered, transparent);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}

	.empty {
		color: var(--wa-color-text-quiet);
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}
</style>
