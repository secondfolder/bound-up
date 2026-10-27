<script lang="ts">
	import SectionWidget from '$lib/components/SectionWidget.svelte';
	import WidgetItems from '$lib/components/WidgetItems.svelte';
	import type { AppContext } from '$lib/context';
	import { followInContext } from '$lib/context-client.svelte';
	import type { TasksWidgetView } from '$lib/types';

	/**
	 * The tasks card. `/tasks` shows whatever the context is, so following the
	 * card switches to the context it previews first — Everyone on /home, the
	 * partnership on its page — as the notebook's card does
	 * (`followInContext`, docs/contexts.md).
	 */
	let {
		tasks,
		href,
		opensIn,
		title = 'Tasks'
	}: { tasks: TasksWidgetView; href: string; opensIn: AppContext; title?: string } = $props();

	async function follow(event: MouseEvent) {
		await followInContext(event, opensIn, href);
	}

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

<SectionWidget
	{title}
	{href}
	icon="list-check"
	onfollow={follow}
	body={hasBody ? preview : undefined}
/>

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
