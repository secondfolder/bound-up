<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The card shell every /home and /partner/[id] section is built from.
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
		body
	}: {
		title: string;
		/**
		 * Omit for a section with nowhere to send anyone. The /home messages card
		 * is the only one so far: messages are per-partner, so there is no single
		 * page behind the word "Messages" — its rows carry the links instead.
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
	} = $props();
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
				The rule cannot see through a prop, so it fires on the one link in
				this codebase that has nothing left to resolve.
			-->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a {href}>
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
	}

	h2 {
		margin: 0;
		font-size: 1.125rem;

		a,
		.static {
			display: flex;
			align-items: center;
			gap: 0.625rem;
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

		.title {
			flex: 1 1 auto;
			min-inline-size: 0;
		}

		wa-icon {
			flex: none;
			color: var(--wa-color-brand-fill-loud, var(--wa-color-text-link));
		}

		.go {
			color: var(--wa-color-text-quiet);
			font-size: 0.875em;
		}
	}
</style>
