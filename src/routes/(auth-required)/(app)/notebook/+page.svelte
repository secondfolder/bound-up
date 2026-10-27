<script lang="ts">
	import { resolve } from '$app/paths';
	import ContextSwitcher from '$lib/components/context/ContextSwitcher.svelte';
	import NotebookList from '$lib/components/notebook/NotebookList.svelte';
	import type { ContextSpaceView } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** The spaces the list shows, as the switcher knows them, in its order. */
	const shown = $derived(
		data.spaceIds.flatMap((id): ContextSpaceView[] => {
			const space = data.contextSpaces.find((candidate) => candidate.id === id);
			return space ? [space] : [];
		})
	);

	const header = {
		backHref: resolve('/(auth-required)/(app)/today'),
		backLabel: 'Back to Today',
		backText: 'Today'
	};
	const entryHref = (entryId: string) =>
		resolve('/(auth-required)/(app)/notebook/[entryId]', { entryId });
</script>

<NotebookList
	journal={data.journal}
	notes={data.notes}
	scenes={data.scenes}
	room={data.room}
	today={data.today}
	viewerId={data.viewerId}
	spaces={shown}
	dependency={data.dependency}
	{header}
	{entryHref}
>
	{#snippet corner()}
		<ContextSwitcher
			spaces={data.contextSpaces}
			context={data.context}
			you={data.user?.name ?? ''}
		/>
	{/snippet}
</NotebookList>
