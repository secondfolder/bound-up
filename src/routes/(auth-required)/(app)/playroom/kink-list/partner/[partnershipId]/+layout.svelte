<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import type { AccountKinkList } from '$lib/kink-list/account-store.svelte';
	import { kinkListContext, setKinkListContext } from '$lib/kink-list/context';
	import { PartnerKinkList } from '$lib/kink-list/partner-store.svelte';
	import { partnerName } from '$lib/partner-names.svelte';
	import { PENDING_TEXT } from '$lib/sealed-views.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// The signed-in kink list's layout has opened your own list by the time
	// this renders; a partner's view is built on it.
	const parent = kinkListContext();
	const solo = parent.store as AccountKinkList;

	// Built once from the first load, like your own list's store: an
	// `invalidate()` must not replace it (AGENTS.md).
	// svelte-ignore state_referenced_locally
	const store = new PartnerKinkList(solo, data.partnershipId, data.mine, () =>
		partnerName(data.names)
	);
	// svelte-ignore state_referenced_locally
	const { partnershipId } = data;

	setKinkListContext({
		store,
		paths: {
			home: resolve('/(auth-required)/(app)/playroom/kink-list/partner/[partnershipId]', {
				partnershipId
			}),
			category: (category) =>
				resolve('/(auth-required)/(app)/playroom/kink-list/partner/[partnershipId]/[category]', {
					partnershipId,
					category
				}),
			// Quick fill and import work on your own list, which this view follows.
			quick: parent.paths.quick,
			transfer: parent.paths.transfer
		}
	});

	void store.open();

	onDestroy(() => {
		void store.flush();
	});
</script>

{#if store.state === 'ready'}
	{@render children()}
{:else if store.state === 'unreadable'}
	<h1>Kink list</h1>
	<p class="quiet">Your list for this partner can't be opened on this device. Reload to try again.</p>
{:else}
	<h1>Kink list</h1>
	<p class="quiet" aria-busy="true">{PENDING_TEXT}</p>
{/if}

<style>
	h1,
	.quiet {
		text-align: center;
	}

	.quiet {
		color: var(--wa-color-text-quiet);
	}
</style>
