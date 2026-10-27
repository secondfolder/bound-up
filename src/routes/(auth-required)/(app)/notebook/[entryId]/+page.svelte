<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import SpaceChip from '$lib/components/context/SpaceChip.svelte';
	import NotebookEntryPage from '$lib/components/notebook/NotebookEntryPage.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { SealScope } from '$lib/sealed-forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * Everything here follows the entry's own space, never the context: an
	 * entry opened while the switcher says someone else shows as whoever's
	 * it is, with their name and the actions their partnership allows, and
	 * the context is left as it was. See docs/contexts.md.
	 */
	const partnershipId = $derived(data.space.partnershipId);
	const sealScope = $derived<SealScope>(
		partnershipId ? { kind: 'partnership', partnershipId } : { kind: 'self' }
	);
	const space = $derived(data.contextSpaces.find((candidate) => candidate.id === data.space.id));

	const partner = $derived(data.partners.find((candidate) => candidate.id === partnershipId));
	// Opened on this device from the sealed names (invariant 12): never sent
	// with a cursor, never mapped here by hand.
	const name = $derived(partner ? partnerName(partner.names) : 'Your partner');

	function describeUser(userId: string | null): string | null {
		if (userId === null) {
			return null;
		}
		if (userId === data.viewerId) {
			return 'You';
		}
		return partnershipId ? name : null;
	}

	const cursorLabel = (userId: string | null) =>
		userId === data.viewerId || !partnershipId
			? { name: 'You, on another device', color: 'var(--wa-color-success-fill-loud)' }
			: { name, color: 'var(--wa-color-brand-fill-loud)' };

	const listHref = resolve('/(auth-required)/(app)/notebook');
</script>

<NotebookEntryPage
	entry={data.entry}
	scene={data.scene}
	room={data.room}
	viewerId={data.viewerId}
	{sealScope}
	dependency={`notebook:entry:${data.entry.id}`}
	back={{ href: listHref, label: 'Back to the notebook', text: 'Notebook' }}
	{describeUser}
	{cursorLabel}
	partnerLabel={partnershipId ? name : null}
	menuHref={(menuId) =>
		resolve('/(auth-required)/(app)/notebook/[entryId]/menus/[menuId]', {
			entryId: data.entry.id,
			menuId
		})}
	onGone={() => goto(resolve('/(auth-required)/(app)/notebook'))}
>
	{#snippet whose()}
		{#if space}<SpaceChip {space} />{/if}
	{/snippet}
</NotebookEntryPage>
