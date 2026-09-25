<script lang="ts">
	import { getVfx, type VfxAttachOptions } from '$lib/vfx/context.svelte';

	/** An element attached to the surrounding provider, for its tests. */
	let { options }: { options: () => VfxAttachOptions } = $props();

	const host = getVfx();
</script>

<div data-testid="vfx-target" {@attach host.attach(options)}>target</div>
