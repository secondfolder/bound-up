<script lang="ts">
	import { LEVEL_LABELS, type ListPayload, type YourSide } from '$lib/kink-list/answers';
	import { kinkById } from '$lib/kink-list/catalog';
	import { compareLists, GROUP_LABELS, type MatchGroup, sidesLabel } from '$lib/kink-list/compare';

	/**
	 * Two lists side by side (`compareLists`): what you both want, what is
	 * worth exploring or talking about, and their hard limits, which are
	 * always shown. "Not a match" is folded away: it is the least useful thing
	 * to lead with, and still there for anyone who looks.
	 */
	let {
		mine,
		theirs,
		theirName,
		blind = false,
		side = 'both'
	}: {
		mine: ListPayload;
		theirs: ListPayload;
		theirName?: string;
		/**
		 * Only what you both want, and limits: neither of you sees where the
		 * other is lukewarm or not into something, so marking an interest is
		 * never a risk.
		 */
		blind?: boolean;
		/**
		 * Yours: Sub compares only your sub halves with their dom ones, and
		 * leaves out what only a dom does (`pairingsFor`). Limits always show.
		 */
		side?: YourSide;
	} = $props();

	const comparison = $derived(compareLists(mine, theirs, side));
	const them = $derived(theirName?.trim() || 'Them');

	const OPEN = $derived<MatchGroup[]>(
		blind ? ['both', 'explore', 'conditions'] : ['both', 'explore', 'conditions', 'talk']
	);

	function nameOf(key: string): string {
		return kinkById(key)?.name ?? key;
	}
</script>

<div class="compare">
	{#if comparison.overlap.length > 0}
		<section aria-labelledby="compare-overlap">
			<h2 id="compare-overlap">Where you overlap most</h2>
			<ul class="overlap">
				{#each comparison.overlap.slice(0, 6) as { categoryId, both } (categoryId)}
					<li>{kinkById(categoryId)?.name} <span class="count">{both}</span></li>
				{/each}
			</ul>
		</section>
	{/if}

	{#each OPEN as group (group)}
		{#if comparison.groups[group].length > 0}
			<section aria-labelledby="compare-{group}">
				<h2 id="compare-{group}">{GROUP_LABELS[group]} ({comparison.groups[group].length})</h2>
				<ul class="pairs">
					{#each comparison.groups[group] as pairing (`${pairing.key}-${pairing.mySide}`)}
						<li>
							<span class="name">{nameOf(pairing.key)}</span>
							{#if sidesLabel(pairing.key, pairing.mySide)}
								<span class="sides">{sidesLabel(pairing.key, pairing.mySide)}</span>
							{/if}
							<span class="levels"
								>You: {LEVEL_LABELS[pairing.mine]} · {them}: {LEVEL_LABELS[pairing.theirs]}</span
							>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/each}

	<section aria-labelledby="compare-limits">
		<h2 id="compare-limits">{them === 'Them' ? 'Their' : `${them}’s`} hard limits</h2>
		{#if comparison.theirLimits.length === 0}
			<p class="quiet">None.</p>
		{:else}
			<p class="limits">{comparison.theirLimits.map(nameOf).join(', ')}</p>
		{/if}
	</section>

	{#if !blind && comparison.groups.mismatch.length > 0}
		<wa-details summary="{GROUP_LABELS.mismatch} ({comparison.groups.mismatch.length})">
			<ul class="pairs">
				{#each comparison.groups.mismatch as pairing (`${pairing.key}-${pairing.mySide}`)}
					<li>
						<span class="name">{nameOf(pairing.key)}</span>
						<span class="levels"
							>You: {LEVEL_LABELS[pairing.mine]} · {them}: {LEVEL_LABELS[pairing.theirs]}</span
						>
					</li>
				{/each}
			</ul>
		</wa-details>
	{/if}
</div>

<style>
	.compare {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;

		h2 {
			margin: 0 0 0.5rem;
			font-size: 1.1rem;
		}
	}

	.overlap,
	.pairs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;

		/* Web Awesome's native styles indent every <li> for its marker. */
		li {
			margin: 0;
		}
	}

	.overlap {
		flex-direction: row;
		flex-wrap: wrap;
		gap: 0.4rem;

		li {
			padding: 0.2rem 0.6rem;
			border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
			border-radius: var(--wa-border-radius-pill);
		}

		.count {
			color: var(--wa-color-text-quiet);
		}
	}

	.pairs li {
		display: flex;
		flex-direction: column;
		padding-block-end: 0.4rem;
		border-block-end: var(--wa-border-width-s) solid var(--wa-color-surface-border);
	}

	.name {
		font-weight: var(--wa-font-weight-semibold);
	}

	.sides,
	.levels,
	.quiet {
		font-size: 0.875rem;
		color: var(--wa-color-text-quiet);
	}

	.limits {
		margin: 0;
	}
</style>
