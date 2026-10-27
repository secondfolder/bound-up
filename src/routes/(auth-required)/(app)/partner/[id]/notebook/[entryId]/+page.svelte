<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import NotebookEntryPage from '$lib/components/notebook/NotebookEntryPage.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * From the route, not the load: when access to an entry is withdrawn its
	 * load turns into a 404 while this component is still mounted, and the
	 * error's data has no `partnershipId` for the links below to resolve.
	 */
	const partnershipId = $derived(page.params.id ?? '');

	const partner = $derived(data.partners.find((candidate) => candidate.id === partnershipId));
	// Opened on this device from the sealed names (invariant 12): never sent
	// with a cursor, never mapped here by hand.
	const name = $derived(partner ? partnerName(partner.names) : 'Your partner');

	function describeUser(userId: string | null): string | null {
		if (userId === null) {
			return null;
		}
		return userId === data.viewerId ? 'You' : name;
	}

	const cursorLabel = (userId: string | null) =>
		userId === data.viewerId
			? { name: 'You, on another device', color: 'var(--wa-color-success-fill-loud)' }
			: { name, color: 'var(--wa-color-brand-fill-loud)' };

	const listHref = $derived(
		resolve('/(auth-required)/(app)/partner/[id]/notebook', { id: partnershipId })
	);
</script>

<NotebookEntryPage
	entry={data.entry}
	scene={data.scene}
	room={data.room}
	viewerId={data.viewerId}
	sealScope={{ kind: 'partnership', partnershipId }}
	dependency={`notebook:entry:${data.entry.id}`}
	back={{ href: listHref, label: `Back to the notebook you share with ${name}`, text: 'Notebook' }}
	{describeUser}
	{cursorLabel}
	partnerLabel={name}
	menuHref={(menuId) =>
		resolve('/(auth-required)/(app)/partner/[id]/notebook/[entryId]/menus/[menuId]', {
			id: partnershipId,
			entryId: data.entry.id,
			menuId
		})}
	onGone={() =>
		goto(resolve('/(auth-required)/(app)/partner/[id]/notebook', { id: partnershipId }))}
/>
