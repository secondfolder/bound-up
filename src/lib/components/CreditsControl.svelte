<script lang="ts">
	import ContextAvatar from '$lib/components/context/ContextAvatar.svelte';
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import RewardCreditsInline from '$lib/components/RewardCreditsInline.svelte';
	import type { CreditGroup } from '$lib/item-pages.svelte';

	/**
	 * The balances the tasks and rewards pages pay into, at the end of the
	 * header's second line, and a sheet with all of them.
	 *
	 * - In one context, a chip with that space's balances: one or two, by the
	 *   partnership's control (`creditGroups`).
	 * - In Everyone, only the coins and an arrow: with a partnership's two
	 *   balances each, a row of every one grew past two lines on a phone with
	 *   two partners, and they are never added together into one number
	 *   (docs/rewards.md, "Credits").
	 *
	 * Either opens the sheet, a row per space, where the rewards page also
	 * lets the ones the viewer may set be set.
	 */
	let { groups, everyone }: { groups: readonly CreditGroup[]; everyone: boolean } = $props();

	let open = $state(false);
	let dialog: ResponsiveDialog | undefined = $state();

	/** The one space's balances, shown in the chip itself outside Everyone. */
	const inline = $derived(!everyone && groups.length === 1 ? (groups[0]?.entries ?? []) : []);
	const name = $derived(
		inline.length > 0
			? `Credits: ${inline.map((entry) => `${entry.who} ${entry.credits}`).join(', ')}. Show all`
			: 'Credits'
	);
</script>

{#if groups.length > 0}
	<!-- A native button: it opens a dialog rather than being an action of
	     its own, and is drawn as a chip of the pills' kind, which a
	     wa-button's parts would fight. -->
	<button type="button" class="credits-chip" class:bare={inline.length === 0} aria-label={name} onclick={() => {
		open = true;
	}}>
		<wa-icon class="coins" name="coins" variant="solid"></wa-icon>
		{#each inline as entry (entry.key)}
			<span class="entry"><span class="who">{entry.who}</span>
				{' '}<strong>{entry.credits}</strong></span>
		{/each}
		<wa-icon class="arrow" name="chevron-right" variant="solid"></wa-icon>
	</button>
{/if}

{#if open}
	<ResponsiveDialog bind:this={dialog} label="Credits" onclose={() => {
		open = false;
	}}>
		<ul class="groups">
			{#each groups as group (group.spaceId)}
				<li>
					<ContextAvatar kind={group.kind} size={32} people={group.people} />
					<span class="name">{group.name}</span>
					<span class="balances">
						{#each group.entries as entry (entry.key)}
							<RewardCreditsInline
								label={entry.who}
								unit={null}
								credits={entry.credits}
								compact
								editable={entry.editable}
							/>
						{/each}
					</span>
				</li>
			{/each}
		</ul>
		{#if groups.length > 1}
			<p class="fine">
				Each space’s credits are spent on that space’s rewards only, so they are never added
				together.
			</p>
		{/if}
		{#snippet footer()}
			<wa-button appearance="outlined" onclick={() => dialog?.close()}>Done</wa-button>
		{/snippet}
	</ResponsiveDialog>
{/if}

<style>
	.credits-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.625rem;
		min-block-size: 2.5rem;
		margin: 0;
		padding: 0 0.625rem 0 0.75rem;
		border: none;
		border-radius: var(--wa-border-radius-pill);
		background: var(--wa-color-brand-fill-quiet);
		color: var(--wa-color-text-quiet);
		font: inherit;
		font-size: var(--wa-font-size-s);
		cursor: pointer;
		white-space: nowrap;

		&.bare {
			gap: 0.375rem;
		}

		&:hover {
			background: var(--wa-color-brand-fill-normal);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: 2px;
		}

		.coins {
			font-size: 1.125rem;
			color: var(--wa-color-brand-on-normal);
		}

		.arrow {
			font-size: 0.75rem;
			color: var(--wa-color-text-normal);
		}

		strong {
			margin-inline-start: 0.25rem;
			color: var(--wa-color-text-normal);
			font-size: var(--wa-font-size-m);
		}
	}

	.groups {
		margin: 0;
		padding: 0;
		list-style: none;

		li {
			display: flex;
			align-items: center;
			gap: var(--wa-space-s);
			min-block-size: 3.25rem;
			padding-block: var(--wa-space-2xs);

			& + li {
				border-block-start: 1px solid var(--wa-color-surface-border);
			}
		}

		.name {
			flex: 1 1 auto;
			min-inline-size: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			font-weight: var(--wa-font-weight-semibold, 600);
		}

		.balances {
			display: flex;
			flex-wrap: wrap;
			justify-content: flex-end;
			gap: var(--wa-space-xs) var(--wa-space-m);
		}
	}

	.fine {
		margin: var(--wa-space-s) 0 0;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}
</style>
