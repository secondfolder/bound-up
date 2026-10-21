<script lang="ts">
	import { resolve } from '$app/paths';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import TaskCompletionList from '$lib/components/TaskCompletionList.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	/** What the viewer calls them, opened in the browser (`partner-names.svelte.ts`). */
	const partnerShown = $derived(partnerName(data.partner.names));
	const backHref = $derived(
		resolve('/(auth-required)/(app)/partner/[id]/tasks', { id: data.partner.id })
	);
</script>

<section class="page">
	<NestedPageHeader
		{backHref}
		backLabel="Back to tasks"
		backText="Tasks"
		title={`${partnerShown}'s task history`}
		description="Each completion keeps the title, credits, and message it had at the time."
	/>

	<!-- No heading or panel of its own: see /home/tasks/history. -->
	<div class="content">
		<TaskCompletionList completions={data.completions} emptyMessage="Nothing completed yet." />
	</div>
</section>

<style>
	.page {
		max-width: var(--page-width-narrow);
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
</style>
