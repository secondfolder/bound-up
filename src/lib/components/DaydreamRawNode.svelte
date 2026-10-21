<script lang="ts">
	import type { RawConversation } from '$lib/daydream/raw-conversation.svelte';
	import type { RawExchanges } from '$lib/daydream/raw-exchanges.svelte';
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import type { DaydreamTreeNodeView } from '$lib/types';
	import DaydreamRawExchange from './DaydreamRawExchange.svelte';
	import DaydreamRawSent from './DaydreamRawSent.svelte';
	import DaydreamRawTurn from './DaydreamRawTurn.svelte';

	/**
	 * One turn as debug mode's raw log draws it (docs/debug-mode.md,
	 * "Daydreams' raw log"): for a passage, the exchange that wrote it, or
	 * what it kept itself when it was written before exchanges were; then the
	 * turn as stored; then any request after it that failed or was stopped.
	 * The same for the whole branch in the thread and for one passage in its
	 * own drawer (`DaydreamRawPassage`), so the two cannot drift. Renders
	 * `<li>`s, for a list the caller owns.
	 */
	let {
		story,
		node,
		exchanges,
		conversation,
		previous,
		system
	}: {
		story: DaydreamStory;
		node: DaydreamTreeNodeView;
		exchanges: RawExchanges;
		conversation: RawConversation;
		/** The passage before this turn on the branch: the request this one's should add to. */
		previous: DaydreamTreeNodeView | null;
		/** The system prompt heading the log, for a passage from before exchanges were kept. */
		system: string | null;
	} = $props();

	const exchange = $derived(node.role === 'story' ? exchanges.forTurn(node.id) : null);
	const previousExchange = $derived(previous ? (exchanges.forTurn(previous.id) ?? null) : null);
	// A request after a passage added to that passage; after the user's turn, to the one before it.
	const failedBefore = $derived(node.role === 'story' ? node : previous);
	const failedBeforeExchange = $derived(
		failedBefore ? (exchanges.forTurn(failedBefore.id) ?? null) : null
	);
</script>

{#if node.role === 'story'}
	{#if exchange}
		<DaydreamRawExchange {exchange} previous={previousExchange} />
	{:else if exchange === null}
		<DaydreamRawSent {story} {conversation} {node} {previous} {system} />
	{:else}
		<li class="raw-loading"><wa-spinner></wa-spinner></li>
	{/if}
{/if}
<DaydreamRawTurn {story} {node} exchanged={Boolean(exchanges.forTurn(node.id))} />
{#each exchanges.failedAfter(node.id) as failed (failed.id)}
	<DaydreamRawExchange exchange={failed} previous={failedBeforeExchange} />
{/each}

<style>
	.raw-loading {
		display: flex;
		justify-content: center;
	}
</style>
