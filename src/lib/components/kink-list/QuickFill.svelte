<script lang="ts">
	import type { Snippet } from 'svelte';
	import { kinkListContext } from '$lib/kink-list/context';
	import { deckCards } from '$lib/kink-list/deck';
	import Deck from './Deck.svelte';
	import DeckReview from './DeckReview.svelte';
	import KinkListCrumbs from './KinkListCrumbs.svelte';
	import SaveStatus from './SaveStatus.svelte';
	import TriageGrid from './TriageGrid.svelte';

	/**
	 * Quick fill: the four steps, in one place. Triage (which areas, and any to
	 * rule out wholesale), the deck (one card per kink, with each kink's
	 * specifics dealt in after a yes), and the review. Moving between them is
	 * state on this page rather than separate URLs: the deck is worked out from
	 * the list, so a reload just lands back on triage with nothing lost.
	 */
	let { reviewExtra }: { reviewExtra?: Snippet } = $props();

	const { store, paths } = kinkListContext();

	let step: 'triage' | 'deck' | 'review' = $state('triage');
	const remaining = $derived(deckCards(store.list).length);
</script>

<KinkListCrumbs href={paths.home} text="Kink list" label="Back to kink list">
	<SaveStatus />
</KinkListCrumbs>

{#if step === 'triage'}
	<TriageGrid
		{remaining}
		onstart={() => {
			step = remaining === 0 ? 'review' : 'deck';
		}}
	/>
{:else if step === 'deck'}
	<Deck
		ondone={() => {
			step = 'review';
		}}
	/>
{:else}
	<DeckReview
		after={reviewExtra}
		onagain={() => {
			step = 'deck';
		}}
	/>
{/if}

