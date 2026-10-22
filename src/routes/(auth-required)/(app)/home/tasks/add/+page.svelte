<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RouteSheet from '$lib/components/RouteSheet.svelte';
	import TaskEditorBody from '$lib/components/TaskEditorBody.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const listHref = $derived(resolve('/(auth-required)/(app)/home/tasks'));
	let sheet: RouteSheet | undefined = $state();

	/** Opened by its URL, with no list behind it in history: go to the list in its place. */
	function leave() {
		void goto(resolve('/(auth-required)/(app)/home/tasks'), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}
</script>

<!-- A sheet over the list, which is this route's parent layout (`RouteSheet`). -->
<RouteSheet
	bind:this={sheet}
	label={'Add a task'}
	{listHref}
	{leave}
>
	<p class="intro">This task belongs only to you and adds its credits to your own reward balance when you complete it.</p>
	<TaskEditorBody taskForm={data.taskForm} onsaved={() => sheet?.close()} />
</RouteSheet>

<style>
	.intro {
		margin: 0 0 var(--wa-space-m);
		color: var(--wa-color-text-quiet);
	}
</style>
