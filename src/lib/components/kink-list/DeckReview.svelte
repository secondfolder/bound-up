<script lang="ts">
	import type { Snippet } from 'svelte';
	import { kinkById } from '$lib/kink-list/catalog';
	import { kinkListContext } from '$lib/kink-list/context';
	import { deckReview } from '$lib/kink-list/deck';

	/**
	 * Quick fill, step four: the deck is done. Limits are gathered in one
	 * place to check, conditions are listed with what they say, and skipped
	 * cards can be gone through again. `after` is what the page around it
	 * adds: signed out, the share link and the case for an account.
	 */
	let { onagain, after }: { onagain: () => void; after?: Snippet } = $props();

	const { store, paths } = kinkListContext();

	const review = $derived(deckReview(store.list));

	function nameOf(key: string): string {
		return kinkById(key)?.name ?? store.list.custom[key as `custom:${string}`]?.name ?? key;
	}

	function goThroughSkipped() {
		for (const key of review.skipped) {
			store.setSkipped(key, false);
		}
		onagain();
	}
</script>

<div class="review">
	<h1>That's the lot</h1>
	<p class="intro">Here's what to double-check. You can change anything from the full list.</p>

	<section aria-labelledby="review-limits">
		<h2 id="review-limits">Hard limits</h2>
		{#if review.limits.length === 0 && review.limitCategories.length === 0}
			<p class="quiet">None yet.</p>
		{:else}
			<ul>
				{#each review.limitCategories as categoryId (categoryId)}
					<li>Everything in {kinkById(categoryId)?.name}</li>
				{/each}
				{#each review.limits as key (key)}
					<li>{nameOf(key)}</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if review.conditional.length > 0}
		<section aria-labelledby="review-conditional">
			<h2 id="review-conditional">Conditional</h2>
			<ul>
				{#each review.conditional as key (key)}
					<li>
						{nameOf(key)}{#if store.list.answers[key]?.note}: <span class="note"
								>{store.list.answers[key]?.note}</span
							>{:else}
							<span class="quiet">(no condition written yet)</span>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if review.skipped.length > 0}
		<section aria-labelledby="review-skipped">
			<h2 id="review-skipped">Skipped</h2>
			<p>{review.skipped.length === 1 ? '1 kink' : `${review.skipped.length} kinks`} still to answer.</p>
			<wa-button appearance="outlined" onclick={goThroughSkipped}>Go through skipped</wa-button>
		</section>
	{/if}

	{@render after?.()}

	<wa-button variant="brand" appearance="accent" href={paths.home}>See your whole list</wa-button>
</div>

<style>
	.review {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-inline-size: 32rem;
		margin-inline: auto;

		h1 {
			margin: 0;
			text-align: center;
		}

		h2 {
			margin: 0 0 0.25rem;
			font-size: 1.1rem;
		}

		ul {
			margin: 0;
		}
	}

	.intro {
		margin: 0;
		text-align: center;
		color: var(--wa-color-text-quiet);
	}

	.quiet {
		color: var(--wa-color-text-quiet);
	}

	.note {
		white-space: pre-wrap;
	}
</style>
