<script lang="ts">
	import type { VfxAttachOptions } from '$lib/vfx/context.svelte';
	import VfxProvider from '$lib/vfx/VfxProvider.svelte';
	import VfxHarnessTarget from './VfxHarnessTarget.svelte';

	/**
	 * A provider with one attached element, for testing the pair together —
	 * the attachment reads its host from context, so it needs a component
	 * under the provider to live in.
	 */
	let {
		autoplay = false,
		attached = true,
		options
	}: { autoplay?: boolean; attached?: boolean; options: () => VfxAttachOptions } = $props();
</script>

<VfxProvider {autoplay}>
	<p>child content</p>
	{#if attached}
		<VfxHarnessTarget {options} />
	{/if}
</VfxProvider>
