<script lang="ts">
	import { resolve } from '$app/paths';
	import NotebookList from '$lib/components/notebook/NotebookList.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const header = $derived({
		backHref: resolve('/(auth-required)/(app)/home'),
		backLabel: 'Back to home',
		backText: 'Home',
		description: 'Your own journal and notes, for nobody but you.'
	});
	const entryHref = (entryId: string) =>
		resolve('/(auth-required)/(app)/home/notebook/[entryId]', { entryId });
</script>

<NotebookList
	journal={data.journal}
	notes={data.notes}
	scenes={data.scenes}
	room={data.room}
	today={data.today}
	sealScope={{ kind: 'self' }}
	dependency="notebook:self"
	{header}
	{entryHref}
	describeEditor={() => null}
	accessNote={() => null}
/>
