<script lang="ts">
	import { resolve } from '$app/paths';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import SealedTaskEditor from '$lib/components/SealedTaskEditor.svelte';
	import type { TaskContent } from '$lib/sealed-kinds/tasks';
	import { openedTask } from '$lib/sealed-views.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const backHref = $derived(resolve('/(auth-required)/(app)/home/tasks'));
	const opened = $derived(openedTask(data.task));
	/**
	 * The content as first opened, held so the editor is mounted once: a save
	 * re-runs the load, and the new ciphertext reads as "still opening" for a
	 * moment, which would otherwise unmount the form and lose its state.
	 */
	let content = $state<TaskContent | null | undefined>(undefined);
	$effect(() => {
		if (content === undefined && opened !== undefined) {
			content = opened;
		}
	});
</script>

<section class="page">
	<NestedPageHeader
		{backHref}
		backLabel="Back to tasks"
		backText="Tasks"
		title="Edit self task"
		description="Update your task details, schedule, and reward credits here."
	/>

	<div class="content">
		{#if content === undefined}
			<p class="quiet">…</p>
		{:else if content === null}
			<p class="quiet">This task can't be shown on this device right now.</p>
		{:else}
			<SealedTaskEditor
				taskForm={data.taskForm}
				sealScope={{ kind: 'self' }}
				task={{ id: data.task.id, revision: data.task.revision, content }}
				submitLabel="Save task"
			/>
		{/if}
	</div>
</section>

<style>
	.page {
		max-width: var(--page-width);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.content {
		padding: 0 var(--page-gutter) var(--wa-space-l);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.quiet {
		color: var(--wa-color-text-quiet);
	}
</style>
