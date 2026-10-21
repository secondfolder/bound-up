<script lang="ts">
	import type { RawConversation } from '$lib/daydream/raw-conversation.svelte';
	import type { RawExchanges } from '$lib/daydream/raw-exchanges.svelte';
	import type { DaydreamStory } from '$lib/daydream/story.svelte';
	import type { DaydreamTreeNodeView } from '$lib/types';
	import DaydreamRawNode from './DaydreamRawNode.svelte';

	/**
	 * One passage's raw log, from its menu in debug mode (docs/debug-mode.md,
	 * "One passage's raw log"): what its request sent, the model's reasoning,
	 * its reply as it arrived and the metadata it wrote, without switching the
	 * whole thread over to the raw log to find it. Asks for that passage's
	 * exchange alone, and the one before it to compare histories against.
	 */
	let {
		story,
		node,
		exchanges,
		conversation,
		previous,
		system,
		onclose
	}: {
		story: DaydreamStory;
		node: DaydreamTreeNodeView;
		exchanges: RawExchanges;
		conversation: RawConversation;
		previous: DaydreamTreeNodeView | null;
		system: string | null;
		onclose: () => void;
	} = $props();

	let drawer: HTMLElement | undefined = $state();

	const nodeId = $derived(node.id);
	const previousId = $derived(previous?.id ?? null);
	$effect(() => {
		exchanges.load(previousId ? [previousId, nodeId] : [nodeId]);
	});
</script>

<wa-drawer
	bind:this={drawer}
	class="raw-passage"
	label="Raw log for this passage"
	open
	light-dismiss
	onwa-after-hide={(event: Event) => event.target === drawer && onclose()}
>
	{#if exchanges.problem}<p class="invalid" role="alert">{exchanges.problem}</p>{/if}
	<ol>
		<DaydreamRawNode {story} {node} {exchanges} {conversation} {previous} {system} />
	</ol>
</wa-drawer>

<style>
	.raw-passage {
		--size: min(48rem, 100vw);
	}

	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}
</style>
