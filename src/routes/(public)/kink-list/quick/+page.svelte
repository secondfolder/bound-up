<script lang="ts">
	import DeviceBanner from '$lib/components/kink-list/DeviceBanner.svelte';
	import QuickFill from '$lib/components/kink-list/QuickFill.svelte';
	import ShareLink from '$lib/components/kink-list/ShareLink.svelte';
</script>

<svelte:head>
	<title>Quick fill · Kink list · Bound Up</title>
</svelte:head>

<QuickFill>
	{#snippet reviewExtra()}
		<DeviceBanner />
		<section aria-labelledby="share-title">
			<h2 id="share-title">Share it</h2>
			<ShareLink />
		</section>
	{/snippet}
</QuickFill>
