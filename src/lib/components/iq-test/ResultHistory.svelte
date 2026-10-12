<script lang="ts">
	import { describeSettings } from '$lib/playroom/iq-test/copy';
	import type { IqTestResultView } from '$lib/types';

	/**
	 * Past results, newest first: the account's when signed in, this device's
	 * otherwise. The list does not care which.
	 */
	let {
		results,
		ondelete,
		onclear,
		deleting = null,
		hrefFor
	}: {
		results: readonly IqTestResultView[];
		ondelete: (result: IqTestResultView) => void;
		/**
		 * Clear the lot. Only for this device's history: an account's is
		 * deleted one result at a time, so a slip cannot wipe it.
		 */
		onclear?: () => void;
		/** The id being deleted, so its button can show it. */
		deleting?: string | null;
		/** Where a result's own page is, when it has one: its date links there. */
		hrefFor?: (result: IqTestResultView) => string | null;
	} = $props();

	/** Clearing asks once, inline, before it happens. */
	let confirming = $state(false);

	const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

	/**
	 * How the test was taken. Not who took it: the role is kept with the result
	 * but left out here, where a dom and a sub may be reading the same list.
	 */
	const hrefs = $derived(new Map(results.map((result) => [result.id, hrefFor?.(result) ?? null])));

	function summarise(result: IqTestResultView): string {
		return describeSettings({ intensity: result.intensity, vibe: result.vibe }).join(' · ');
	}
</script>

{#if results.length > 0}
	<ol class="history" data-testid="iq-history">
		{#each results as result (result.id)}
			<li>
				<span class="iq"><span class="iq-label">IQ</span> {result.iq}</span>
				<span class="details">
					{#if hrefs.get(result.id)}
						<a href={hrefs.get(result.id)}
							><time datetime={result.createdAt.toISOString()}>{formatter.format(result.createdAt)}</time></a
						>
					{:else}
						<time datetime={result.createdAt.toISOString()}>{formatter.format(result.createdAt)}</time>
					{/if}
					<span class="settings">{summarise(result)}</span>
				</span>
				<wa-button
					appearance="plain"
					size="s"
					disabled={deleting === result.id}
					onclick={() => ondelete(result)}
				>
					<wa-icon name="trash" variant="solid" label="Delete the result from {formatter.format(result.createdAt)}"></wa-icon>
				</wa-button>
			</li>
		{/each}
	</ol>
	{#if onclear}
		<div class="clear">
			{#if confirming}
				<span>Clear all {results.length} from this device?</span>
				<wa-button size="s" appearance="plain" onclick={() => {
						confirming = false;
					}}>Keep them</wa-button>
				<wa-button
					size="s"
					variant="danger"
					onclick={() => {
						confirming = false;
						onclear?.();
					}}>Clear history</wa-button
				>
			{:else}
				<wa-button size="s" appearance="plain" onclick={() => {
						confirming = true;
					}}
					>Clear history on this device</wa-button
				>
			{/if}
		</div>
	{/if}
{:else}
	<p class="empty">No earlier results yet.</p>
{/if}

<style>
	.history {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;

		li {
			display: grid;
			grid-template-columns: 5.5rem 1fr auto;
			align-items: center;
			gap: 0.75rem;
			padding: 0.5rem 0;
			border-block-end: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		}

		.iq {
			font-size: 1.5rem;
			font-weight: 800;
			font-variant-numeric: tabular-nums;
			text-align: end;
			white-space: nowrap;

			.iq-label {
				font-size: 0.6em;
				font-weight: 600;
				color: var(--wa-color-text-quiet);
			}
		}

		.details {
			display: flex;
			flex-direction: column;
			font-size: 0.875rem;
		}

		.settings {
			color: var(--wa-color-text-quiet);
		}
	}

	.clear {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-block-start: 0.5rem;
		font-size: 0.875rem;
	}

	.empty {
		color: var(--wa-color-text-quiet);
		margin: 0;
	}
</style>
