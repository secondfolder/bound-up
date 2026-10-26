<script lang="ts">
	import type { WaSelectEvent } from '@awesome.me/webawesome/dist/events/select.js';
	import type { Consideration } from '$lib/scenes/considerations';
	import '$lib/components/choice-controls.css';

	/**
	 * One prompt in the scene designer's column: a question, why it might be
	 * worth a thought, and what to do with it. Add puts a line on the page; a
	 * question's answers each put that answer there. Nothing is required, so
	 * the other choices are only ways to tidy the column: "We've got this" and
	 * "Not for this scene" are remembered in the scene, "Never show me this"
	 * in the person's own settings.
	 */
	let {
		consideration,
		disabled = false,
		onAdd,
		onHandled,
		onDismiss,
		onNeverShow
	}: {
		consideration: Consideration;
		/** Read only: nothing can be added to the page. */
		disabled?: boolean;
		onAdd: (answer?: string) => void;
		onHandled: () => void;
		onDismiss: () => void;
		onNeverShow: () => void;
	} = $props();

	// <wa-dropdown> reports a choice through `wa-select`, which is what also
	// makes it work from the keyboard.
	function choose(event: WaSelectEvent) {
		switch (event.detail.item.getAttribute('value')) {
			case 'handled':
				onHandled();
				break;
			case 'dismiss':
				onDismiss();
				break;
			case 'never':
				onNeverShow();
				break;
			default:
				break;
		}
	}
</script>

<article class="card" data-prompt={consideration.id}>
	<h3>{consideration.title}</h3>
	<p class="why">{consideration.why}</p>
	{#if consideration.answers}
		<div class="answers">
			{#each consideration.answers as answer (answer)}
				<button type="button" class="choice-chip" {disabled} onclick={() => onAdd(answer)}>
					{answer}
				</button>
			{/each}
		</div>
	{/if}
	<div class="actions">
		<wa-button size="s" appearance="outlined" {disabled} onclick={() => onAdd()}>
			<wa-icon slot="start" name="plus"></wa-icon>
			{consideration.answers ? 'Write my own' : 'Add a note'}
		</wa-button>
		<wa-dropdown placement="bottom-end" onwa-select={choose}>
			<wa-button slot="trigger" size="s" appearance="plain" pill>
				<wa-icon name="ellipsis" label="More for “{consideration.title}”"></wa-icon>
			</wa-button>
			<wa-dropdown-item value="handled">We’ve got this</wa-dropdown-item>
			<wa-dropdown-item value="dismiss">Not for this scene</wa-dropdown-item>
			<wa-dropdown-item value="never">Never show me this</wa-dropdown-item>
		</wa-dropdown>
	</div>
</article>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
		padding: var(--wa-space-s) var(--wa-space-m);
		border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		border-radius: var(--wa-border-radius-m);
		background: var(--wa-color-surface-raised);
	}

	h3 {
		margin: 0;
		font-size: var(--wa-font-size-m);
	}

	.why {
		margin: 0;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}

	.answers {
		display: flex;
		flex-wrap: wrap;
		gap: var(--wa-space-2xs);
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
</style>
