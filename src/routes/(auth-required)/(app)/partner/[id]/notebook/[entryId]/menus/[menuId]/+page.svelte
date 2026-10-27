<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import SceneMenuPage from '$lib/components/notebook/SceneMenuPage.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * From the route, not the load: when access to the scene is withdrawn its
	 * load turns into a 404 while this component is still mounted, and the
	 * error's data has nothing for the links below to resolve.
	 */
	const partnershipId = $derived(page.params.id ?? '');

	const partner = $derived(data.partners.find((candidate) => candidate.id === partnershipId));
	// Opened on this device from the sealed names (invariant 12): never sent
	// with a cursor, never mapped here by hand.
	const name = $derived(partner ? partnerName(partner.names) : 'Your partner');

	const cursorLabel = (userId: string | null) =>
		userId === data.viewerId
			? { name: 'You, on another device', color: 'var(--wa-color-success-fill-loud)' }
			: { name, color: 'var(--wa-color-brand-fill-loud)' };
</script>

<SceneMenuPage
	entry={data.entry}
	menuId={data.menuId}
	partnerId={data.partnerId}
	room={data.room}
	viewerId={data.viewerId}
	sealScope={{ kind: 'partnership', partnershipId }}
	dependency={`notebook:entry:${data.entry.id}`}
	sceneHref={resolve('/(auth-required)/(app)/partner/[id]/notebook/[entryId]', {
		id: partnershipId,
		entryId: data.entry.id
	})}
	{cursorLabel}
	onGone={() =>
		goto(resolve('/(auth-required)/(app)/partner/[id]/notebook', { id: partnershipId }))}
/>
