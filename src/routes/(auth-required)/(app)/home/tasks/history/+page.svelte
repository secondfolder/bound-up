<script lang="ts">
	import { resolve } from '$app/paths';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import TaskCompletionList from '$lib/components/TaskCompletionList.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const backHref = $derived(resolve('/(auth-required)/(app)/home/tasks'));
</script>

<section class="page">
	<NestedPageHeader
		{backHref}
		backLabel="Back to tasks"
		backText="Tasks"
		title="Your task history"
		description="Each completion keeps the title, credits, and message it had at the time."
	/>

	<!-- The list straight on the page, under no heading of its own: the page
	     title already says what it is, and a panel around the only list put
	     every entry in a card inside a card. -->
	<div class="content">
		<TaskCompletionList
			completions={data.selfTasks.completions}
			emptyMessage="Nothing completed yet."
		/>
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
