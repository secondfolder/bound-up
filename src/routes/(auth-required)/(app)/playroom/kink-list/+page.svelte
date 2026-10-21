<script lang="ts">
	import { resolve } from '$app/paths';
	import KinkListHome from '$lib/components/kink-list/KinkListHome.svelte';
</script>

<svelte:head>
	<title>Kink list · Bound Up</title>
</svelte:head>

<KinkListHome
	back={{
		href: resolve('/(auth-required)/(app)/playroom'),
		text: 'Playroom',
		label: 'Back to the Playroom'
	}}
/>
