<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ForWhom from '$lib/components/ForWhom.svelte';
	import RouteSheet from '$lib/components/RouteSheet.svelte';
	import TaskEditorBody from '$lib/components/TaskEditorBody.svelte';
	import { itemTargets, partnerIn } from '$lib/item-pages.svelte';
	import type { ItemTarget } from '$lib/item-target';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const listHref = resolve('/(auth-required)/(app)/tasks');
	let sheet: RouteSheet | undefined = $state();

	/** Where it could go: each space the list shows that the viewer sets tasks in. */
	const targets = $derived(itemTargets(data.list.spaces, data.contextSpaces));
	let chosen = $state<ItemTarget | null>(null);
	const target = $derived(targets.length === 1 ? (targets[0] ?? null) : chosen);
	const forName = $derived(target ? partnerIn(target.spaceId, data.contextSpaces) : null);

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
<RouteSheet bind:this={sheet} label={forName ? `Add a task for ${forName}` : 'Add a task'} {listHref} {leave}>
	{#if targets.length > 1}
		<!-- Asked first, because the list shows more than one place it could go.
		     Remembered on this device. -->
		<ForWhom
			{targets}
			spaces={data.contextSpaces}
			storageKey="bound-up:tasks-for-whom"
			onchoose={(value) => {
				chosen = value;
			}}
		/>
	{/if}
	{#if target}
		<p class="intro">
			{forName
				? `This task is for ${forName} to complete, and adds its credits to their balance with you.`
				: 'This task belongs only to you and adds its credits to your own reward balance when you complete it.'}
		</p>
		<!-- Keyed on the space, so choosing someone else starts a fresh form. -->
		{#key target.spaceId}
			<TaskEditorBody taskForm={data.taskForm} {target} onsaved={() => sheet?.close()} />
		{/key}
	{/if}
</RouteSheet>

<style>
	.intro {
		margin: 0 0 var(--wa-space-m);
		color: var(--wa-color-text-quiet);
	}
</style>
