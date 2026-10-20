<script lang="ts">
	import type { PromptMessage } from '$lib/daydream/client';
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import { PENDING_TEXT } from '$lib/sealed-views.svelte';
	import type { DaydreamTreeNodeView } from '$lib/types';
	import DaydreamPicture from './DaydreamPicture.svelte';
	import DaydreamRawEnding from './DaydreamRawEnding.svelte';
	import { startOpen } from './details';

	/**
	 * One turn of the story as debug mode's raw log shows it
	 * (docs/debug-mode.md): for a passage, the model's reasoning and its reply
	 * exactly as they arrived, when they were kept (`raw`, turn v4;
	 * `received`, turn v7), how the reply ended, and its picture with the
	 * prompts it was made from; for any turn, what is stored,
	 * as JSON; and for a passage, the prompt that would write it, rebuilt by
	 * the server on request. Nothing here acts on the story.
	 */
	let { story, node }: { story: DaydreamStory; node: DaydreamTreeNodeView } = $props();

	const content = $derived(story.content(node.id));
	const pictureRequest = $derived(story.pictureRequest(node.id));
	const received = $derived(content?.type === 'text' ? (content.received ?? null) : null);

	/** What is stored, less the raw reply shown above it. */
	const stored = $derived.by(() => {
		if (!content) {
			return null;
		}
		if (content.type !== 'text') {
			return JSON.stringify(content, null, 2);
		}
		const { raw: _raw, rawTruncated: _truncated, received: _received, ...rest } = content;
		return JSON.stringify(rest, null, 2);
	});

	let prompt: { messages: PromptMessage[] } | { error: string } | 'loading' | null = $state(null);

	async function showPrompt() {
		prompt = 'loading';
		const result = await story.promptFor(node.id);
		prompt = result.ok ? { messages: result.messages } : { error: result.error };
	}
</script>

<li class="raw" class:story={node.role === 'story'} data-turn-id={node.id}>
	<span class="who">{node.role === 'story' ? 'Model' : 'You'} · {node.id}</span>
	{#if content === undefined}
		<p>{PENDING_TEXT}</p>
	{:else if content === null}
		<p>This turn will not open here.</p>
	{:else}
		{#if node.role === 'story'}
			{#if received?.reasoning || received?.reasoningTruncated}
				<wa-details summary="Reasoning" appearance="plain">
					{#if received.reasoning}<pre>{received.reasoning}</pre>{/if}
					{#if received.reasoningTruncated}
						<p class="note">The reasoning ran on past this, and only its start was kept.</p>
					{/if}
				</wa-details>
			{/if}
			{#if content.type === 'text' && content.raw}
				<pre class="reply">{content.raw}</pre>
				{#if content.rawTruncated}
					<p class="note">The reply ran on past this, and only its start was kept.</p>
				{/if}
			{:else}
				<p class="note">Raw reply not recorded.</p>
			{/if}
			<DaydreamRawEnding {received} />
			{#if content.type === 'text' && content.meta?.image}
				<!-- The passage's picture, beside what it was made from: the story
				     model's description, and what the image model was asked. -->
				<div class="picture">
					<DaydreamPicture {story} turnId={node.id} />
					<wa-details summary="Picture prompt" appearance="plain" {@attach startOpen(true)}>
						<span class="role">Described by the story model</span>
						<pre>{content.meta.image}</pre>
						{#if pictureRequest}
							<span class="role">Sent to {pictureRequest.model}</span>
							<pre>{pictureRequest.positivePrompt}</pre>
							<span class="role">Negative prompt</span>
							<pre>{pictureRequest.negativePrompt}</pre>
						{:else}
							<p class="note">What the image model was asked was not recorded.</p>
						{/if}
					</wa-details>
				</div>
			{/if}
		{/if}
		<wa-details summary="Stored" appearance="plain">
			<pre>{stored}</pre>
		</wa-details>
		{#if node.role === 'story'}
			{#if prompt === null}
				<wa-button size="s" appearance="outlined" onclick={showPrompt}>Show prompt</wa-button>
			{:else if prompt === 'loading'}
				<wa-spinner></wa-spinner>
			{:else if 'error' in prompt}
				<p class="note" role="alert">{prompt.error}</p>
			{:else}
				<wa-details
					summary="Prompt, rebuilt from the story as it is now"
					appearance="plain"
					{@attach startOpen(true)}
				>
					<ol class="messages">
						{#each prompt.messages as message, index (index)}
							<li>
								<span class="role">{message.role}</span>
								<pre>{message.content}</pre>
							</li>
						{/each}
					</ol>
				</wa-details>
			{/if}
		{/if}
	{/if}
</li>

<style>
	.raw {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		border: 1px dashed var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-m);
		font-size: var(--wa-font-size-s);

		&.story {
			background: var(--wa-color-surface-raised);
		}

		.who,
		.note,
		.role {
			color: var(--wa-color-text-quiet);
		}

		.note {
			margin: 0;
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

		.picture {
			display: flex;
			flex-direction: column;
			gap: 0.375rem;
		}

		.messages {
			list-style: none;
			margin: 0;
			padding: 0;
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
		}

		wa-button {
			align-self: flex-start;
		}
	}
</style>
