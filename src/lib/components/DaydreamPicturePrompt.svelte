<script lang="ts">
	import type { PictureRequest } from '$lib/daydream/image-prompt';

	/**
	 * What a picture was made from, in debug mode (docs/debug-mode.md): the
	 * story model's description, and what the image model was asked, exactly,
	 * when that was kept (`PictureRequest`). Opened by tapping the picture.
	 */
	let {
		description,
		request,
		onclose
	}: { description: string; request: PictureRequest | null; onclose: () => void } = $props();

	let dialog: HTMLElement | undefined = $state();
</script>

<wa-dialog
	bind:this={dialog}
	label="Picture prompt"
	open
	onwa-after-hide={(event: Event) => event.target === dialog && onclose()}
>
	<h3>Described by the story model</h3>
	<pre>{description}</pre>
	{#if request}
		<h3>Sent to {request.model}</h3>
		<pre>{request.positivePrompt}</pre>
		<h3>Negative prompt</h3>
		<pre>{request.negativePrompt}</pre>
	{:else}
		<p class="note">What the image model was asked was not recorded.</p>
	{/if}
</wa-dialog>

<style>
	h3 {
		margin: 0.75rem 0 0.25rem;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);

		&:first-child {
			margin-block-start: 0;
		}
	}

	pre {
		margin: 0;
		font-family: var(--wa-font-family-code, monospace);
		font-size: var(--wa-font-size-s);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.note {
		margin: 0.75rem 0 0;
		color: var(--wa-color-text-quiet);
	}
</style>
