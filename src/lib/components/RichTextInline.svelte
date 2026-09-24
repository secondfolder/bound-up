<script lang="ts">
	import { type CachedEmbedDetails, embedSpecFor, isSafeHttpUrl } from '$lib/embeds';
	import type { RichTextInlineNode } from '$lib/richtext';
	import InlineButton from './InlineButton.svelte';
	import MarkedText from './MarkedText.svelte';
	import Self from './RichTextInline.svelte';
	import UrlEmbed from './UrlEmbed.svelte';

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
	 * `canReveal` / `isRevealing` / `onReveal` are the reader's own opt-in for a link the
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
		embeds,
		canReveal,
		isRevealing,
		onReveal
	}: {
		nodes: RichTextInlineNode[];
		embeds?: InlineEmbedContext | undefined;
		canReveal?: ((url: string) => boolean) | undefined;
		/** True while a pressed Show is still loading what it will insert. */
		isRevealing?: ((url: string) => boolean) | undefined;
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
		/>{:else if node.type === 'embed'}{const spec = $derived(embedSpecFor(node.url))}{#if spec}<span
				class="embed-slot"
				use:mounted={node.url}
				><UrlEmbed
					{spec}
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
			><Self nodes={node.children} {embeds} {canReveal} {isRevealing} {onReveal} /></a
		>{#if canReveal?.(node.url)}<!--
				Sits in the flow right after the link, with no whitespace between
				them, so the margin is what separates the two.
			--><InlineButton
				class="reveal"
				--inline-button-margin="0.35em 0.1em"
				disabled={isRevealing?.(node.url) ?? false}
				loading={isRevealing?.(node.url) ?? false}
				onclick={() => onReveal?.(node.url)}>Show</InlineButton
			>{/if}{/if}{/each}

<style>
	/* A row of its own inside the paragraph. The document says inline; the
	   screen says block — that split is the point of the node. */
	.embed-slot {
		display: block;
	}
</style>
