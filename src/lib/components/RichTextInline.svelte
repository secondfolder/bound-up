<script lang="ts">
	import Self from './RichTextInline.svelte';
	import MarkedText from './MarkedText.svelte';
	import UrlEmbed from './UrlEmbed.svelte';
	import { embedSpecFor, isSafeHttpUrl, type CachedEmbedDetails } from '$lib/embeds';
	import type { RichTextInlineNode } from '$lib/richtext';

	/**
	 * The inline half of the renderer: text, line breaks, links and embeds.
	 *
	 * Everything is emitted through ordinary Svelte interpolation and real
	 * elements — no `{@html}`, ever. That is the property the whole rendering
	 * design exists to keep: message and description text has an XSS surface of
	 * zero because it is never parsed as markup. The one sanitised `{@html}` in
	 * the app lives inside `UrlEmbed`, and only ever sees DOMPurify-cleaned
	 * oEmbed markup.
	 *
	 * The markup is written without whitespace between the tags on purpose: a
	 * newline there becomes a rendered space, which would insert gaps between
	 * adjacent text nodes that the author never typed.
	 *
	 * Embeds are inline nodes that draw as blocks — see the note on the node
	 * type. `<span>`s and `<iframe>`s all the way down, so an embed inside the
	 * `<p>` this renders into is still valid markup.
	 *
	 * `embeds` carries what `UrlEmbed` needs from the message around it, and
	 * `canReveal` / `onReveal` are the reader's own opt-in for a link the
	 * **writer** left without an embed. `RichText` owns both; all that happens
	 * here is the button next to the link, because this is the only component
	 * that knows where the link is.
	 */
	export type InlineEmbedContext = {
		cached: Map<string, CachedEmbedDetails>;
		pending: boolean;
		onActivate?: ((href: string) => void | Promise<void>) | undefined;
		onRefresh?: ((href: string) => void | Promise<void>) | undefined;
		/** Called with each embed's element as it mounts, for the reveal scroll. */
		onMounted?: ((url: string, node: HTMLElement) => void) | undefined;
	};

	let {
		nodes,
		embeds = undefined,
		canReveal = undefined,
		onReveal = undefined
	}: {
		nodes: RichTextInlineNode[];
		embeds?: InlineEmbedContext | undefined;
		canReveal?: ((url: string) => boolean) | undefined;
		onReveal?: ((url: string) => void) | undefined;
	} = $props();

	/**
	 * A link renders as plain text when it is unlinked or its URL is not safe.
	 *
	 * `isUnlinked` is Lexical's own flag for "the user removed the link from
	 * something that still looks like a URL". Honouring it matters: without
	 * this, the renderer would silently re-link text somebody deliberately
	 * unlinked.
	 *
	 * The scheme check is defence in depth. The schema and the editor both
	 * refuse a `javascript:` URL already; this is the last gate before an
	 * `href` reaches the DOM, and it is cheap.
	 */
	function isPlain(node: Extract<RichTextInlineNode, { type: 'link' | 'autolink' }>): boolean {
		return node.isUnlinked === true || !isSafeHttpUrl(node.url);
	}

	function mounted(node: HTMLElement, url: string) {
		embeds?.onMounted?.(url, node);
	}
</script>

{#each nodes as node, index (index)}{#if node.type === 'text'}<MarkedText
			text={node.text}
			format={node.format}
		/>{:else if node.type === 'linebreak'}<br
		/>{:else if node.type === 'embed'}{#if embedSpecFor(node.url)}<span
				class="embed-slot"
				use:mounted={node.url}
				><UrlEmbed
					spec={embedSpecFor(node.url)!}
					href={node.url}
					label={node.url}
					cached={embeds?.cached.get(node.url) ?? null}
					cachedPending={embeds?.pending ?? false}
					onActivate={embeds?.onActivate}
					onRefresh={embeds?.onRefresh}
				/></span
			>{/if}{:else if isPlain(node)}<Self nodes={node.children} />{:else}<a
			href={node.url}
			target="_blank"
			rel="noopener noreferrer ugc"
			><Self nodes={node.children} {embeds} {canReveal} {onReveal} /></a
		>{#if canReveal?.(node.url)}<button
				type="button"
				class="reveal"
				aria-label="Show"
				onclick={() => onReveal?.(node.url)}>Show</button
			>{/if}{/if}{/each}

<style>
	/* A row of its own inside the paragraph. The document says inline; the
	   screen says block — that split is the point of the node. */
	.embed-slot {
		display: block;
	}

	/* Sits in the flow right after the link, so it reads as belonging to it.
	   Sized in `em` and `lh` so it matches whatever text it is sitting in —
	   a message bubble and a task description have different type scales. */
	.reveal {
		font: inherit;
		font-size: 0.9em;
		padding: 0 0.7em;
		line-height: 0.9lh;
		height: 1lh;
		margin-inline: 0.35em 0.1em;
		border: 1px solid currentColor;
		border-radius: 999px;
		background: transparent;
		color: inherit;
		cursor: pointer;
		vertical-align: baseline;
		white-space: nowrap;
	}
</style>
