<script lang="ts">
	import type { RawConversation } from '$lib/daydream/raw-conversation.svelte';
	import type { DaydreamStory } from '$lib/daydream/story.svelte';

	/**
	 * The system prompt, once, at the top of debug mode's raw log
	 * (docs/debug-mode.md). Every request in a story sends the same one, so it
	 * is shown once rather than with each passage; a request that sent another
	 * (a check-in after Stop the scene) shows its own (`DaydreamRawSent`).
	 * The newest passage's record of what it sent, or, for one written before
	 * records were kept, rebuilt with the setup as it is now, which it says.
	 */
	let {
		story,
		conversation,
		turnId
	}: { story: DaydreamStory; conversation: RawConversation; turnId: string } = $props();

	const content = $derived(story.content(turnId));
	const recorded = $derived(content?.type === 'text' ? (content.sent?.system ?? null) : null);
	const rebuilt = $derived(recorded === null ? conversation.state(turnId) : undefined);

	$effect(() => {
		if (content !== undefined && recorded === null) {
			conversation.load(turnId);
		}
	});
</script>

<li class="system" data-raw-system>
	{#if recorded !== null}
		<wa-details summary="System prompt" appearance="plain">
			<pre>{recorded}</pre>
		</wa-details>
	{:else if rebuilt === undefined || rebuilt === 'loading'}
		<wa-spinner></wa-spinner>
	{:else if 'error' in rebuilt}
		<p class="note" role="alert">{rebuilt.error}</p>
	{:else}
		<wa-details summary="System prompt, rebuilt: not recorded when written" appearance="plain">
			<pre>{rebuilt.system}</pre>
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
