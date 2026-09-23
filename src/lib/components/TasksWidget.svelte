<script lang="ts">
	import SectionWidget from '$lib/components/SectionWidget.svelte';
	import WidgetItems from '$lib/components/WidgetItems.svelte';
	import type { TasksWidgetView } from '$lib/types';

	let {
		tasks,
		href,
		title = 'Tasks'
	}: { tasks: TasksWidgetView; href: string; title?: string } = $props();

	const hidden = $derived(Math.max(0, tasks.readyCount - tasks.ready.length));
	const more = $derived.by(() => {
		if (hidden > 0) {
			return `and ${hidden} more ready`;
		}
		return tasks.waitingCount > 0 ? `${tasks.waitingCount} waiting on a schedule` : null;
	});

	/**
	 * Whether there is anything worth a line at all.
	 *
	 * When there is not, `body` is left off and the card is a header alone — no
	 * "Nothing to do right now.", which told a reader only what the missing list
	 * already had. A waiting count is not nothing: it says the tasks exist and
	 * are not due yet, which an absent list does not say.
	 */
	const hasBody = $derived(
		tasks.viewerActs ? tasks.ready.length > 0 || more !== null : tasks.activeCount > 0
	);
</script>

<SectionWidget {title} {href} icon="list-check" body={hasBody ? preview : undefined} />

{#snippet preview()}
	{#if tasks.viewerActs}
		<WidgetItems items={tasks.ready} {more} />
	{:else}
		<!--
			The managing side of a partnership does not complete these, so a "ready
			to complete" list would be somebody else's to-do list. What they set up
			is the useful number. The server withholds the titles entirely.
		-->
		<p class="summary">
			{tasks.activeCount}
			active task{tasks.activeCount === 1 ? '' : 's'} you manage
		</p>
	{/if}
{/snippet}

<style>
	.summary {
		margin: 0;
		color: var(--wa-color-text-quiet);
		font-size: 0.875rem;
	}
</style>
