<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RewardEditorBody from '$lib/components/RewardEditorBody.svelte';
	import RouteSheet from '$lib/components/RouteSheet.svelte';
	import { partnerIn } from '$lib/item-pages.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const listHref = resolve('/(auth-required)/(app)/rewards');
	let sheet: RouteSheet | undefined = $state();
	const forName = $derived(partnerIn(data.space.id, data.contextSpaces));

	/** Opened by its URL, with no list behind it in history: go to the list in its place. */
	function leave() {
		void goto(resolve('/(auth-required)/(app)/rewards'), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}
</script>

<!-- A sheet over the list, which is this route's parent layout (`RouteSheet`). -->
<RouteSheet
	bind:this={sheet}
	label={forName ? `Edit a reward for ${forName}` : 'Edit reward'}
	{listHref}
	{leave}
>
	<RewardEditorBody
		reward={data.reward}
		target={{ spaceId: data.space.id, kind: data.space.kind }}
		onsaved={() => sheet?.close()}
	/>
</RouteSheet>
