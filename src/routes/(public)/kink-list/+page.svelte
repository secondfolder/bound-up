<script lang="ts">
	import DeviceBanner from '$lib/components/kink-list/DeviceBanner.svelte';
	import KinkListHome from '$lib/components/kink-list/KinkListHome.svelte';
</script>

<svelte:head>
	<title>Kink list · Bound Up</title>
	<meta
		name="description"
		content="A private kink list: what you're into, what you're curious about, and your hard limits."
	/>
</svelte:head>

<KinkListHome>
	{#snippet intro()}
		<DeviceBanner />
	{/snippet}
</KinkListHome>
