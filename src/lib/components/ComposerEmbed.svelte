<script lang="ts">
	import UrlEmbed from './UrlEmbed.svelte';
	import { embedSpecFor, fetchEmbedDetails, type CachedEmbedDetails } from '$lib/embeds';

	/**
	 * What an `EmbedNode` looks like inside the editor.
	 *
	 * The real `UrlEmbed`, not a stand-in: what you see while writing is what
	 * the reader gets, which is the whole reason to show anything here at all —
	 * a chip saying "youtube.com" tells the writer nothing about whether they
	 * pasted the right link.
	 *
	 * Mounted into Lexical's decorator element rather than rendered from a
	 * template, because Lexical owns every node inside the editable surface —
	 * see the decorator listener in `RichTextEditor.svelte`.
	 */
	let { url, onRemove }: { url: string; onRemove: () => void } = $props();

	const spec = $derived(embedSpecFor(url));

	/**
	 * The same preview details the reader will get.
	 *
	 * Without them the composer draws whatever the URL alone can produce — a
	 * bare player with no title, or for reddit nothing at all until the proxy
	 * answers — while the sent message shows a titled card, because the send
	 * path resolves exactly this and encrypts it into the message. Asking for
	 * it here is what makes the two agree. It is also the lookup that was going
	 * to happen at send time anyway; see docs/privacy.md.
	 */
	let details: CachedEmbedDetails | null = $state(null);
	let resolving = $state(true);

	$effect(() => {
		const wanted = url;
		resolving = true;
		void fetchEmbedDetails(wanted).then((resolved) => {
			// Guarded because the prop can change under a slow lookup, and the
			// answer to the old question must not be drawn as the new one.
			if (wanted !== url) return;
			details = resolved;
			resolving = false;
		});
	});
</script>

<div class="composer-embed">
	{#if spec}
		<UrlEmbed {spec} href={url} label={url} cached={details} cachedPending={resolving} />
	{/if}
	<button
		type="button"
		class="remove"
		aria-label="Remove embedded preview of {url}"
		title="Remove embed"
		onpointerdown={(event) => {
			// Without this the press lands in the contenteditable first, moving the
			// caret into a node that is about to be deleted — which leaves Lexical
			// reconciling a selection pointing at nothing.
			event.preventDefault();
		}}
		onclick={onRemove}
	>
		<wa-icon name="xmark" variant="solid"></wa-icon>
	</button>
</div>

<style>
	.composer-embed {
		display: block;
		position: relative;
		white-space: initial; /* Overrides white-space supplied by the RichTextEditor */
		margin-block: 0.35rem;
		/* The same cap a message bubble has, because that is what this is a
		   preview of — kept in step with the `li` rule in MessageBubble.svelte.
		   Without it the embed is as wide as the composer and the writer is
		   shown something the reader will never see. */
		max-inline-size: min(78%, 34rem);
		/* The embed is a preview, not something to interact with while writing:
		   a click belongs to the editor, which selects the widget it landed on —
		   see `registerWidgetSelection`. A player that swallowed the press would
		   leave the caret somewhere the writer did not put it. The remove button
		   opts back in. */
		user-select: none;
	}

	.composer-embed :global(.url-embed) {
		pointer-events: none;
	}

	.remove {
		position: absolute;
		inset-block-start: 0.35rem;
		inset-inline-end: 0.35rem;
		z-index: 1;
		display: grid;
		place-items: center;
		inline-size: 1.6rem;
		block-size: 1.6rem;
		padding: 0;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: 999px;
		background: var(--wa-color-surface-raised, white);
		color: var(--wa-color-text-normal);
		box-shadow: 0 0.125rem 0.5rem rgb(0 0 0 / 25%);
		font-size: 0.7rem;
		cursor: pointer;
	}
</style>
