<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import SealedTaskEditor from '$lib/components/SealedTaskEditor.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const backHref = $derived(
		resolve('/(auth-required)/(app)/partner/[id]/tasks', { id: data.partner.id })
	);
	const timeZoneContext = $derived(
		page.data.user
			? {
					viewerUserId: page.data.user.id,
					viewerTimezone: page.data.user.timezone,
					counterpartUserId: data.partner.counterpartUserId,
					counterpartTimezone: data.partner.counterpartTimezone,
					counterpartName: data.partner.name
				}
			: null
	);
</script>

<section class="page">
	<NestedPageHeader
		{backHref}
		backLabel="Back to tasks"
		backText={data.partner.name}
		title="Add a partner task"
		description="This task belongs to the partnership and awards credits to whoever completes it."
	/>

	<div class="content">
		<SealedTaskEditor
			taskForm={data.taskForm}
			sealScope={{ kind: 'partnership', partnershipId: data.partner.id }}
			submitLabel="Add task"
			{timeZoneContext}
		/>
	</div>
</section>

<style>
	.page {
		max-width: 48rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.content {
		padding: 0 var(--wa-space-l) var(--wa-space-l);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
