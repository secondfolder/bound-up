<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import RewardCreditsInline from '$lib/components/RewardCreditsInline.svelte';
	import { initialsFor } from '$lib/initials';

	/**
	 * One balance as a pill: a partner's picture when it is a partnership's,
	 * whose it is, and the number, which counts up or down as it changes
	 * (`RewardCreditsInline`) and can be edited where the viewer may set it.
	 * Shown in a row of them (`CreditBalances`) on the tasks and rewards pages.
	 */
	let {
		label,
		credits,
		partner = null,
		editable = null
	}: {
		/** "Yours", "With Jun", "Jun". */
		label: string;
		credits: number;
		/** The partner whose partnership it is, for their picture; none for the viewer's own. */
		partner?: { name: string; image: string | null } | null;
		/** How it is edited, where the viewer may set it. */
		editable?: ComponentProps<typeof RewardCreditsInline>['editable'];
	} = $props();
</script>

<span class={['pill', { 'with-avatar': Boolean(partner) }]}>
	{#if partner}
		<wa-avatar
			image={partner.image ?? undefined}
			initials={initialsFor(partner.name)}
			label={partner.name}
		></wa-avatar>
	{/if}
	<RewardCreditsInline {label} unit={null} {credits} compact {editable} />
</span>

<style>
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-block-size: 2rem;
		padding: 0.125rem 0.75rem;
		border-radius: var(--wa-border-radius-pill);
		background: var(--wa-color-brand-fill-quiet);
		font-size: 0.875rem;

		/* Tighter on the side a partner's picture sits. */
		&.with-avatar {
			padding-inline-start: 0.25rem;
		}
	}

	wa-avatar {
		--size: 1.5rem;
		flex: none;
	}
</style>
