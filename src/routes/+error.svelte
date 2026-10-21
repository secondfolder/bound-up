<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { errorCopy } from '$lib/error-page';

	// Everything outside the app shell: public pages, the standalone tools, and
	// an error thrown by a layout above the shell. No shell to lean on here, so
	// the page carries its own way back. The app shell has its own error page
	// (`(auth-required)/(app)/+error.svelte`), which keeps the bottom nav.
	const copy = $derived(errorCopy(page.status));
</script>

<svelte:head>
	<title>{copy.title} · Bound Up</title>
</svelte:head>

<main class="error-page">
	<h1>{copy.title}</h1>
	{#if page.error?.message}
		<p class="message">{page.error.message}</p>
	{/if}
	<p class="hint">{copy.hint}</p>
	<wa-button href={resolve('/')} variant="brand" appearance="outlined">Go to Bound Up</wa-button>
</main>

<style>
	.error-page {
		box-sizing: border-box;
		inline-size: 100%;
		max-inline-size: 30rem;
		margin: 0 auto;
		padding: 15svh var(--page-gutter) var(--wa-space-xl);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--wa-space-m);
		text-align: center;

		h1,
		p {
			margin: 0;
		}
	}

	.hint {
		color: var(--wa-color-text-quiet);
	}
</style>
