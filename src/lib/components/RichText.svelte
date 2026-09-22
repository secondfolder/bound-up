<script lang="ts">
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import RichTextInline, { type InlineEmbedContext } from './RichTextInline.svelte';
	import UrlEmbed from './UrlEmbed.svelte';
	import {
		embedErrorDetails,
		embedSpecFor,
		fetchEmbedDetailsResult,
		type CachedEmbedDetails
	} from '$lib/embeds';
	import { isWithinScrollport, scrollIntoViewWithin } from '$lib/scroll-parent';
	import {
		documentEmbedUrls,
		inlineLinkUrls,
		parseStoredRichText,
		withInlineEmbeds,
		type RichTextInlineNode
	} from '$lib/richtext';

	/**
	 * Message, task and reward prose.
	 *
	 * Takes the **stored string** and renders it. What is stored is a Lexical
	 * `editorState.toJSON()` document; `parseStoredRichText` is the one boundary
	 * that turns it — or a legacy plain-text row — into a document, so nothing
	 * below here knows two formats ever existed. See docs/rich-text.md.
	 *
	 * Deliberately no Lexical import. The serialised state is plain JSON, so
	 * displaying a message needs no editor and no DOM, and a page that only
	 * shows descriptions ships none of the editor. Reintroducing a Lexical
	 * import here would undo that for every such page.
	 *
	 * No `{@html}`: every character goes through ordinary interpolation. The
	 * only sanitised markup in the app lives inside `UrlEmbed`.
	 *
	 * Embeds are their own nodes rather than a property of the link that
	 * produced them, which is why there is no `maxEmbeds` any more — a document
	 * contains exactly the embeds it says it contains. `embedSpecFor` still runs
	 * here rather than being stored, so a provider we drop degrades to a link
	 * instead of leaving a hole.
	 */
	let {
		text,
		cachedEmbeds = [],
		cachedEmbedsPending = false,
		onEmbedActivated = undefined,
		onRefreshEmbed = undefined
	}: {
		text: string;
		cachedEmbeds?: CachedEmbedDetails[];
		cachedEmbedsPending?: boolean;
		/** Called once per URL whose embed starts loading with nothing cached. */
		onEmbedActivated?: ((href: string) => void | Promise<void>) | undefined;
		onRefreshEmbed?: ((href: string) => void | Promise<void>) | undefined;
	} = $props();

	const doc = $derived(parseStoredRichText(text));
	const blocks = $derived(doc.root.children);
	const cachedByHref = $derived(new Map(cachedEmbeds.map((embed) => [embed.href, embed])));

	/**
	 * Details this reader's own reveals looked up, by URL — or, when the lookup
	 * failed, a card saying why.
	 *
	 * Folded in under the message's own cached entries, which win: a refresh
	 * that writes a real entry for the URL replaces an error card here too.
	 */
	const revealedDetails = new SvelteMap<string, CachedEmbedDetails>();
	const embedDetails = $derived.by(() => {
		if (revealedDetails.size === 0) return cachedByHref;
		// Later entries win, so the message's own come second.
		return new Map([...revealedDetails, ...cachedByHref]);
	});

	/** The URLs the writer gave an embed of their own. */
	const embedded = $derived(new Set(documentEmbedUrls(doc)));

	/**
	 * The reveals this reader asked for, as `blockIndex:url`.
	 *
	 * View state and nothing else — deliberately not written back to the
	 * message. The writer decided what this message looks like; a reader
	 * expanding a link for themselves is closer to opening it in a tab than to
	 * editing what was sent, so it lasts exactly as long as the page does.
	 *
	 * Keyed by block as well as URL so a link quoted in two paragraphs reveals
	 * the one the reader pressed, above the line it is actually on.
	 */
	const revealed = new SvelteSet<string>();

	/** Reveals whose details are still on their way, keyed like `revealed`. */
	const revealing = new SvelteSet<string>();

	/** The URL of the most recent reveal, so only that one is scrolled to. */
	let scrollTo: string | null = null;

	function canReveal(blockIndex: number, url: string): boolean {
		return (
			!embedded.has(url) && !revealed.has(`${blockIndex}:${url}`) && embedSpecFor(url) !== null
		);
	}

	/**
	 * Inserts the card once it has something to show, not before.
	 *
	 * The button keeps a spinner while the details load, and the card goes in
	 * complete — rather than going in straight away and drawing nothing until
	 * its lookup lands, which left the reader with a button that vanished and
	 * no sign anything was happening. A failed lookup still inserts a card,
	 * titled with the reason: the reader asked for something, and a silent
	 * nothing reads as a button that does not work.
	 *
	 * A URL the message already has cached details for needs no lookup.
	 */
	async function reveal(blockIndex: number, url: string) {
		const key = `${blockIndex}:${url}`;
		if (revealing.has(key)) return;
		if (!embedDetails.has(url)) {
			revealing.add(key);
			const result = await fetchEmbedDetailsResult(url);
			revealing.delete(key);
			revealedDetails.set(url, result.ok ? result.details : embedErrorDetails(url, result.error));
		}
		scrollTo = url;
		revealed.add(key);
	}

	/**
	 * A paragraph's nodes with this reader's own reveals folded in.
	 *
	 * `withInlineEmbeds` is the same placement the composer uses, so a card the
	 * reader asked for lands exactly where the writer's own would have: at the
	 * start of the line its link is on.
	 */
	function inlineNodes(children: RichTextInlineNode[], blockIndex: number): RichTextInlineNode[] {
		const urls = inlineLinkUrls(children).filter(
			(url) =>
				revealed.has(`${blockIndex}:${url}`) && !embedded.has(url) && embedSpecFor(url) !== null
		);
		return urls.length === 0 ? children : withInlineEmbeds(children, urls);
	}

	/**
	 * Takes the reader to the card they just asked for.
	 *
	 * The card goes above the line, which for a long paragraph is somewhere they
	 * cannot see. Only the card from the most recent press is considered, and
	 * only when it actually landed out of view — moving the page for a card
	 * already on screen is worse than not moving it at all.
	 */
	function embedMounted(url: string, node: HTMLElement) {
		if (url !== scrollTo) return;
		scrollTo = null;
		if (isWithinScrollport(node)) return;
		scrollIntoViewWithin(node, node, { behavior: 'smooth' });
	}

	/**
	 * What every embed in this document needs from the message around it.
	 *
	 * Passed as one object through the recursive inline renderer rather than as
	 * four props threaded through every level. The getters keep it live: the
	 * object is built once, but what it hands back follows the props.
	 */
	const embeds: InlineEmbedContext = {
		get cached() {
			return embedDetails;
		},
		get pending() {
			return cachedEmbedsPending;
		},
		onActivate: (href) => onEmbedActivated?.(href),
		onRefresh: (href) => onRefreshEmbed?.(href),
		onMounted: embedMounted
	};
</script>

{#each blocks as block, index (index)}
	{#if block.type === 'paragraph'}
		<!-- No whitespace inside the <p>: a newline there renders as a space in
		     front of the sender's first character. -->
		<p>
			<RichTextInline
				nodes={inlineNodes(block.children, index)}
				{embeds}
				canReveal={(url) => canReveal(index, url)}
				isRevealing={(url) => revealing.has(`${index}:${url}`)}
				onReveal={(url) => reveal(index, url)}
			/>
		</p>
	{:else if block.type === 'list'}
		{#if block.listType === 'number'}
			<ol start={block.start}>
				{#each block.children as item, itemIndex (itemIndex)}
					<li><RichTextInline nodes={item.children} {embeds} /></li>
				{/each}
			</ol>
		{:else}
			<ul>
				{#each block.children as item, itemIndex (itemIndex)}
					<li><RichTextInline nodes={item.children} {embeds} /></li>
				{/each}
			</ul>
		{/if}
	{:else if embedSpecFor(block.url)}
		<!-- A root-level embed with no paragraph after it for `parseStoredRichText`
		     to move into. Rare, and older than the inline placement. -->
		<UrlEmbed
			spec={embedSpecFor(block.url)!}
			href={block.url}
			label={block.url}
			cached={cachedByHref.get(block.url) ?? null}
			cachedPending={cachedEmbedsPending}
			onActivate={onEmbedActivated}
			onRefresh={onRefreshEmbed}
		/>
	{:else}
		<!-- An embed whose provider we no longer support. It degrades to the
		     link it was made from rather than vanishing. -->
		<p>
			<a href={block.url} target="_blank" rel="noopener noreferrer ugc">{block.url}</a>
		</p>
	{/if}
{/each}

<style>
	p,
	ul,
	ol {
		margin: 0;
	}

	p + p,
	p + ul,
	p + ol,
	ul + p,
	ol + p {
		margin-block-start: 0.5em;
	}

	ul,
	ol {
		padding-inline-start: 1.5em;
	}

	/* Long URLs and unbroken strings must not widen a message bubble. */
	p {
		overflow-wrap: anywhere;
	}
</style>
