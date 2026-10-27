<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RouteSheet from '$lib/components/RouteSheet.svelte';
	import TaskEditorBody from '$lib/components/TaskEditorBody.svelte';
	import type { ItemTarget } from '$lib/item-target';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const listHref = resolve('/(auth-required)/(app)/tasks');
	let sheet: RouteSheet | undefined = $state();

	/** The task's own space, whatever the list behind it shows. */
	const target: ItemTarget = $derived.by(() => {
		const [other] = data.space.others;
		const names = data.contextSpaces.find((space) => space.id === data.space.id)?.names;
		return {
			spaceId: data.space.id,
			kind: data.space.kind,
			partner: other && names ? { ...other, names } : null
		};
	});

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
<RouteSheet bind:this={sheet} label="Edit task" {listHref} {leave}>
	<TaskEditorBody taskForm={data.taskForm} task={data.task} {target} onsaved={() => sheet?.close()} />
</RouteSheet>
