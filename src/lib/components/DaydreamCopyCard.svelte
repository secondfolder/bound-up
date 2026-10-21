<script lang="ts">
	import type { CopyState } from '$lib/daydream/chips';

	/**
	 * A character or idea as a daydream has it: its own copy, so editing or
	 * deleting the library's never changes a story under way. When the
	 * library's has been edited since, it says so and offers the newer
	 * version, or to keep this one; a copy with no library record can be saved
	 * to the library.
	 */
	let {
		title,
		summary,
		state,
		kindName,
		onedit,
		onremove,
		onuselatest,
		latestReady = true,
		onkeep,
		onsave
	}: {
		title: string;
		summary: string;
		state: CopyState;
		/** "characters" or "ideas", for the save button's words. */
		kindName: string;
		onedit: () => void;
		onremove?: (() => void) | undefined;
		onuselatest: () => void;
		/** Whether the library's version has opened here, so taking it can do something. */
		latestReady?: boolean;
		onkeep: () => void;
		onsave: () => void;
	} = $props();
</script>

<wa-card class="copy">
	<div class="body">
		<div class="text">
			<strong>{title}</strong>
			{#if summary}<span class="summary">{summary}</span>{/if}
		</div>
		<div class="actions">
			<!-- "Edit" to see, the name for a screen reader: in full, "Edit After
			     hours" squeezed the idea's line to a word a line on a phone. -->
			<wa-button size="s" appearance="outlined" onclick={onedit}
				>Edit <span class="wa-visually-hidden">{title}</span></wa-button
			>
			{#if onremove}
				<wa-button size="s" appearance="plain" onclick={onremove}>
					<wa-icon name="xmark" variant="solid" label={`Remove ${title}`}></wa-icon>
				</wa-button>
			{/if}
		</div>
	</div>
	{#if state === 'updated'}
		<div class="sync">
			<span>Updated in your library since.</span>
			<wa-button size="s" appearance="outlined" variant="brand" disabled={!latestReady} onclick={onuselatest}>Use the latest</wa-button>
			<wa-button size="s" appearance="plain" onclick={onkeep}>Keep this version</wa-button>
		</div>
	{:else if state === 'unsaved' || state === 'missing'}
		<div class="sync">
			<span>{state === 'missing' ? 'No longer in your library.' : 'Only in this daydream.'}</span>
			<wa-button size="s" appearance="plain" onclick={onsave}>Save to my {kindName}</wa-button>
		</div>
	{/if}
</wa-card>

<style>
	/* A smaller inset than wa-card's own: inside a fieldset that already
	   pads it, the default made a box in a box in a box. */
	.copy {
		--spacing: var(--wa-space-m);
	}

	/* Centred against the buttons: top-aligned, a name with no summary sat
	   above the middle of a card held open by the button beside it. */
	.body {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-inline-size: 0;

		.summary {
			font-size: 0.875rem;
			color: var(--wa-color-text-quiet);
			overflow-wrap: anywhere;
		}
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex: none;
	}

	.sync {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
		margin-block-start: 0.5rem;
		font-size: 0.875rem;
		color: var(--wa-color-text-quiet);
	}
</style>
