<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RewardEditorBody from '$lib/components/RewardEditorBody.svelte';
	import RouteSheet from '$lib/components/RouteSheet.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	/** What the viewer calls them, opened in the browser (`partner-names.svelte.ts`). */
	const partnerShown = $derived(partnerName(data.partner.names));
	const listHref = $derived(
		resolve('/(auth-required)/(app)/partner/[id]/rewards', { id: data.partner.id })
	);
	let sheet: RouteSheet | undefined = $state();

	/** Opened by its URL, with no list behind it in history: go to the list in its place. */
	function leave() {
		void goto(resolve('/(auth-required)/(app)/partner/[id]/rewards', { id: data.partner.id }), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}
</script>

<!-- A sheet over the list, which is this route's parent layout (`RouteSheet`). -->
<RouteSheet
	bind:this={sheet}
	label={`Edit a reward for ${partnerShown}`}
	{listHref}
	{leave}
>
	<RewardEditorBody
		reward={data.reward}
		partnershipId={data.partner.id}
		onsaved={() => sheet?.close()}
	/>
</RouteSheet>
