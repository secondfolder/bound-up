<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import NotebookEntryPage from '$lib/components/notebook/NotebookEntryPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** A solo entry's only other writer is you, on another device. */
	const cursorLabel = () => ({
		name: 'You, on another device',
		color: 'var(--wa-color-success-fill-loud)'
	});
	const describeUser = (userId: string | null) => (userId === data.viewerId ? 'You' : null);
</script>

<NotebookEntryPage
	entry={data.entry}
	room={data.room}
	viewerId={data.viewerId}
	sealScope={{ kind: 'self' }}
	dependency={`notebook:entry:${data.entry.id}`}
	back={{
		href: resolve('/(auth-required)/(app)/home/notebook'),
		label: 'Back to your notebook',
		text: 'Notebook'
	}}
	{describeUser}
	{cursorLabel}
	onGone={() => goto(resolve('/(auth-required)/(app)/home/notebook'))}
/>
