<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import NotebookList from '$lib/components/notebook/NotebookList.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { NotebookEntryView } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * From the route, not the load: when access to an entry is withdrawn its
	 * load turns into a 404 while this component is still mounted, and the
	 * error's data has no `partnershipId` for the links below to resolve.
	 */
	const partnershipId = $derived(page.params.id ?? '');

	const partner = $derived(data.partners.find((candidate) => candidate.id === partnershipId));
	const name = $derived(partner ? partnerName(partner.names) : 'your partner');

	const header = $derived({
		backHref: resolve('/(auth-required)/(app)/partner/[id]', { id: partnershipId }),
		backLabel: `Back to ${name}`,
		backText: name,
		description: `A journal and notes you and ${name} share, and can write in together.`
	});
	const entryHref = (entryId: string) =>
		resolve('/(auth-required)/(app)/partner/[id]/notebook/[entryId]', {
			id: partnershipId,
			entryId
		});
	function describeEditor(userId: string | null): string | null {
		if (userId === null) {
			return null;
		}
		return userId === data.viewerId ? 'you' : name;
	}

	function accessNote(entry: NotebookEntryView): string | null {
		if (entry.partnerAccess === 'edit') {
			return null;
		}
		if (entry.access === 'read') {
			return 'Read only';
		}
		return entry.partnerAccess === 'read' ? `${name} can only read` : `Hidden from ${name}`;
	}
</script>

<NotebookList
	journal={data.journal}
	notes={data.notes}
	room={data.room}
	today={data.today}
	sealScope={{ kind: 'partnership', partnershipId }}
	dependency={`notebook:${partnershipId}`}
	{header}
	{entryHref}
	{describeEditor}
	{accessNote}
	showHiddenAction="?/show"
/>
