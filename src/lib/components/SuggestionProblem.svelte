<script lang="ts">
	import type { SuggestFailure } from '$lib/daydream/suggest';
	import LinkFetches from './LinkFetches.svelte';

	/**
	 * Why a suggestion failed, said where it was asked for. In debug mode
	 * (docs/debug-mode.md), a failure that knows what came back shows it too
	 * — the model's reply as it was written, and why nothing in it could be
	 * used — since "No ideas came back" alone says nothing about why.
	 *
	 * `debug` is handed down rather than read from `page.data`, so the
	 * dialogs this sits in stay testable without mocking `$app/state`.
	 */
	let { problem, debug = false }: { problem: SuggestFailure; debug?: boolean } = $props();
</script>

<p class="invalid" role="alert">{problem.error}</p>
{#if debug && problem.detail}
	<wa-details summary="What came back" class="detail">
		<pre>{problem.detail}</pre>
	</wa-details>
{/if}
{#if debug && problem.fetches?.length}<LinkFetches fetches={problem.fetches} />{/if}

<style>
	.invalid {
		margin: 0;
		color: var(--wa-color-text-danger);
	}

	pre {
		margin: 0;
		max-block-size: 20rem;
		overflow: auto;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-family: var(--wa-font-family-code, monospace);
		font-size: 0.8125rem;
	}
</style>
