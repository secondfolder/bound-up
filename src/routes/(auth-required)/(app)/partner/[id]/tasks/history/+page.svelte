<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RouteSheet from '$lib/components/RouteSheet.svelte';
	import TaskCompletionList from '$lib/components/TaskCompletionList.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	/** What the viewer calls them, opened in the browser (`partner-names.svelte.ts`). */
	const partnerShown = $derived(partnerName(data.partner.names));
	const listHref = $derived(
		resolve('/(auth-required)/(app)/partner/[id]/tasks', { id: data.partner.id })
	);
	let sheet: RouteSheet | undefined = $state();

	/** Opened by its URL, with no list behind it in history: go to the list in its place. */
	function leave() {
		void goto(resolve('/(auth-required)/(app)/partner/[id]/tasks', { id: data.partner.id }), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}
</script>

<!-- A sheet over the list, which is this route's parent layout (`RouteSheet`). -->
<RouteSheet
	bind:this={sheet}
	label={`${partnerShown}'s task history`}
	{listHref}
	{leave}
	lightDismiss
>
	<p class="intro">Each completion keeps the title, credits, and message it had at the time.</p>
	<TaskCompletionList completions={data.completions} emptyMessage="Nothing completed yet." />
</RouteSheet>

<style>
	.intro {
		margin: 0 0 var(--wa-space-m);
		color: var(--wa-color-text-quiet);
	}
</style>
