<script lang="ts">
	import SummaryBlank from '$lib/components/SummaryBlank.svelte';

	/** A `SummaryBlank` in a sentence, for its test: a plain one, or one with a menu. */
	let { menu, onclick }: { menu: boolean; onclick?: () => void } = $props();
</script>

<p>
	You ride {#if menu}<SummaryBlank label="the night train"
			>{#snippet items()}<wa-dropdown-item value="a">Another train</wa-dropdown-item>{/snippet}</SummaryBlank
		>{:else}<SummaryBlank label="the night train" {onclick} />{/if} home.
</p>
