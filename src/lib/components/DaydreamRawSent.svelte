<script lang="ts">
	import { passageAsSent } from '$lib/daydream/context';
	import type { RawConversation } from '$lib/daydream/raw-conversation.svelte';
	import { appendedToPrevious, type SentRecord } from '$lib/daydream/sent-record';
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import type { DaydreamTreeNodeView } from '$lib/types';

	/**
	 * What one request added to the conversation, in debug mode's raw log
	 * (docs/debug-mode.md): every request is the one before it with more on
	 * the end, so this is all of it that is new — the opening's request,
	 * Continue, a button's note, the user's words as the model got them, the
	 * buttons on screen. Its side of the thread says who it was to.
	 *
	 * From the passage's own record of what was sent (`sent`), when it has
	 * one, with a check that its history was the request before plus that
	 * request's reply. A passage written before records were kept is rebuilt
	 * from the story instead, and says so.
	 */
	let {
		story,
		conversation,
		node,
		previous,
		system
	}: {
		story: DaydreamStory;
		conversation: RawConversation;
		node: DaydreamTreeNodeView;
		/** The passage before this one on the branch, if any: the request this one should add to. */
		previous: DaydreamTreeNodeView | null;
		/** The system prompt shown at the top of the log, or null while it is not known. */
		system: string | null;
	} = $props();

	const content = $derived(story.content(node.id));
	const record: SentRecord | null = $derived(
		content?.type === 'text' ? (content.sent ?? null) : null
	);
	const previousContent = $derived(previous ? story.content(previous.id) : null);

	/** Whether this request only added to the one before; null when it cannot be told. */
	let appended: boolean | null = $state(null);
	$effect(() => {
		const recorded = record;
		const before =
			previousContent?.type === 'text' && previousContent.sent
				? {
						record: previousContent.sent,
						// As the model was shown it in the history after it.
						passage: passageAsSent(previousContent.text, previousContent.meta?.expansion)
					}
				: null;
		if (!recorded || (previous && !before)) {
			appended = null;
			return;
		}
		let current = true;
		void appendedToPrevious(recorded, before).then((result) => {
			if (current) {
				appended = result;
			}
		});
		return () => {
			current = false;
		};
	});

	const rebuilt = $derived(record ? undefined : conversation.state(node.id));
	$effect(() => {
		// Rebuilt only for a passage that recorded nothing; asked once it is drawn.
		if (content !== undefined && !record) {
			conversation.load(node.id);
		}
	});

	const shown = $derived.by(() => {
		if (record) {
			return { system: record.system, added: record.added };
		}
		if (rebuilt && rebuilt !== 'loading' && !('error' in rebuilt)) {
			return { system: rebuilt.system, added: rebuilt.sent.map((message) => message.content) };
		}
		return null;
	});
</script>

<li class="sent" data-sent-before={node.id}>
	{#if content === undefined || (!record && (rebuilt === undefined || rebuilt === 'loading'))}
		<wa-spinner></wa-spinner>
	{:else if !record && rebuilt && rebuilt !== 'loading' && 'error' in rebuilt}
		<p class="note" role="alert">{rebuilt.error}</p>
	{:else if shown}
		{#if !record}
			<p class="note">
				Not recorded when this passage was written, so rebuilt from the story as it is now.
			</p>
		{/if}
		{#if system !== null && shown.system !== system}
			<!-- A check-in after Stop the scene is asked for under a system prompt of
			     its own, and a setup changed since sends another: shown where it was. -->
			<wa-details summary="A different system prompt, for this request" appearance="plain">
				<pre>{shown.system}</pre>
			</wa-details>
		{/if}
		{#each shown.added as message, index (index)}
			<pre class="message">{message}</pre>
		{:else}
			<p class="note">Nothing new: the model was asked again with the story as it stood.</p>
		{/each}
		{#if record?.truncated}
			<p class="note">Longer than a passage can keep, so only its start was recorded.</p>
		{/if}
		{#if appended === false}
			<p class="note" role="note" data-not-appended>
				The history sent with this request was not the request before plus its reply: something
				earlier in the story was sent differently this time.
			</p>
		{/if}
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
