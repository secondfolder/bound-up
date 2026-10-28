<script lang="ts">
	import { resolve } from '$app/paths';
	import ContextSwitcher from '$lib/components/context/ContextSwitcher.svelte';
	import KinkListHome from '$lib/components/kink-list/KinkListHome.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
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
>
	{#snippet corner()}
		<!-- Me and Everyone are this list; a partner is your list for them,
		     where this page's load sends a switch to one. -->
		<ContextSwitcher spaces={data.contextSpaces} context={data.context} you={data.user?.name ?? ''} />
	{/snippet}
</KinkListHome>
