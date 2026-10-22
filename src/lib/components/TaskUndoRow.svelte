<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { enhance } from '$app/forms';
	import ItemRow from '$lib/components/ItemRow.svelte';
	import { reportRequestFailure } from '$lib/request-failure.svelte';

	/**
	 * What stands in a task's place for a few seconds after it is ticked off:
	 * "Completed", and an Undo. It replaced a toast at the bottom of the page,
	 * which was a long way from the circle that had just been tapped — and a
	 * circle in a list is far easier to tap by mistake than the button it
	 * replaced. The undo is real, on the server, and the server decides whether
	 * it is still allowed (docs/tasks.md, "Undoing a completion"); this only
	 * offers it.
	 */
	let {
		title,
		creditsAwarded,
		action,
		completionId,
		partnershipId = null,
		onhold
	}: {
		title: string;
		creditsAwarded: number;
		/** The form action that undoes it. */
		action: string;
		completionId: string;
		/** Posted with it, for a partnership task undone from `/home/tasks`. */
		partnershipId?: string | null;
		/** Called with true while the line is pointed at or focused, so it is not taken away then. */
		onhold: (held: boolean) => void;
	} = $props();

	let busy = $state(false);

	const undo: SubmitFunction = () => {
		busy = true;
		return async ({ result, update }) => {
			try {
				if (result.type === 'error') {
					reportRequestFailure(result.error);
					return;
				}
				// A refusal lands in the page's `form.error` like any other.
				await update();
			} finally {
				busy = false;
			}
		};
	};
</script>

<ItemRow
	{title}
	celebrating
	onpointerenter={() => onhold(true)}
	onpointerleave={() => onhold(false)}
	onfocusin={() => onhold(true)}
	onfocusout={() => onhold(false)}
>
	{#snippet leading()}
		<span class="done" aria-hidden="true"><wa-icon name="check" variant="solid"></wa-icon></span>
	{/snippet}

	{#snippet meta()}
		<span>Completed{creditsAwarded > 0 ? ` · +${creditsAwarded}` : ''}</span>
	{/snippet}

	{#snippet trailing()}
		<form method="POST" {action} use:enhance={undo}>
			<input type="hidden" name="completionId" value={completionId} />
			{#if partnershipId}<input type="hidden" name="partnershipId" value={partnershipId} />{/if}
			<wa-button type="submit" appearance="outlined" size="s" disabled={busy}>Undo</wa-button>
		</form>
	{/snippet}
</ItemRow>

<style>
	.done {
		display: grid;
		place-items: center;
		inline-size: 1.75rem;
		block-size: 1.75rem;
		border-radius: 50%;
		background: var(--wa-color-brand-fill-loud);
		color: var(--wa-color-brand-on-loud);
		font-size: 0.875rem;
	}

	form {
		display: contents;
	}
</style>
