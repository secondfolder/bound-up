<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import SealedTaskEditor from '$lib/components/SealedTaskEditor.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { TaskContent } from '$lib/sealed-kinds/tasks';
	import { openedTask } from '$lib/sealed-views.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	/** What the viewer calls them, opened in the browser (`partner-names.svelte.ts`). */
	const partnerShown = $derived(partnerName(data.partner.names));
	const backHref = $derived(
		resolve('/(auth-required)/(app)/partner/[id]/tasks', { id: data.partner.id })
	);
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
	const timeZoneContext = $derived(
		page.data.user
			? {
					viewerUserId: page.data.user.id,
					viewerTimezone: page.data.user.timezone,
					counterpartUserId: data.partner.counterpartUserId,
					counterpartTimezone: data.partner.counterpartTimezone,
					counterpartName: partnerShown
				}
			: null
	);
</script>

<section class="page">
	<NestedPageHeader
		{backHref}
		backLabel="Back to tasks"
		backText={partnerShown}
		title="Edit partner task"
		description="Update this partnership task, its schedule, and the credits it awards on completion."
	/>

	<div class="content">
		{#if content === undefined}
			<p class="quiet">…</p>
		{:else if content === null}
			<p class="quiet">This task can't be shown on this device right now.</p>
		{:else}
			<SealedTaskEditor
				taskForm={data.taskForm}
				sealScope={{ kind: 'partnership', partnershipId: data.partner.id }}
				task={{ id: data.task.id, revision: data.task.revision, content }}
				submitLabel="Save task"
				{timeZoneContext}
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
