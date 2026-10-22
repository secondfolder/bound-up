<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RouteSheet from '$lib/components/RouteSheet.svelte';
	import TaskEditorBody from '$lib/components/TaskEditorBody.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
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
	label={'Edit task'}
	{listHref}
	{leave}
>
	<TaskEditorBody
		taskForm={data.taskForm}
		task={data.task}
		partner={data.partner}
		onsaved={() => sheet?.close()}
	/>
</RouteSheet>
