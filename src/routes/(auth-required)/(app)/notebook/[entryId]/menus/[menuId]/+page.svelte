<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import SceneMenuPage from '$lib/components/notebook/SceneMenuPage.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import type { SealScope } from '$lib/sealed-forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** The scene's own space, never the context: see the entry's page. */
	const partnershipId = $derived(data.space.partnershipId);
	const sealScope = $derived<SealScope>(
		partnershipId ? { kind: 'partnership', partnershipId } : { kind: 'self' }
	);

	const partner = $derived(data.partners.find((candidate) => candidate.id === partnershipId));
	// Opened on this device from the sealed names (invariant 12): never sent
	// with a cursor, never mapped here by hand.
	const name = $derived(partner ? partnerName(partner.names) : 'Your partner');

	const cursorLabel = (userId: string | null) =>
		userId === data.viewerId || !partnershipId
			? { name: 'You, on another device', color: 'var(--wa-color-success-fill-loud)' }
			: { name, color: 'var(--wa-color-brand-fill-loud)' };
</script>

<SceneMenuPage
	entry={data.entry}
	menuId={data.menuId}
	partnerId={data.partnerId}
	room={data.room}
	viewerId={data.viewerId}
	{sealScope}
	dependency={`notebook:entry:${data.entry.id}`}
	sceneHref={resolve('/(auth-required)/(app)/notebook/[entryId]', { entryId: data.entry.id })}
	{cursorLabel}
	onGone={() => goto(resolve('/(auth-required)/(app)/notebook'))}
/>
