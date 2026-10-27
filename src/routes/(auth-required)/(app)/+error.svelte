<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import { errorCopy } from '$lib/error-page';

	// Rendered inside the app shell, so the bottom nav is still there; the back
	// link and the button are the way out that SvelteKit's bare error page did
	// not have (see docs/request-failures.md).
	const copy = $derived(errorCopy(page.status));
	const back = $derived.by(() => {
		// A thread that is gone, or not yours (an old notification's, say): the
		// board, which shows whatever context this device is in.
		if (page.route.id?.startsWith('/(auth-required)/(app)/messages/')) {
			return {
				href: resolve('/(auth-required)/(app)/messages'),
				text: 'Messages',
				label: 'Back to messages'
			};
		}
		// Anything else. (An old /partner/… or /home/… link matches no route
		// any more, so it gets the root error page, outside the shell.)
		return { href: resolve('/(auth-required)/(app)/today'), text: 'Today', label: 'Back to Today' };
	});
</script>

<section class="page">
	<NestedPageHeader
		backHref={back.href}
		backLabel={back.label}
		backText={back.text}
		title={copy.title}
	/>
	<div class="content">
		{#if page.error?.message}
			<p class="message">{page.error.message}</p>
		{/if}
		<p class="hint">{copy.hint}</p>
		<wa-button href={back.href} variant="brand" appearance="outlined">{back.label}</wa-button>
		{#if page.data.debug}
			<p class="debug">Status {page.status}</p>
		{/if}
	</div>
</section>

<style>
	.page {
		max-width: var(--page-width-narrow);
		margin: 0 auto;
		padding-bottom: var(--wa-space-l);
	}

	.content {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--wa-space-m);
		padding: var(--wa-space-l) var(--page-gutter);

		p {
			margin: 0;
		}
	}

	.hint,
	.debug {
		color: var(--wa-color-text-quiet);
	}

	.debug {
		font-size: var(--wa-font-size-s);
		font-family: var(--wa-font-family-code);
	}
</style>
