<script lang="ts">
	import type { PictureRequest } from '$lib/daydream/image-prompt';
	import { addedRuns } from '$lib/word-diff';

	/**
	 * What a picture was made from, in debug mode (docs/debug-mode.md): the
	 * story model's description, or what the image model was asked, exactly,
	 * when that was kept (`PictureRequest`). One field with a toggle between
	 * the two, since they are the same prompt before and after the server's
	 * words go round it. What was sent is shown first, with whatever the
	 * server added muted (`addedRuns`), so the description stands out inside
	 * it. Opened by tapping the picture.
	 */
	let {
		description,
		request,
		onclose
	}: { description: string; request: PictureRequest | null; onclose: () => void } = $props();

	let dialog: HTMLElement | undefined = $state();
	// Opened once per tap, so the request it opens with is the one it shows.
	// svelte-ignore state_referenced_locally
	let showing = $state<'story' | 'image'>(request ? 'image' : 'story');
	const sent = $derived(request ? addedRuns(description, request.positivePrompt) : []);

	/*
	 * Listened for by hand: the change is dispatched by the group, a custom
	 * element whose radios live in shadow roots, and Svelte's delegated
	 * `onchange` does not reliably cross that boundary (AGENTS.md).
	 */
	function listenForChoice(group: HTMLElement) {
		const choose = () => {
			showing = (group as HTMLElement & { value: string }).value === 'image' ? 'image' : 'story';
		};
		group.addEventListener('change', choose);
		return () => group.removeEventListener('change', choose);
	}
</script>

<wa-dialog
	bind:this={dialog}
	label="Picture prompt"
	open
	light-dismiss
	onwa-after-hide={(event: Event) => event.target === dialog && onclose()}
>
	<wa-radio-group
		label="Prompt"
		orientation="horizontal"
		size="s"
		value={showing}
		{@attach listenForChoice}
	>
		<wa-radio appearance="button" value="image">To image model</wa-radio>
		<wa-radio appearance="button" value="story">From story model</wa-radio>
	</wa-radio-group>

	{#if showing === 'story'}
		<p class="source">Described by the story model</p>
		<pre>{description}</pre>
	{:else if request}
		<p class="source">Sent to {request.model}</p>
		<pre>{#each sent as run, index (index)}{#if run.added}<span class="added">{run.text}</span>{:else}{run.text}{/if}{/each}</pre>
		<p class="source">Negative prompt</p>
		<!-- The server's words entirely, so muted throughout. -->
		<pre class="added">{request.negativePrompt}</pre>
	{:else}
		<p class="source">What the image model was asked was not recorded.</p>
	{/if}
</wa-dialog>

<style>
	wa-radio-group {
		margin-block-end: 0.75rem;
	}

	.source {
		margin: 0.75rem 0 0.25rem;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
		overflow-wrap: anywhere;
	}

	/* What the server put round the description, quieter than the
	   description itself. */
	.added {
		color: var(--wa-color-text-quiet);
	}

	pre {
		margin: 0;
		font-family: var(--wa-font-family-code, monospace);
		font-size: var(--wa-font-size-s);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
