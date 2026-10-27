<script lang="ts">
	import { shownSpace } from '$lib/context-client.svelte';
	import type { ContextSpaceView } from '$lib/types';

	/**
	 * Whose space something is in: a dot in the space's colour and its name,
	 * "Me" or the partner's. On each row of an Everyone list, and on an item
	 * opened from any context, so it is always clear whose it is. See
	 * docs/contexts.md.
	 */
	let { space }: { space: ContextSpaceView } = $props();

	const shown = $derived(shownSpace(space));
</script>

<span class="chip">
	<span class="dot" style:background={shown.colour} aria-hidden="true"></span>
	{shown.name}
</span>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--wa-color-text-quiet);
		font-size: var(--wa-font-size-s);
	}

	.dot {
		inline-size: 0.5rem;
		block-size: 0.5rem;
		border-radius: 50%;
		flex: none;
	}
</style>
