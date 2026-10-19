<script lang="ts">
	import { onMount } from 'svelte';
	import type { RawConversation } from '$lib/daydream/raw-conversation.svelte';
	import type { DaydreamTreeNodeView } from '$lib/types';

	/**
	 * What one request added to the conversation, in debug mode's raw log
	 * (docs/debug-mode.md): every request is the one before it with more on
	 * the end, so this is all of it that is new — the opening's request,
	 * Continue, a button's note, the user's words as the model got them, the
	 * buttons on screen. Its side of the thread says who it was to. Rebuilt
	 * (`DaydreamStory.promptFor`), like "Show prompt". The system prompt is
	 * shown once, above the log (`DaydreamRawSystem`); a request that sent
	 * another one shows its own.
	 */
	let {
		conversation,
		node,
		system
	}: {
		conversation: RawConversation;
		node: DaydreamTreeNodeView;
		/** The system prompt shown at the top of the log, or null while it is not known. */
		system: string | null;
	} = $props();

	const state = $derived(conversation.state(node.id));

	// Asked once it is drawn, not while rendering: asking writes the state it reads.
	onMount(() => {
		conversation.load(node.id);
	});
</script>

<li class="sent" data-sent-before={node.id}>
	{#if state === undefined || state === 'loading'}
		<wa-spinner></wa-spinner>
	{:else if 'error' in state}
		<p class="note" role="alert">{state.error}</p>
	{:else}
		{#if system !== null && state.system !== system}
			<!-- A check-in after Stop the scene is asked for under a system prompt
			     of its own; every other request sends the one at the top. -->
			<wa-details summary="A different system prompt, for this request" appearance="plain">
				<pre>{state.system}</pre>
			</wa-details>
		{/if}
		{#each state.sent as message, index (index)}
			<pre class="message">{message.content}</pre>
		{:else}
			<p class="note">Nothing new: the model was asked again with the story as it stood.</p>
		{/each}
	{/if}
</li>

<style>
	.sent {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		align-self: flex-end;
		max-inline-size: 90%;
		padding: 0.5rem 0.75rem;
		border: 1px dashed var(--wa-color-brand-border-quiet, var(--wa-color-surface-border));
		border-radius: var(--wa-border-radius-m);
		background: var(--wa-color-brand-fill-quiet);
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
