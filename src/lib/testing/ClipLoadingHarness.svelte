<script lang="ts">
	import ClipPlayer from '$lib/components/iq-test/ClipPlayer.svelte';
	import type { Clip } from '$lib/playroom/iq-test/media';

	/**
	 * A `ClipPlayer` whose bound `loading` is written where a test can read
	 * it: a component's props cannot be read back from outside it.
	 */
	let { clip }: { clip: Clip } = $props();
	let loading = $state(false);
</script>

<div data-testid="clip-loading" data-loading={loading}>
	<ClipPlayer {clip} bind:loading />
</div>
