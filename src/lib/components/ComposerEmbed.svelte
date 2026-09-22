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
	 * to happen at send time anyway; see docs/user-commitments-and-product-goals.md.
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

<!--
	Remove goes in the embed's own actions row rather than floating over its
	corner, so it lines up with whatever else the embed offers instead of
	covering it. `UrlEmbed` draws that row only because this snippet exists.
-->
{#snippet actions()}
	<wa-button
		type="button"
		class="remove"
		size="s"
		appearance="plain"
		pill
		title="Remove embed"
		onpointerdown={(event: PointerEvent) => {
			// Without this the press lands in the contenteditable first, moving the
			// caret into a node that is about to be deleted — which leaves Lexical
			// reconciling a selection pointing at nothing.
			event.preventDefault();
		}}
		onclick={onRemove}
	>
		<wa-icon name="xmark" variant="solid" label="Remove embedded preview of {url}"></wa-icon>
	</wa-button>
{/snippet}

<div class="composer-embed">
	{#if spec}
		<UrlEmbed {spec} href={url} label={url} cached={details} cachedPending={resolving} {actions} />
	{:else}
		<!-- No spec means no embed to draw, which the editor does not normally
		     produce — a node whose provider support was dropped is filtered out
		     before it reaches here. Remove stays reachable anyway, since the
		     alternative is a node the writer cannot delete. -->
		<span class="orphan">{@render actions()}</span>
	{/if}
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

	/* The one thing in the preview that is meant to be pressed. Everything else
	   in there, the fullscreen button included, stays inert: a click inside the
	   editable surface belongs to the editor, which selects the widget it
	   landed on. */
	.remove {
		pointer-events: auto;
	}

	.orphan {
		display: flex;
		justify-content: flex-end;
	}
</style>
