<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';

	/**
	 * The card shell every section on Today is built from.
	 *
	 * A header whose title links to the section's own page, and a body the
	 * caller fills with a preview of what is behind that link. This component
	 * knows nothing about tasks, rewards or messages; the widgets that call it
	 * know nothing about card chrome.
	 */
	let {
		title,
		href,
		icon,
		body,
		onfollow
	}: {
		title: string;
		/**
		 * Omit for a section whose rows carry the links. Today's unread messages card
		 * is the only one so far: each row opens the board in its partner's
		 * context.
		 */
		href?: string;
		/** A Font Awesome name, as `wa-icon` takes it. */
		icon?: string;
		/**
		 * The preview body, or nothing when the section has none.
		 *
		 * A snippet prop rather than `children` precisely so a caller can leave it
		 * off: there is no way to ask a rendered snippet "did that produce
		 * anything", and wrapping the content in an `{#if}` inside `children`
		 * would still hand this component a snippet and still draw an empty body
		 * box. Only the widget knows whether its own counts add up to a line
		 * worth reading, so the widget decides, and the card then draws a header
		 * on its own — which is the point. A body saying "nothing here" is worse
		 * than no body.
		 */
		body?: Snippet;
		/**
		 * Runs when the title's link is followed, before the browser goes:
		 * the notebook card's, to show the list in the card's own context.
		 */
		onfollow?: (event: MouseEvent) => void;
	} = $props();

	/**
	 * `onfollow` as a listener on the link itself, not an `onclick=`: Svelte
	 * delegates that to the root, where SvelteKit's router also listens for
	 * link clicks, so which ran first was down to registration order. On the
	 * link, it runs before anything at the root and can stop the router.
	 */
	const following: Attachment<HTMLAnchorElement> = (link) => {
		const follow = onfollow;
		if (!follow) {
			return;
		}
		link.addEventListener('click', follow);
		return () => link.removeEventListener('click', follow);
	};
</script>

<!--
	`with-header` is not decoration: without it wa-card server-renders the body
	only, and the header pops in at hydration. It works around the absence of
	`:has-slotted`, so it has to be set by hand whenever the header slot is used
	— and it is set here unconditionally because every section has a title.
-->
<wa-card class="widget" class:bodyless={!body} appearance="outlined" with-header>
	<h2 slot="header">
		{#if href}
			<!--
				`href` arrives already resolved — every caller builds it with
				`resolve()`, because only the page knows which route params to pass.
			-->
			<!-- Not preloaded when it switches the context first: a preload
			     fetches the page's data in the context as it was, and the
			     navigation would then use that. -->
			<a {href} {@attach following} data-sveltekit-preload-data={onfollow ? 'off' : undefined}>
				{#if icon}
					<wa-icon name={icon} variant="solid"></wa-icon>
				{/if}
				<span class="title">{title}</span>
				<!-- No label, so it contributes nothing to the link's accessible
				     name: it stays the bare word the old button used, which is what
				     the Playwright suite locates these by. -->
				<wa-icon class="go" name="chevron-right" variant="solid"></wa-icon>
			</a>
		{:else}
			<span class="static">
				{#if icon}
					<wa-icon name={icon} variant="solid"></wa-icon>
				{/if}
				<span class="title">{title}</span>
			</span>
		{/if}
	</h2>

	{@render body?.()}
</wa-card>

<style>
	.widget {
		inline-size: 100%;
		text-align: start;

		/* wa-card always renders its body div, padding and all, so an omitted
		   body would leave a blank box under the header. `::part` is the only
		   way in — the div is in the card's shadow root. */
		&.bodyless::part(body) {
			display: none;
		}
		&.bodyless::part(header) {
			border-block-end-width: 0;
		}

		/* The header's padding moves onto the link inside it (below), so the
		   whole bar is the tap target. With the padding on the part, only the
		   22px line of text was: a tap on the bar around it did nothing. */
		&::part(header) {
			padding: 0;
		}
	}

	h2 {
		margin: 0;
		font-size: 1.125rem;

		a,
		.static {
			display: flex;
			align-items: center;
			gap: 0.625rem;
			/* wa-card's own header padding, which `--spacing` is inherited from
			   the card for. */
			padding: calc(var(--spacing) / 2) var(--spacing);
			min-block-size: 2.75rem;
			box-sizing: border-box;
		}

		.title {
			flex: 1 1 auto;
			min-inline-size: 0;
		}

		a {
			text-decoration: none;
			color: inherit;
			/* Kills the grey flash on tap that makes a web app feel non-native,
			   matching AppNav. */
			-webkit-tap-highlight-color: transparent;

			&:hover .title,
			&:focus-visible .title {
				text-decoration: underline;
			}
		}

		wa-icon {
			flex: none;
			color: var(--wa-color-brand-fill-loud, var(--wa-color-text-link));
		}

		.go {
			color: var(--wa-color-text-quiet);
			font-size: 0.875em;
		}

		/* The chevron leans towards where the link goes, so a pointer over any
		   part of the bar shows the bar is the link. */
		@media (prefers-reduced-motion: no-preference) {
			.go {
				transition: transform 150ms ease-out;
			}

			a:hover .go,
			a:focus-visible .go {
				transform: translateX(3px);
			}
		}
	}
</style>
