<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RouteSheet from '$lib/components/RouteSheet.svelte';
	import TaskCompletionList from '$lib/components/TaskCompletionList.svelte';
	import { shownSpaces } from '$lib/item-pages.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const listHref = resolve('/(auth-required)/(app)/tasks');
	let sheet: RouteSheet | undefined = $state();
	const spaces = $derived(shownSpaces(data.list.spaces, data.contextSpaces));

	/** Opened by its URL, with no list behind it in history: go to the list in its place. */
	function leave() {
		void goto(resolve('/(auth-required)/(app)/tasks'), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}
</script>

<!-- A sheet over the list, which is this route's parent layout (`RouteSheet`). -->
<RouteSheet bind:this={sheet} label="Task history" {listHref} {leave} lightDismiss>
	<p class="intro">Each completion keeps the title, credits, and message it had at the time.</p>
	<TaskCompletionList completions={data.completions} {spaces} emptyMessage="Nothing completed yet." />
</RouteSheet>

<style>
	.intro {
		margin: 0 0 var(--wa-space-m);
		color: var(--wa-color-text-quiet);
	}
</style>
