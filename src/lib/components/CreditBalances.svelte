<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import CreditPill from '$lib/components/CreditPill.svelte';

	/**
	 * The balances a page's items pay into or out of, side by side as pills
	 * (`CreditPill`): the viewer's own, and one per partnership, each partner's
	 * marked with their picture. Kept apart rather than added up, because they
	 * are separate balances spent on separate rewards (docs/rewards.md,
	 * "Credits"). The coins at the start label the whole row.
	 */
	let {
		balances
	}: {
		balances: ({ key: string } & ComponentProps<typeof CreditPill>)[];
	} = $props();
</script>

<!-- The coins label the whole row, not one pill: every pill here is credits. -->
{#if balances.length > 0}
	<div class="row">
		<wa-icon class="label" name="coins" variant="solid"></wa-icon>
		<ul class="balances" aria-label="Credits">
			{#each balances as { key, ...balance } (key)}
				<li><CreditPill {...balance} /></li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.label {
		flex: none;
		font-size: 1.125rem;
		color: var(--wa-color-brand-on-normal);
	}

	.balances {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
