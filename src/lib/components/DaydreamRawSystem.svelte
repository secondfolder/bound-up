<script lang="ts">
	import { onMount } from 'svelte';
	import type { RawConversation } from '$lib/daydream/raw-conversation.svelte';

	/**
	 * The system prompt, once, at the top of debug mode's raw log
	 * (docs/debug-mode.md). Every request in a story sends the same one, so it
	 * is shown once rather than with each passage; a request that sent another
	 * (a check-in after Stop the scene) shows its own (`DaydreamRawSent`).
	 * Taken from the newest passage's request, rebuilt with the setup as it is
	 * now.
	 */
	let { conversation, turnId }: { conversation: RawConversation; turnId: string } = $props();

	const state = $derived(conversation.state(turnId));

	onMount(() => {
		conversation.load(turnId);
	});
</script>

<li class="system" data-raw-system>
	{#if state === undefined || state === 'loading'}
		<wa-spinner></wa-spinner>
	{:else if 'error' in state}
		<p class="note" role="alert">{state.error}</p>
	{:else}
		<wa-details summary="System prompt, with the setup as it is now" appearance="plain">
			<pre>{state.system}</pre>
		</wa-details>
	{/if}
</li>

<style>
	.system {
		padding: 0.5rem 0.75rem;
		border: 1px dashed var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-m);
		font-size: var(--wa-font-size-s);

		.note {
			margin: 0;
			color: var(--wa-color-text-quiet);
		}

		pre {
			margin: 0;
			font-family: var(--wa-font-family-code, monospace);
			white-space: pre-wrap;
			overflow-wrap: anywhere;
		}

		wa-details::part(header) {
			color: var(--wa-color-text-quiet);
		}
	}
</style>
