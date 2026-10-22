<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RewardEditorBody from '$lib/components/RewardEditorBody.svelte';
	import RouteSheet from '$lib/components/RouteSheet.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const listHref = $derived(resolve('/(auth-required)/(app)/home/rewards'));
	let sheet: RouteSheet | undefined = $state();

	/** Opened by its URL, with no list behind it in history: go to the list in its place. */
	function leave() {
		void goto(resolve('/(auth-required)/(app)/home/rewards'), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}
</script>

<!-- A sheet over the list, which is this route's parent layout (`RouteSheet`). -->
<RouteSheet
	bind:this={sheet}
	label={'Edit reward'}
	{listHref}
	{leave}
>
	<RewardEditorBody reward={data.reward} onsaved={() => sheet?.close()} />
</RouteSheet>
