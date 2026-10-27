<script lang="ts">
	import RouteSheet from '$lib/components/RouteSheet.svelte';

	/** Test-only wrapper: `RouteSheet` takes its content as a snippet. */
	let { leave }: { leave: () => void } = $props();
	let sheet: RouteSheet | undefined = $state();

	export function close() {
		sheet?.close();
	}
</script>

<RouteSheet bind:this={sheet} label="Add a task" listHref="/tasks" {leave}>
	<p>The form</p>
</RouteSheet>
